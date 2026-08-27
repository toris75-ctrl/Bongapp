const loginPanel = document.getElementById('loginPanel');
const accountPanel = document.getElementById('accountPanel');
const loginForm = document.getElementById('guestLoginForm');
const loginMessage = document.getElementById('loginMessage');
let guestSession = null;
let refreshTimer = null;

function showMessage(text, error = false) {
  loginMessage.textContent = text;
  loginMessage.className = `message${error ? ' error' : ''}`;
}

function renderGuest(guest) {
  document.getElementById('eventName').textContent = guest.event || 'Arrangement';
  document.getElementById('guestName').textContent = guest.name;
  document.getElementById('locationName').textContent = `${guest.company} · ${guest.location}`;
  document.getElementById('bongCount').textContent = guest.bongs;
  document.getElementById('bongMeter').style.width = `${Math.min(100, Math.max(0, guest.bongs * 20))}%`;
  document.getElementById('updatedAt').textContent = `Sist oppdatert ${new Date().toLocaleTimeString('no-NO')}`;
}

async function refreshGuest() {
  if (!guestSession) return;
  const response = await fetch(`/api/guests?location=${encodeURIComponent(guestSession.locationId)}`);
  if (!response.ok) return;
  const guests = await response.json();
  const current = guests.find((guest) => guest.id === guestSession.id);
  if (current) renderGuest({ ...guestSession, ...current });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('Logger inn ...');
  const payload = {
    location: document.getElementById('location').value,
    phone: document.getElementById('phone').value,
    birthYear: document.getElementById('birthYear').value
  };
  try {
    const response = await fetch('/api/guest/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Kunne ikke logge inn');
    guestSession = data.guest;
    loginPanel.hidden = true;
    accountPanel.hidden = false;
    renderGuest(guestSession);
    refreshTimer = setInterval(refreshGuest, 5000);
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  guestSession = null;
  clearInterval(refreshTimer);
  accountPanel.hidden = true;
  loginPanel.hidden = false;
  loginForm.reset();
  showMessage('');
});
