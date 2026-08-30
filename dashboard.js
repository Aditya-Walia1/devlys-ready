import QRCode from 'qrcode';

const loading = document.getElementById('dashboardLoading');
const auth = document.getElementById('dashboardAuth');
const content = document.getElementById('dashboardContent');
const errorPanel = document.getElementById('dashboardError');
const errorMessage = document.getElementById('dashboardErrorMessage');
const signOutLink = document.getElementById('signOutLink');
const title = document.getElementById('dashboardTitle');
const subtitle = document.getElementById('dashboardSubtitle');
const scans = document.getElementById('metricScans');
const drafts = document.getElementById('metricDrafts');
const handoffs = document.getElementById('metricHandoffs');
const conversion = document.getElementById('metricConversion');
const locationCount = document.getElementById('locationCount');
const locationsGrid = document.getElementById('locationsGrid');
const empty = document.getElementById('dashboardEmpty');
const formCard = document.getElementById('locationFormCard');
const form = document.getElementById('locationForm');
const formStatus = document.getElementById('locationFormStatus');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestError = new Error(payload.error || 'Please try again.');
    requestError.status = response.status;
    throw requestError;
  }
  return payload;
}

function showLocationForm() {
  formCard.hidden = false;
  formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.querySelector('input')?.focus();
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = 'Copied ✓';
    window.setTimeout(() => { button.textContent = original; }, 1400);
  } catch {
    window.prompt('Copy this URL:', text);
  }
}

async function createLocationCard(location) {
  const card = document.createElement('article');
  card.className = 'location-card';

  const header = document.createElement('div');
  header.className = 'location-card-header';
  const marker = document.createElement('span');
  marker.className = 'location-color';
  marker.style.background = location.brandColor;
  const heading = document.createElement('div');
  const name = document.createElement('h3');
  name.textContent = location.name;
  const address = document.createElement('p');
  address.textContent = location.address;
  heading.append(name, address);
  header.append(marker, heading);

  const body = document.createElement('div');
  body.className = 'location-card-body';
  const qrImage = document.createElement('img');
  qrImage.alt = `QR code for ${location.name}`;
  qrImage.width = 152;
  qrImage.height = 152;
  const qrDataUrl = await QRCode.toDataURL(location.reviewUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 500,
    color: { dark: '#111827', light: '#ffffff' },
  });
  qrImage.src = qrDataUrl;

  const stats = document.createElement('div');
  stats.className = 'location-mini-stats';
  [['Scans', location.scans], ['Drafts', location.drafts], ['Google', location.handoffs]]
    .forEach(([label, value]) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = String(value);
      const span = document.createElement('span');
      span.textContent = label;
      item.append(strong, span);
      stats.append(item);
    });
  body.append(qrImage, stats);

  const urlRow = document.createElement('div');
  urlRow.className = 'location-url-row';
  const urlText = document.createElement('span');
  urlText.textContent = location.reviewUrl;
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'Copy URL';
  copyButton.addEventListener('click', () => copyText(location.reviewUrl, copyButton));
  urlRow.append(urlText, copyButton);

  const actions = document.createElement('div');
  actions.className = 'location-actions';
  const openLink = document.createElement('a');
  openLink.href = location.reviewUrl;
  openLink.target = '_blank';
  openLink.rel = 'noopener';
  openLink.textContent = 'Open customer page ↗';
  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = 'Download QR';
  downloadButton.addEventListener('click', () => {
    downloadDataUrl(qrDataUrl, `${location.slug}-review-qr.png`);
  });
  actions.append(openLink, downloadButton);

  card.append(header, body, urlRow, actions);
  return card;
}

async function renderDashboard(data) {
  title.textContent = data.business ? `${data.business.name} reviews` : 'Review operations';
  subtitle.textContent = data.business?.email
    ? `Signed in as ${data.business.email}`
    : 'Create your first location to begin.';
  scans.textContent = String(data.totals.scans);
  drafts.textContent = String(data.totals.drafts);
  handoffs.textContent = String(data.totals.handoffs);
  conversion.textContent = data.totals.scans
    ? `${Math.round((data.totals.handoffs / data.totals.scans) * 100)}%`
    : '0%';
  locationCount.textContent = `${data.locations.length} ${data.locations.length === 1 ? 'location' : 'locations'}`;
  locationsGrid.replaceChildren();
  empty.hidden = data.locations.length > 0;

  const cards = await Promise.all(data.locations.map(createLocationCard));
  locationsGrid.append(...cards);
}

async function loadDashboard() {
  try {
    await api('/api/me');
  } catch (requestError) {
    loading.hidden = true;
    if (requestError.status === 401) {
      auth.hidden = false;
      return;
    }
    throw requestError;
  }

  const data = await api('/api/dashboard');
  await renderDashboard(data);
  loading.hidden = true;
  signOutLink.hidden = false;
  content.hidden = false;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const values = new FormData(form);
  submit.disabled = true;
  submit.textContent = 'Creating location…';
  formStatus.textContent = '';
  try {
    await api('/api/locations', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(values.entries())),
    });
    form.reset();
    form.querySelector('input[type="color"]').value = '#315efb';
    formCard.hidden = true;
    const data = await api('/api/dashboard');
    await renderDashboard(data);
  } catch (requestError) {
    formStatus.textContent = requestError.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Create location and QR';
  }
});

document.getElementById('showLocationForm')?.addEventListener('click', showLocationForm);
document.getElementById('emptyAddLocation')?.addEventListener('click', showLocationForm);
document.getElementById('hideLocationForm')?.addEventListener('click', () => {
  formCard.hidden = true;
});

loadDashboard().catch((requestError) => {
  loading.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = requestError.message;
});
