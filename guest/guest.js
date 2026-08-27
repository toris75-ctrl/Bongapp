const loginPanel = document.getElementById('loginPanel');
const accountPanel = document.getElementById('accountPanel');
const loginForm = document.getElementById('guestLoginForm');
const loginMessage = document.getElementById('loginMessage');
let guestSession = null;
let refreshTimer = null;
let locations = [];
let swipeStartX = 0;
let swipePosition = 0;
let swiping = false;

function renderVenue(location) {
  if (!location) return;
  document.getElementById('venueTitle').textContent = location.name;
  document.getElementById('venueDescription').textContent = location.eventName || 'Logg inn for å se hva du har igjen.';
  const image = document.getElementById('venueImage');
  image.src = location.image || '';
  image.alt = location.name;
  document.documentElement.style.setProperty('--venue-accent', location.accent || '#b45f3d');
}

async function loadLocations() {
  const response = await fetch('/api/locations');
  locations = await response.json();
  const requestedLocation = new URLSearchParams(window.location.search).get('location');
  const selectedLocation = locations.find((location) => location.id === requestedLocation) || locations[0];
  document.getElementById('location').value = selectedLocation.id;
  renderVenue(selectedLocation);
}

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
  const swipeButton = document.getElementById('swipeButton');
  swipeButton.disabled = guest.bongs <= 0;
  swipeButton.textContent = guest.bongs > 0 ? '>>' : 'X';
  resetSwipe();
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

function resetSwipe() {
  swipePosition = 0;
  document.getElementById('swipeButton').style.transform = 'translateX(0)';
}

async function useBongAfterSwipe() {
  if (!guestSession || guestSession.bongs <= 0) return;
  const swipeButton = document.getElementById('swipeButton');
  const swipeMessage = document.getElementById('swipeMessage');
  swipeButton.disabled = true;
  swipeMessage.textContent = 'Sveiper ...';
  try {
    const response = await fetch('/api/swipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId: guestSession.id, location: guestSession.locationId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Kunne ikke sveipe bong');
    guestSession = { ...guestSession, ...data.guest };
    renderGuest(guestSession);
    swipeMessage.textContent = data.remaining > 0 ? 'Bongen er brukt.' : 'Alle bongene er brukt.';
  } catch (error) {
    swipeButton.disabled = false;
    swipeMessage.textContent = error.message;
    swipeMessage.className = 'message error';
  }
}

const swipeTrack = document.getElementById('swipeTrack');
const swipeHandle = document.getElementById('swipeButton');
swipeHandle.addEventListener('pointerdown', (event) => {
  if (swipeHandle.disabled) return;
  swiping = true;
  swipeStartX = event.clientX - swipePosition;
  swipeHandle.setPointerCapture(event.pointerId);
});
swipeHandle.addEventListener('pointermove', (event) => {
  if (!swiping) return;
  const max = swipeTrack.clientWidth - swipeHandle.offsetWidth - 8;
  swipePosition = Math.max(0, Math.min(max, event.clientX - swipeStartX));
  swipeHandle.style.transform = `translateX(${swipePosition}px)`;
});
swipeHandle.addEventListener('pointerup', async (event) => {
  if (!swiping) return;
  swiping = false;
  const max = swipeTrack.clientWidth - swipeHandle.offsetWidth - 8;
  if (swipePosition >= max * 0.82) {
    swipeHandle.style.transform = `translateX(${max}px)`;
    await useBongAfterSwipe();
  } else {
    resetSwipe();
  }
  swipeHandle.releasePointerCapture(event.pointerId);
});
swipeHandle.addEventListener('pointercancel', () => { swiping = false; resetSwipe(); });

document.getElementById('logoutButton').addEventListener('click', () => {
  guestSession = null;
  clearInterval(refreshTimer);
  accountPanel.hidden = true;
  loginPanel.hidden = false;
  loginForm.reset();
  showMessage('');
  document.getElementById('swipeMessage').textContent = '';
});

loadLocations().catch(() => showMessage('Kunne ikke hente stedene', true));
