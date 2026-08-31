import QRCode from 'qrcode';

const loading = document.getElementById('dashboardLoading');
const authPanel = document.getElementById('dashboardAuth');
const unassignedPanel = document.getElementById('dashboardUnassigned');
const adminContent = document.getElementById('adminContent');
const clientContent = document.getElementById('clientContent');
const errorPanel = document.getElementById('dashboardError');
const errorMessage = document.getElementById('dashboardErrorMessage');
const signOutLink = document.getElementById('signOutLink');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The review service returned an unexpected response.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestError = new Error(payload.error || 'Please try again.');
    requestError.status = response.status;
    throw requestError;
  }
  return payload;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function money(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Number(paise || 0) / 100);
}

function displayDate(value) {
  if (!value) return 'Not active yet';
  const date = new Date(value.endsWith?.('Z') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function planName(value) {
  return ({ starter: 'Starter', growth: 'Growth', scale: 'Scale', legacy: 'Legacy' })[value] || value;
}

function statusLabel(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusPill(value) {
  const pill = node('span', `status-pill is-${value}`, statusLabel(value));
  return pill;
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
  const card = node('article', 'location-card');
  const header = node('div', 'location-card-header');
  const marker = node('span', 'location-color');
  marker.style.background = location.brandColor;
  const heading = node('div');
  heading.append(node('h3', '', location.name), node('p', '', location.address));
  header.append(marker, heading);

  const body = node('div', 'location-card-body');
  const qrImage = node('img');
  qrImage.alt = `QR code for ${location.name}`;
  qrImage.width = 152;
  qrImage.height = 152;
  const qrDataUrl = await QRCode.toDataURL(location.reviewUrl, {
    errorCorrectionLevel: 'M', margin: 2, width: 500,
    color: { dark: '#111827', light: '#ffffff' },
  });
  qrImage.src = qrDataUrl;
  const stats = node('div', 'location-mini-stats');
  [['Scans', location.scans], ['Drafts', location.drafts], ['Google', location.handoffs]]
    .forEach(([label, value]) => {
      const item = node('div');
      item.append(node('strong', '', String(value)), node('span', '', label));
      stats.append(item);
    });
  body.append(qrImage, stats);

  const urlRow = node('div', 'location-url-row');
  const urlText = node('span', '', location.reviewUrl);
  const copyButton = node('button', '', 'Copy URL');
  copyButton.type = 'button';
  copyButton.addEventListener('click', () => copyText(location.reviewUrl, copyButton));
  urlRow.append(urlText, copyButton);

  const actions = node('div', 'location-actions');
  const openLink = node('a', '', 'Open customer page ↗');
  openLink.href = location.reviewUrl;
  openLink.target = '_blank';
  openLink.rel = 'noopener';
  const downloadButton = node('button', '', 'Download QR');
  downloadButton.type = 'button';
  downloadButton.addEventListener('click', () => {
    downloadDataUrl(qrDataUrl, `${location.slug}-review-qr.png`);
  });
  actions.append(openLink, downloadButton);
  card.append(header, body, urlRow, actions);
  return card;
}

function field(labelText, input) {
  const label = node('label');
  label.append(document.createTextNode(labelText), input);
  return label;
}

function input(name, type = 'text', placeholder = '') {
  const control = document.createElement('input');
  control.name = name;
  control.type = type;
  control.placeholder = placeholder;
  control.required = name !== 'paymentLinkUrl' && name !== 'brandColor';
  return control;
}

function createApplicationCard(application) {
  const card = node('article', 'application-card');
  const header = node('div', 'commercial-card-header');
  const title = node('div');
  title.append(node('h3', '', application.businessName), node('p', '', `${application.locationName} · ${application.address}`));
  header.append(title, statusPill(application.status));
  const details = node('dl', 'commercial-meta');
  [
    ['Contact', `${application.contactName} · ${application.contactEmail}`],
    ['Phone', application.contactPhone],
    ['Plan', planName(application.planCode)],
    ['Applied', displayDate(application.createdAt)],
  ].forEach(([term, value]) => {
    const item = node('div'); item.append(node('dt', '', term), node('dd', '', value)); details.append(item);
  });
  card.append(header, details);
  if (application.status !== 'submitted') return card;

  const form = node('form', 'approval-form');
  const amount = input('amountInr', 'number', 'Six-month quote in INR');
  amount.min = '0'; amount.step = '1';
  const paymentLink = input('paymentLinkUrl', 'url', 'Optional HTTPS payment link');
  const color = input('brandColor', 'color'); color.value = '#315efb';
  const row = node('div', 'dashboard-form-grid');
  row.append(field('Six-month quote (₹)', amount), field('Secure payment link (optional)', paymentLink));
  const actionRow = node('div', 'form-action-row');
  actionRow.append(field('QR colour', color));
  const submit = node('button', 'dashboard-add-button', 'Approve & create account');
  submit.type = 'submit';
  actionRow.append(submit);
  const status = node('p', 'dashboard-form-status');
  form.append(row, actionRow, status);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true; submit.textContent = 'Creating…'; status.textContent = '';
    try {
      await api(`/api/admin/enrollments/${encodeURIComponent(application.id)}/approve`, {
        method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      await loadAdmin();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false; submit.textContent = 'Approve & create account';
    }
  });
  card.append(form);
  return card;
}

function createActivationForm(business) {
  const wrapper = node('div', 'activation-panel');
  const heading = node('div');
  heading.append(
    node('strong', '', business.status === 'active' ? 'Record a renewal' : 'Activate manually'),
    node('small', '', 'A verified payment adds six months to the current term.'),
  );
  wrapper.append(heading);

  if (business.pendingPayments.length) {
    business.pendingPayments.forEach((payment) => {
      const row = node('div', 'pending-payment-row');
      const copy = node('div');
      copy.append(
        node('strong', '', `${money(payment.amountPaise)} · ${statusLabel(payment.method)}`),
        node('small', '', `Reference: ${payment.reference}`),
      );
      const button = node('button', 'dashboard-add-button', 'Verify & add 6 months');
      button.type = 'button';
      const status = node('p', 'dashboard-form-status');
      button.addEventListener('click', async () => {
        button.disabled = true; button.textContent = 'Verifying…'; status.textContent = '';
        try {
          await api(`/api/admin/businesses/${encodeURIComponent(business.id)}/activate`, {
            method: 'POST', body: JSON.stringify({ paymentId: payment.id }),
          });
          await loadAdmin();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false; button.textContent = 'Verify & add 6 months';
        }
      });
      row.append(copy, button, status);
      wrapper.append(row);
    });
    return wrapper;
  }

  const form = node('form', 'manual-payment-form');
  const method = document.createElement('select');
  method.name = 'method';
  [['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['payment_link', 'Payment link'], ['cash', 'Cash'], ['other', 'Other']]
    .forEach(([value, label]) => {
      const option = node('option', '', label); option.value = value; method.append(option);
    });
  const reference = input('reference', 'text', 'Verified transaction reference');
  const submit = node('button', 'dashboard-add-button', business.status === 'active' ? 'Record renewal' : 'Activate 6 months');
  submit.type = 'submit';
  const status = node('p', 'dashboard-form-status');
  form.append(field('Method', method), field('Reference', reference), submit, status);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true; submit.textContent = 'Saving…'; status.textContent = '';
    try {
      await api(`/api/admin/businesses/${encodeURIComponent(business.id)}/activate`, {
        method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      await loadAdmin();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.textContent = business.status === 'active' ? 'Record renewal' : 'Activate 6 months';
    }
  });
  wrapper.append(form);
  return wrapper;
}

function createAddLocationPanel(business) {
  const details = node('details', 'add-location-panel');
  details.append(node('summary', '', '+ Create another QR location'));
  const form = node('form', 'business-location-form');
  const locationName = input('locationName', 'text', 'Location name');
  const address = input('address', 'text', 'Address or branch');
  const googleReviewUrl = input('googleReviewUrl', 'url', 'Official Google review URL');
  const color = input('brandColor', 'color'); color.value = '#315efb';
  const businessId = input('businessId', 'hidden'); businessId.value = business.id;
  const row = node('div', 'dashboard-form-grid');
  row.append(field('Location name', locationName), field('Address', address));
  const submit = node('button', 'dashboard-add-button', 'Create location & QR'); submit.type = 'submit';
  const status = node('p', 'dashboard-form-status');
  form.append(businessId, row, field('Google review link', googleReviewUrl), field('QR colour', color), submit, status);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true; submit.textContent = 'Creating…'; status.textContent = '';
    try {
      await api('/api/admin/locations', {
        method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      await loadAdmin();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false; submit.textContent = 'Create location & QR';
    }
  });
  details.append(form);
  return details;
}

async function createBusinessCard(business) {
  const card = node('article', 'business-card');
  const header = node('div', 'commercial-card-header');
  const title = node('div');
  title.append(node('h3', '', business.name), node('p', '', `${business.contactName || 'Client'} · ${business.email}`));
  header.append(title, statusPill(business.status));
  const service = node('div', 'service-summary');
  [
    ['Plan', `${planName(business.planCode)} · ${business.billingCycleMonths} months`],
    ['Quote', money(business.pricePaise)],
    ['Payment', statusLabel(business.paymentStatus)],
    ['Valid until', displayDate(business.serviceEndsAt)],
  ].forEach(([label, value]) => {
    const item = node('div'); item.append(node('span', '', label), node('strong', '', value)); service.append(item);
  });
  card.append(header, service, createActivationForm(business));

  const locationsHeader = node('div', 'embedded-heading');
  locationsHeader.append(node('strong', '', `${business.locations.length} QR location${business.locations.length === 1 ? '' : 's'}`));
  const locations = node('div', 'embedded-location-grid');
  const locationCards = await Promise.all(business.locations.map(createLocationCard));
  locations.append(...locationCards);
  card.append(locationsHeader, locations, createAddLocationPanel(business));
  return card;
}

async function loadAdmin() {
  const data = await api('/api/admin/dashboard');
  document.getElementById('adminEmail').textContent = data.user.email;
  document.getElementById('adminApplications').textContent = data.totals.applications;
  document.getElementById('adminBusinesses').textContent = data.totals.activeBusinesses;
  document.getElementById('adminPayments').textContent = data.totals.pendingPayments;
  document.getElementById('adminLocations').textContent = data.totals.locations;

  const applications = data.applications.filter((item) => item.status === 'submitted');
  const applicationGrid = document.getElementById('applicationGrid');
  applicationGrid.replaceChildren(...applications.map(createApplicationCard));
  document.getElementById('applicationCount').textContent = `${applications.length} application${applications.length === 1 ? '' : 's'}`;
  document.getElementById('applicationEmpty').hidden = applications.length > 0;

  const businessGrid = document.getElementById('businessGrid');
  const cards = await Promise.all(data.businesses.map(createBusinessCard));
  businessGrid.replaceChildren(...cards);
  document.getElementById('businessCount').textContent = `${data.businesses.length} business${data.businesses.length === 1 ? '' : 'es'}`;
  document.getElementById('businessEmpty').hidden = data.businesses.length > 0;
  loading.hidden = true;
  adminContent.hidden = false;
}

async function loadClient() {
  const data = await api('/api/client/dashboard');
  const { business, totals, locations } = data;
  document.getElementById('clientEmail').textContent = data.user.email;
  document.getElementById('clientTitle').textContent = `${business.name} Smart Reviews`;
  document.getElementById('clientPlan').textContent = `${planName(business.planCode)} · ${business.billingCycleMonths} months`;
  document.getElementById('clientQuote').textContent = money(business.pricePaise);
  document.getElementById('clientExpiry').textContent = displayDate(business.serviceEndsAt);
  const active = business.status === 'active' && (!business.serviceEndsAt || new Date(`${business.serviceEndsAt.replace(' ', 'T')}Z`) > new Date());
  document.getElementById('subscriptionHeading').textContent = active ? 'Your QR service is active' : 'Activation or renewal is pending';
  document.getElementById('subscriptionCopy').textContent = active
    ? 'Your printed QR codes stay valid through this term. Renewal extends the same destinations without reprinting.'
    : `Current payment status: ${statusLabel(business.paymentStatus)}. The QR customer journey activates after Devlys verifies payment.`;
  document.getElementById('subscriptionCard').classList.toggle('is-active', active);
  const paymentLink = document.getElementById('paymentLink');
  if (business.paymentLinkUrl) {
    paymentLink.href = business.paymentLinkUrl;
    paymentLink.target = '_blank'; paymentLink.rel = 'noopener'; paymentLink.hidden = false;
  } else {
    paymentLink.hidden = true;
  }
  document.getElementById('metricScans').textContent = totals.scans;
  document.getElementById('metricDrafts').textContent = totals.drafts;
  document.getElementById('metricHandoffs').textContent = totals.handoffs;
  document.getElementById('metricConversion').textContent = totals.scans ? `${Math.round((totals.handoffs / totals.scans) * 100)}%` : '0%';
  document.getElementById('clientLocationCount').textContent = `${locations.length} location${locations.length === 1 ? '' : 's'}`;
  const locationCards = await Promise.all(locations.map(createLocationCard));
  document.getElementById('clientLocationsGrid').replaceChildren(...locationCards);
  loading.hidden = true;
  clientContent.hidden = false;
}

document.getElementById('paymentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const status = document.getElementById('paymentStatus');
  submit.disabled = true; submit.textContent = 'Submitting…'; status.textContent = '';
  try {
    const result = await api('/api/client/payments', {
      method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
    });
    status.classList.add('is-success');
    status.textContent = `Payment reference received (${result.paymentId}). Devlys will verify it.`;
    form.reset();
  } catch (error) {
    status.classList.remove('is-success'); status.textContent = error.message;
  } finally {
    submit.disabled = false; submit.textContent = 'Submit for verification';
  }
});

async function loadDashboard() {
  try {
    const session = await api('/api/me');
    signOutLink.hidden = false;
    if (session.role === 'admin') return loadAdmin();
    if (session.role === 'client') return loadClient();
    loading.hidden = true;
    unassignedPanel.hidden = false;
  } catch (error) {
    loading.hidden = true;
    if (error.status === 401) {
      authPanel.hidden = false;
      return;
    }
    errorPanel.hidden = false;
    errorMessage.textContent = error.message;
  }
}

loadDashboard();
