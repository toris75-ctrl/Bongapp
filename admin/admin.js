const state = { location: 'casa', admin: null };
const locationSelect = document.getElementById('location');
const loginMessage = document.getElementById('loginMessage');

function message(element, text, error = false) { element.textContent = text; element.className = `message${error ? ' error' : ''}`; }

async function loadLocations() {
  const response = await fetch('/api/locations');
  const locations = await response.json();
  locationSelect.innerHTML = locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
}

async function loadDashboard() {
  const response = await fetch(`/api/dashboard?location=${encodeURIComponent(state.location)}`);
  const data = await response.json();
  document.getElementById('guestCount').textContent = data.guestCount;
  document.getElementById('totalBongs').textContent = data.totalBongs;
  document.getElementById('eventName').textContent = data.event || '-';
  document.getElementById('guestList').innerHTML = data.guests.length ? data.guests.map((guest) => `<div class="guest-row"><div><strong>${guest.name}</strong><span>${guest.phone} · ${guest.birthYear}</span></div><div class="guest-actions"><b>${guest.bongs}</b><button data-guest-id="${guest.id}" type="button">Sveip bong</button></div></div>`).join('') : '<p class="muted">Ingen gjester registrert ennå.</p>';
  document.querySelectorAll('[data-guest-id]').forEach((button) => button.addEventListener('click', () => swipe(button.dataset.guestId, button)));
}

async function swipe(guestId, button) {
  button.disabled = true;
  const response = await fetch('/api/swipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestId, location: state.location }) });
  const data = await response.json();
  button.disabled = false;
  if (response.ok) loadDashboard();
  else alert(data.message || 'Kunne ikke sveipe');
}

document.getElementById('adminLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); message(loginMessage, 'Logger inn ...');
  state.location = locationSelect.value;
  const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value, locationName: locationSelect.options[locationSelect.selectedIndex].text }) });
  const data = await response.json();
  if (!response.ok) { message(loginMessage, data.message || 'Feil innlogging', true); return; }
  state.admin = data.admin;
  document.getElementById('adminIdentity').textContent = state.admin.username;
  document.getElementById('loginPanel').hidden = true;
  if (data.mustChangeCredentials) {
    document.getElementById('newUsername').value = state.admin.username;
    document.getElementById('credentialsPanel').hidden = false;
    return;
  }
  openDashboard();
});

function openDashboard() {
  document.getElementById('credentialsPanel').hidden = true;
  document.getElementById('dashboard').hidden = false;
  loadDashboard();
}

document.getElementById('credentialsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const newPassword = document.getElementById('newPassword').value;
  if (newPassword !== document.getElementById('confirmPassword').value) {
    message(document.getElementById('credentialsMessage'), 'Passordene er ikke like', true);
    return;
  }
  const response = await fetch('/api/admin/change-credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentUsername: state.admin.username, currentPassword: document.getElementById('password').value, newUsername: document.getElementById('newUsername').value, newPassword }) });
  const data = await response.json();
  if (!response.ok) { message(document.getElementById('credentialsMessage'), data.message || 'Kunne ikke lagre innlogging', true); return; }
  state.admin = data.admin;
  document.getElementById('adminIdentity').textContent = state.admin.username;
  message(document.getElementById('credentialsMessage'), 'Innloggingen er oppdatert');
  openDashboard();
});

document.getElementById('importButton').addEventListener('click', async () => {
  const rows = document.getElementById('guestRows').value.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  const locationName = locationSelect.options[locationSelect.selectedIndex].text;
  const response = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, location: state.location, company: locationName, event: document.getElementById('eventName').textContent }) });
  const data = await response.json();
  message(document.getElementById('importMessage'), response.ok ? `${data.imported} gjester importert` : (data.message || 'Import feilet'), !response.ok);
  if (response.ok) loadDashboard();
});

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) file.text().then((text) => { document.getElementById('guestRows').value = text; });
});
document.getElementById('refreshButton').addEventListener('click', loadDashboard);
loadLocations().catch(() => message(loginMessage, 'Kunne ikke hente steder', true));
