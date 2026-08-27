const locationMap = {
  casa: {
    place: 'Casa Pisano',
    event: 'Casa Bowl Night',
    company: 'Casa Pisano',
    heroTitle: 'Velkommen til Casa Bowl Night',
    heroCopy: 'Casa Pisano<br />14. september 2026<br />20:00 - 02:00',
    guestName: 'Anna Jensen',
    bongs: '03',
    imageClass: 'place-casa',
    imageTag: 'Casa Pisano',
    imageDate: '14 Sep'
  },
  majorstua: {
    place: 'Spillbaren Majorstua',
    event: 'Majorstua Beer Quiz',
    company: 'Spillbaren Majorstua',
    heroTitle: 'Velkommen til Majorstua Beer Quiz',
    heroCopy: 'Spillbaren Majorstua<br />22. september 2026<br />18:00 - 23:00',
    guestName: 'Jonas Hauge',
    bongs: '02',
    imageClass: 'place-majorstua',
    imageTag: 'Majorstua',
    imageDate: '22 Sep'
  },
  barcode: {
    place: 'Spillbaren Barcode',
    event: 'Barcode Quiz Night',
    company: 'Spillbaren Barcode',
    heroTitle: 'Velkommen til Barcode Quiz Night',
    heroCopy: 'Spillbaren Barcode<br />23. september 2026<br />19:00 - 00:00',
    guestName: 'Mina Strand',
    bongs: '05',
    imageClass: 'place-barcode',
    imageTag: 'Barcode',
    imageDate: '23 Sep'
  },
  håndverkeren: {
    place: 'Håndverkeren',
    event: 'Håndverkeren Events',
    company: 'Håndverkeren',
    heroTitle: 'Velkommen til Håndverkeren Events',
    heroCopy: 'Håndverkeren<br />28. september 2026<br />20:00 - 01:00',
    guestName: 'Line Nord',
    bongs: '04',
    imageClass: 'place-handverkeren',
    imageTag: 'Håndverkeren',
    imageDate: '28 Sep'
  }
};

const placeSelect = document.getElementById('locationSelect');
const heroTitle = document.getElementById('heroTitle');
const heroCopy = document.getElementById('heroCopy');
const heroPlace = document.getElementById('placeKicker');
const guestName = document.getElementById('guestName');
const guestNameCard = document.getElementById('guestNameCard');
const companyName = document.getElementById('companyName');
const eventName = document.getElementById('eventName');
const bongText = document.getElementById('bongText');
const bongCount = document.getElementById('bongCount');
const placeName = document.getElementById('placeName');
const arrangementName = document.getElementById('arrangementName');
const imageTag = document.querySelector('.image-tag');
const imageDate = document.querySelector('.image-date');
const imageBackdrop = document.querySelector('.image-backdrop');
const adminCompany = document.getElementById('adminCompany');
const adminEvent = document.getElementById('adminEvent');
const adminLocation = document.getElementById('adminLocation');
const bongBarFill = document.getElementById('bongBarFill');

const guestBongs = {
  'Anna Jensen': 3,
  'Jonas Hauge': 2,
  'Mina Strand': 1
};

function updateBongDisplay(guestNameValue) {
  const amount = guestBongs[guestNameValue] || 0;
  const display = String(amount).padStart(2, '0');

  if (guestNameValue === 'Anna Jensen') {
    guestName.textContent = 'Anna Jensen';
    guestNameCard.textContent = 'Anna Jensen';
    bongText.textContent = String(amount);
    bongCount.textContent = display;
    const ratio = Math.max(5, Math.min(100, Math.round((amount / 3) * 100)));
    bongBarFill.style.width = ratio + '%';
  }

  document.getElementById('bongs-anna').textContent = String(guestBongs['Anna Jensen']).padStart(2, '0');
  document.getElementById('bongs-jonas').textContent = String(guestBongs['Jonas Hauge']).padStart(2, '0');
  document.getElementById('bongs-mina').textContent = String(guestBongs['Mina Strand']).padStart(2, '0');
}

function updateLocation(key) {
  const selected = locationMap[key] || locationMap.casa;

  heroTitle.textContent = selected.heroTitle;
  heroCopy.innerHTML = selected.heroCopy;
  heroPlace.textContent = selected.place;
  guestName.textContent = selected.guestName;
  guestNameCard.textContent = selected.guestName;
  companyName.textContent = selected.company;
  eventName.textContent = selected.event;
  bongText.textContent = selected.bongs;
  bongCount.textContent = selected.bongs;
  placeName.textContent = selected.place;
  arrangementName.textContent = selected.event;
  adminCompany.value = selected.company;
  adminLocation.value = selected.place;
  adminEvent.value = selected.event;
  imageTag.textContent = selected.imageTag;
  imageDate.textContent = selected.imageDate;

  const imageSites = {
    'casa': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
    'majorstua': 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80',
    'barcode': 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    'håndverkeren': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80'
  };

  imageBackdrop.style.backgroundImage = `linear-gradient(180deg, transparent, rgba(21,38,31,0.8)), url('${imageSites[key]}')`;
}

document.querySelectorAll('.bong-button').forEach((button) => {
  button.addEventListener('click', () => {
    const guest = button.dataset.guest;
    if (guestBongs[guest] > 0) {
      guestBongs[guest] -= 1;
      updateBongDisplay(guest);
    }
  });
});

placeSelect.addEventListener('change', (event) => {
  updateLocation(event.target.value);
});
