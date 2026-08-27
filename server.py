import json
import os
import mimetypes
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"


def load_data():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {"locations": [], "adminUsers": [], "guests": []}


def save_data(data):
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


class BongHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/locations":
            self.send_json(200, load_data()["locations"])
            return

        if path == "/api/dashboard":
            location_id = (query.get("location") or ["casa"])[0]
            data = load_data()
            location = next((x for x in data["locations"] if x["id"] == location_id), data["locations"][0])
            guests = [g for g in data["guests"] if g.get("location") == location_id]
            payload = {
                "location": location,
                "event": location.get("eventName"),
                "guests": guests,
                "guestCount": len(guests),
                "totalBongs": sum(g.get("bongs", 0) for g in guests)
            }
            self.send_json(200, payload)
            return

        if path == "/api/guests":
            location_id = (query.get("location") or ["casa"])[0]
            data = load_data()
            guests = [g for g in data["guests"] if g.get("location") == location_id]
            self.send_json(200, guests)
            return

        # Serve files for normal web paths.
        self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/admin/login":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            try:
                payload = json.loads(body)
            except Exception:
                self.send_json(400, {"ok": False, "message": "Invalid JSON"})
                return

            username = (payload.get("username") or "").strip()
            password = (payload.get("password") or "").strip()
            locationName = (payload.get("locationName") or "").strip()
            data = load_data()
            admin = next((u for u in data["adminUsers"] if u["username"] == username and u["password"] == password), None)
            if not admin:
                self.send_json(401, {"ok": False, "message": "Invalid admin login"})
                return
            if locationName and admin.get("locationName") != locationName:
                self.send_json(401, {"ok": False, "message": "Admin does not belong to that location"})
                return

            self.send_json(200, {"ok": True, "admin": {"username": admin["username"], "role": admin.get("role"), "locationName": admin.get("locationName")}})
            return

        if path == "/api/guest/login":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            print("GUEST_LOGIN_RAW", body)
            try:
                payload = json.loads(body)
            except Exception as exc:
                print("GUEST_LOGIN_JSON_ERROR", str(exc))
                self.send_json(400, {"ok": False, "message": "Invalid JSON"})
                return

            phone = (payload.get("phone") or "").strip()
            birthYear = str(payload.get("birthYear") or "").strip()
            location = (payload.get("location") or "casa").strip()
            data = load_data()
            guest = next((g for g in data["guests"] if g.get("phone") == phone and str(g.get("birthYear")) == birthYear and g.get("location") == location), None)

            if not guest:
                self.send_json(401, {"ok": False, "message": "Invalid guest login"})
                return

            location_data = next((l for l in data["locations"] if l["id"] == location), data["locations"][0])
            guest_payload = {
                "ok": True,
                "guest": {
                    "id": guest.get("id"),
                    "name": guest.get("name"),
                    "company": guest.get("company"),
                    "location": location_data.get("name"),
                    "locationId": location,
                    "event": guest.get("event") or location_data.get("eventName"),
                    "bongs": guest.get("bongs"),
                    "phone": guest.get("phone"),
                    "birthYear": guest.get("birthYear")
                }
            }
            self.send_json(200, guest_payload)
            return

        if path == "/api/swipe":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            try:
                payload = json.loads(body)
            except Exception:
                self.send_json(400, {"ok": False, "message": "Invalid JSON"})
                return

            guest_id = payload.get("guestId")
            location = payload.get("location") or "casa"
            data = load_data()
            guest = next((g for g in data["guests"] if g.get("id") == guest_id and g.get("location") == location), None)
            if not guest:
                self.send_json(404, {"ok": False, "message": "Guest not found"})
                return
            if guest.get("bongs", 0) <= 0:
                self.send_json(200, {"ok": True, "guest": guest, "remaining": 0, "message": "No bongs left"})
                return

            guest["bongs"] = max(0, guest.get("bongs", 0) - 1)
            save_data(data)
            self.send_json(200, {"ok": True, "guest": guest, "remaining": guest.get("bongs", 0), "message": "Bong used"})
            return

        if path == "/api/import":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            try:
                payload = json.loads(body)
            except Exception:
                self.send_json(400, {"ok": False, "message": "Invalid JSON"})
                return
            # Simple Excel import mapping from admin UI rows by copy-paste key-value format
            # Here interpret name / phone / birthYear / bongs if given.
            rows = []
            for line in (payload.get("rows") or []):
                parts = [p.strip() for p in str(line).split("/")]
                if len(parts) >= 4:
                    guest = {
                        "id": f"guest-{len(load_data()['guests']) + len(rows) + 1}",
                        "name": parts[0],
                        "phone": parts[1],
                        "birthYear": parts[2],
                        "company": payload.get("company") or "Casa Pisano",
                        "location": payload.get("location") or "casa",
                        "bongs": int(parts[3]),
                        "event": payload.get("event") or "Casa Bowl Night"
                    }
                    rows.append(guest)

            data = load_data()
            data["guests"].extend(rows)
            save_data(data)
            self.send_json(200, {"ok": True, "imported": len(rows)})
            return

        self.send_error(404, "Not found")

    def serve_static(self, path):
        if path.startswith("/api/"):
            self.send_error(404, "Not found")
            return
        if path == "/favicon.ico":
            svg_path = BASE_DIR / "favicon.svg"
            if svg_path.is_file():
                body = svg_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_error(404, "Not found")
            return
        if path.startswith("/bongapp/"):
            path = path.replace("/bongapp/", "/", 1)
        if path in ("", "/"):
            path = "/guest/index.html"
        # Normalize and prevent traversal
        requested = path.lstrip("/")
        abs_path = (BASE_DIR / requested).resolve()
        if BASE_DIR not in abs_path.parents and abs_path != BASE_DIR:
            self.send_error(403, "Forbidden")
            return
        if abs_path.is_dir():
            abs_path = abs_path / "index.html"
        if abs_path.is_file():
            body = abs_path.read_bytes()
            ctype = mimetypes.guess_type(str(abs_path))[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404, "Not found")

    def send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 8080))
    try:
        server = ThreadingHTTPServer((host, port), BongHandler)
        print(f"BongFlow server running at http://{host}:{port}")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
