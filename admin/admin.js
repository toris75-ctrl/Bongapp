const state = { location: 'casa', admin: null };
const locationSelect = document.getElementById('location');
const loginMessage = document.getElementById('loginMessage');
const defaultUsernames = {
  casa: 'Casa', majorstua: 'Majorstua', barcode: 'Barcode', handverkeren: 'Håndverkeren', fabrikken: 'Fabrikken'
};

function message(element, text, error = false) { element.textContent = text; element.className = `message${error ? ' error' : ''}`; }

async function loadLocations() {
  const response = await fetch('/api/locations');
  const locations = await response.json();
  locationSelect.innerHTML = locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  document.getElementById('username').value = defaultUsernames[locationSelect.value] || '';
}

locationSelect.addEventListener('change', () => {
  document.getElementById('username').value = defaultUsernames[locationSelect.value] || '';
});

async function loadDashboard() {
  const eventQuery = document.getElementById('eventSelect').value;
  const response = await fetch(`/api/dashboard?location=${encodeURIComponent(state.location)}&event=${encodeURIComponent(eventQuery)}`);
  const data = await response.json();
  document.getElementById('guestCount').textContent = data.guestCount;
  document.getElementById('totalBongs').textContent = data.totalBongs;
  document.getElementById('eventName').textContent = data.event || '-';
  document.getElementById('companyName').value = data.location.companyName || data.location.name || '';
  document.getElementById('eventDetails').value = data.location.eventName || data.event || '';
  document.getElementById('guestList').innerHTML = data.guests.length ? data.guests.map((guest) => `<div class="guest-row"><div><strong>${guest.name}</strong><span>${guest.phone} · ${guest.birthYear}</span></div><div class="guest-actions"><b>${guest.bongs}</b><span class="muted">På gjestens UI</span></div></div>`).join('') : '<p class="muted">Ingen gjester registrert ennå.</p>';
}

async function loadEvents() {
  const response = await fetch(`/api/events?location=${encodeURIComponent(state.location)}`);
  const events = await response.json();
  const select = document.getElementById('eventSelect');
  select.innerHTML = events.map((event) => `<option value="${event.id}">${event.name}</option>`).join('');
  if (!events.length) select.innerHTML = '<option value="">Lag et event først</option>';
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
  if (data.mustChangePassword) {
    document.getElementById('credentialsPanel').hidden = false;
    return;
  }
  openDashboard();
});

function openDashboard() {
  document.getElementById('credentialsPanel').hidden = true;
  document.getElementById('dashboard').hidden = false;
  loadEvents().then(loadDashboard);
}

document.getElementById('eventSelect').addEventListener('change', loadDashboard);
document.getElementById('createEventButton').addEventListener('click', async () => {
  const name = document.getElementById('newEventName').value.trim();
  const response = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: state.location, name }) });
  const data = await response.json();
  if (!response.ok) { message(document.getElementById('importMessage'), data.message || 'Kunne ikke opprette event', true); return; }
  document.getElementById('newEventName').value = '';
  await loadEvents();
  document.getElementById('eventSelect').value = data.event.id;
  await loadDashboard();
  message(document.getElementById('importMessage'), `Eventet «${data.event.name}» er opprettet`);
});

document.getElementById('credentialsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const newPassword = document.getElementById('newPassword').value;
  if (newPassword !== document.getElementById('confirmPassword').value) {
    message(document.getElementById('credentialsMessage'), 'Passordene er ikke like', true);
    return;
  }
  const response = await fetch('/api/admin/change-credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentUsername: state.admin.username, currentPassword: document.getElementById('password').value, newPassword }) });
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
  const response = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, location: state.location, company: document.getElementById('companyName').value || locationName, event: document.getElementById('eventSelect').selectedOptions[0]?.text || document.getElementById('eventName').textContent }) });
  const data = await response.json();
  message(document.getElementById('importMessage'), response.ok ? `${data.imported} gjester importert` : (data.message || 'Import feilet'), !response.ok);
  if (response.ok) loadDashboard();
});

document.getElementById('locationSettingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch('/api/location-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: state.location, company: document.getElementById('companyName').value, event: document.getElementById('eventDetails').value })
  });
  const data = await response.json();
  message(document.getElementById('settingsMessage'), response.ok ? 'Informasjonen er lagret' : (data.message || 'Kunne ikke lagre informasjon'), !response.ok);
  if (response.ok) loadDashboard();
});

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    message(document.getElementById('importMessage'), 'Velg en .xlsx-fil', true);
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    const response = await fetch('/api/import-xlsx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: base64, location: state.location, eventId: document.getElementById('eventSelect').value })
    });
    const data = await response.json();
    message(document.getElementById('importMessage'), response.ok ? `${data.imported} gjester importert fra Excel` : (data.message || 'Excel-import feilet'), !response.ok);
    if (response.ok) loadDashboard();
  };
  reader.readAsDataURL(file);
});
document.getElementById('refreshButton').addEventListener('click', loadDashboard);
loadLocations().catch(() => message(loginMessage, 'Kunne ikke hente steder', true));
