import json
import os
import mimetypes
import base64
import io
import re
import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
FIXED_LOCATIONS = {
    "handverkeren": ("Håndverkeren", "Håndverkeren"),
    "casa": ("Casa Pisano", "Casa"),
    "barcode": ("Spillbaren Barcode", "Barcode"),
    "majorstua": ("Spillbaren Majorstua", "Majorstua"),
    "fabrikken": ("Fabrikken", "Fabrikken")
}


def load_data():
    if DATA_FILE.exists():
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    else:
        data = {"locations": [], "adminUsers": [], "guests": []}
    normalize_fixed_accounts(data)
    return data


def save_data(data):
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_phone(value):
    digits = re.sub(r"\D", "", str(value))
    return digits[-8:] if len(digits) >= 8 else digits


def reset_guests():
    data = load_data()
    changed = False
    for guest in data["guests"]:
        if guest.get("bongs", 0) != 0 or guest.get("phone"):
            guest["bongs"] = 0
            guest["phone"] = ""
            changed = True
    if changed:
        save_data(data)


def daily_reset_loop():
    oslo = ZoneInfo("Europe/Oslo")
    while True:
        now = datetime.now(oslo)
        next_reset = now.replace(hour=6, minute=0, second=0, microsecond=0)
        if now >= next_reset:
            next_reset += timedelta(days=1)
        time.sleep(max(1, (next_reset - now).total_seconds()))
        reset_guests()


def normalize_fixed_accounts(data):
    existing = {user.get("locationName"): user for user in data["adminUsers"]}
    for location_id, (location_name, username) in FIXED_LOCATIONS.items():
        user = existing.get(location_name)
        if user:
            user["username"] = username
        else:
            data["adminUsers"].append({"id": f"admin-{location_id}", "username": username, "password": "1234", "locationName": location_name, "role": "admin", "mustChangePassword": True})


def parse_xlsx(content):
    namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    with zipfile.ZipFile(io.BytesIO(content)) as workbook:
        shared = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", namespace):
                shared.append("".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")))

        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in sheet.findall(".//main:sheetData/main:row", namespace):
            values = {}
            for cell in row.findall("main:c", namespace):
                reference = cell.get("r", "A1")
                column = re.sub(r"\d", "", reference)
                value = cell.find("main:v", namespace)
                inline = cell.find("main:is", namespace)
                text = "" if value is None else value.text or ""
                if cell.get("t") == "s" and text:
                    text = shared[int(text)]
                elif cell.get("t") == "inlineStr" and inline is not None:
                    text = "".join(node.text or "" for node in inline.iter() if node.tag.endswith("}t"))
                values[column] = text.strip()
            if values:
                rows.append(values)
        if not rows:
            return []

        headers = {value.lower().strip(): key for key, value in rows[0].items()}
        aliases = {
            "name": ("navn", "name", "gjest"),
            "phone": ("telefon", "telefonnummer", "phone", "mobil"),
            "birthYear": ("fødselsår", "fodselsar", "birthyear", "birth year"),
            "bongs": ("bonger", "bong", "bongs", "antall bonger")
        }
        columns = {field: next((headers[alias] for alias in names if alias in headers), None) for field, names in aliases.items()}
        if not all(columns.values()):
            raise ValueError("Excel-filen må ha kolonnene Navn, Telefon, Fødselsår og Bonger")
        return [{field: row.get(column, "").strip() for field, column in columns.items()} for row in rows[1:] if row.get(columns["name"], "").strip()]


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

            self.send_json(200, {"ok": True, "mustChangePassword": admin.get("mustChangePassword", admin.get("mustChangeCredentials", True)), "admin": {"username": admin["username"], "role": admin.get("role"), "locationName": admin.get("locationName")}})
            return

        if path == "/api/admin/change-credentials":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            try:
                payload = json.loads(body)
            except Exception:
                self.send_json(400, {"ok": False, "message": "Invalid JSON"})
                return

            current_username = (payload.get("currentUsername") or "").strip()
            current_password = (payload.get("currentPassword") or "").strip()
            new_password = (payload.get("newPassword") or "").strip()
            if len(new_password) < 8:
                self.send_json(400, {"ok": False, "message": "Passordet må ha minst 8 tegn"})
                return

            data = load_data()
            admin = next((u for u in data["adminUsers"] if u.get("username") == current_username and u.get("password") == current_password), None)
            if not admin:
                self.send_json(401, {"ok": False, "message": "Gammel innlogging er ikke korrekt"})
                return
            if not admin.get("mustChangePassword", admin.get("mustChangeCredentials", True)):
                self.send_json(403, {"ok": False, "message": "Passordet kan bare endres ved første innlogging"})
                return

            admin["password"] = new_password
            admin["mustChangePassword"] = False
            admin.pop("mustChangeCredentials", None)
            save_data(data)
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

            phone = normalize_phone(payload.get("phone") or "")
            birthYear = str(payload.get("birthYear") or "").strip()
            location = (payload.get("location") or "").strip()
            data = load_data()
            guest = next((g for g in data["guests"] if normalize_phone(g.get("phone", "")) == phone and str(g.get("birthYear")) == birthYear and (not location or g.get("location") == location)), None)

            if not guest:
                self.send_json(401, {"ok": False, "message": "Invalid guest login"})
                return

            location = guest.get("location")
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

        if path == "/api/import-xlsx":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            try:
                payload = json.loads(body)
                content = base64.b64decode(payload.get("file", ""), validate=True)
                rows = parse_xlsx(content)
                data = load_data()
                location = payload.get("location") or "casa"
                location_data = next((item for item in data["locations"] if item["id"] == location), data["locations"][0])
                start_id = len(data["guests"])
                for index, row in enumerate(rows, start=1):
                    data["guests"].append({
                        "id": f"guest-{start_id + index}", "name": row["name"], "phone": row["phone"],
                        "birthYear": row["birthYear"], "company": location_data.get("companyName", location_data["name"]), "location": location,
                        "bongs": int(float(row["bongs"])), "event": location_data.get("eventName")
                    })
                save_data(data)
                self.send_json(200, {"ok": True, "imported": len(rows)})
            except (ValueError, KeyError, zipfile.BadZipFile, ET.ParseError, base64.binascii.Error) as exc:
                self.send_json(400, {"ok": False, "message": str(exc)})
            return

        if path == "/api/location-settings":
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size).decode("utf-8")
            try:
                payload = json.loads(body)
                data = load_data()
                location_id = (payload.get("location") or "").strip()
                location = next((item for item in data["locations"] if item["id"] == location_id), None)
                company = (payload.get("company") or "").strip()
                event = (payload.get("event") or "").strip()
                if not location or not company or not event:
                    raise ValueError("Sted, firmanavn og arrangement må fylles ut")
                location["companyName"] = company
                location["eventName"] = event
                for guest in data["guests"]:
                    if guest.get("location") == location_id:
                        guest["company"] = company
                        guest["event"] = event
                save_data(data)
                self.send_json(200, {"ok": True, "location": location})
            except (ValueError, KeyError, json.JSONDecodeError) as exc:
                self.send_json(400, {"ok": False, "message": str(exc)})
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
        threading.Thread(target=daily_reset_loop, daemon=True).start()
        server = ThreadingHTTPServer((host, port), BongHandler)
        print(f"BongFlow server running at http://{host}:{port}")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
