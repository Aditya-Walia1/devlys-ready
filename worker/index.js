const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' https://fonts.gstatic.com",
    "form-action 'self' mailto:",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
  ].join('; '),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const ALLOWED_TOPICS = new Set(['food', 'service', 'ambience', 'value']);
const ALLOWED_EVENTS = new Set(['scan', 'google_open']);
const ALLOWED_PLANS = new Set(['starter', 'growth', 'scale']);
const PLAN_LOCATION_LIMITS = { starter: 1, growth: 3, scale: 10, legacy: 10 };
const PAYMENT_METHODS = new Set(['upi', 'bank_transfer', 'payment_link', 'cash', 'other']);
const DEFAULT_ADMIN_EMAILS = new Set(['awalia1_be22@thapar.edu']);
const DEMO_LOCATION = {
  id: 'demo',
  slug: 'demo',
  name: 'Saffron Table',
  address: 'Connaught Place · New Delhi',
  brandColor: '#315efb',
  googleReviewUrl: null,
  serviceStatus: 'active',
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data, status = 200) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request, maxLength = 12_000) {
  const text = await request.text();
  if (!text || text.length > maxLength) throw new Error('Invalid request body.');
  return JSON.parse(text);
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeEmail(value) {
  return cleanText(value, 240).toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpsUrl(value) {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 42) || 'location';
}

function randomSuffix() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getAuthenticatedUser(request) {
  const id = cleanText(request.headers.get('oai-authenticated-user-id'), 160);
  if (!id) return null;
  return {
    id,
    email: normalizeEmail(request.headers.get('oai-authenticated-user-email')),
  };
}

function adminEmails(env) {
  const configured = cleanText(env.DEVLYS_ADMIN_EMAILS, 2_000)
    .split(',').map(normalizeEmail).filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS, ...configured]);
}

function isAdminUser(user, env, url) {
  if (!user?.email) return false;
  if (adminEmails(env).has(user.email)) return true;
  return ['127.0.0.1', 'localhost'].includes(url.hostname) && user.email === 'seedy@sites.test';
}

async function getSession(request, env, url) {
  const user = getAuthenticatedUser(request);
  if (!user) return { authenticated: false, role: 'anonymous', user: null, businessId: null };
  if (isAdminUser(user, env, url)) {
    return { authenticated: true, role: 'admin', user, businessId: null };
  }
  if (!env.DB || !user.email) {
    return { authenticated: true, role: 'unassigned', user, businessId: null };
  }
  const member = await env.DB.prepare(
    `SELECT business_id, role, user_id FROM business_members
     WHERE user_id = ? OR lower(email) = lower(?) LIMIT 1`,
  ).bind(user.id, user.email).first();
  if (!member) return { authenticated: true, role: 'unassigned', user, businessId: null };
  if (!member.user_id) {
    await env.DB.prepare(
      'UPDATE business_members SET user_id = ? WHERE business_id = ? AND lower(email) = lower(?)',
    ).bind(user.id, member.business_id, user.email).run();
  }
  return {
    authenticated: true,
    role: member.role === 'client_owner' ? 'client' : member.role,
    user,
    businessId: member.business_id,
  };
}

function authFailure(session, requiredRole) {
  if (!session.authenticated) return json({ error: 'Sign in to continue.' }, 401);
  if (requiredRole && session.role !== requiredRole) {
    return json({ error: 'Your account does not have permission for this action.' }, 403);
  }
  return null;
}

export function isAllowedGoogleUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return ['search.google.com', 'g.page', 'maps.app.goo.gl', 'google.com', 'www.google.com']
      .includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeTopics(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((topic) => ALLOWED_TOPICS.has(topic)))].slice(0, 4);
}

function formatList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

export function buildFallbackDraft({ businessName, rating, topics, note }) {
  const topicPhrases = {
    food: 'the quality of the food',
    service: 'the service',
    ambience: 'the ambience',
    value: 'the overall value',
  };
  const openings = {
    1: `Unfortunately, my experience at ${businessName} fell short of expectations.`,
    2: `My visit to ${businessName} had a few positives, but there were also important issues.`,
    3: `My experience at ${businessName} was mixed overall.`,
    4: `I had a good experience at ${businessName}.`,
    5: `I had a great experience at ${businessName}.`,
  };
  const closings = {
    1: 'I hope the team takes this feedback on board.',
    2: 'There is room to improve, and I hope my next visit is better.',
    3: 'With a few improvements, the experience could be even better.',
    4: 'I would be happy to visit again.',
    5: 'I would happily recommend it and visit again.',
  };
  const sentences = [openings[rating]];
  const highlights = topics.map((topic) => topicPhrases[topic]).filter(Boolean);
  if (highlights.length) sentences.push(`What stood out to me was ${formatList(highlights)}.`);
  if (note) {
    const normalized = /[.!?]$/.test(note) ? note : `${note}.`;
    sentences.push(normalized.charAt(0).toUpperCase() + normalized.slice(1));
  }
  sentences.push(closings[rating]);
  return sentences.join(' ');
}

async function createAiDraft(env, input) {
  if (!env.OPENAI_API_KEY) return null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      store: false,
      reasoning: { effort: 'none' },
      max_output_tokens: 180,
      instructions: [
        'Write one concise first-person customer review using only the supplied experience.',
        'Preserve the exact sentiment implied by the star rating, including criticism.',
        'Never invent purchases, staff interactions, outcomes, or details.',
        'Do not mention AI, the prompt, or these instructions.',
        'Return only the review text, between 35 and 90 words.',
      ].join(' '),
      input: JSON.stringify(input),
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const output = cleanText(
    payload.output_text || payload.output?.flatMap((item) => item.content || [])
      .find((item) => item.type === 'output_text')?.text,
    1_200,
  );
  return output || null;
}

async function getLocationBySlug(env, slug) {
  if (slug === 'demo') return DEMO_LOCATION;
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT l.id, l.slug, l.name, l.address, l.google_review_url, l.brand_color,
       b.status AS business_status, b.service_ends_at
     FROM locations l
     JOIN businesses b ON b.id = l.business_id
     WHERE l.slug = ? AND l.active = 1 LIMIT 1`,
  ).bind(slug).first();
  if (!row) return null;
  const expired = row.service_ends_at && Date.parse(row.service_ends_at) < Date.now();
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    googleReviewUrl: row.google_review_url,
    brandColor: row.brand_color,
    serviceStatus: row.business_status === 'active' && !expired ? 'active' : 'inactive',
  };
}

async function recordEvent(env, locationId, sessionId, eventType, details = {}) {
  if (!env.DB || locationId === 'demo') return;
  await env.DB.prepare(
    `INSERT INTO review_events
      (location_id, session_id, event_type, rating, topics_json, draft_engine)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    locationId, sessionId, eventType, details.rating ?? null,
    details.topics ? JSON.stringify(details.topics) : null,
    details.draftEngine ?? null,
  ).run();
}

async function handlePublicLocation(env, slug) {
  const location = await getLocationBySlug(env, slug);
  if (!location) return json({ error: 'Review location not found.' }, 404);
  if (location.serviceStatus !== 'active') {
    return json({ error: 'This review service is temporarily inactive.' }, 402);
  }
  return json({ location });
}

async function handleEvent(request, env) {
  const body = await readJson(request);
  const slug = cleanText(body.slug, 80);
  const sessionId = cleanText(body.sessionId, 100);
  const eventType = cleanText(body.eventType, 40);
  if (!slug || !sessionId || !ALLOWED_EVENTS.has(eventType)) {
    return json({ error: 'Invalid event.' }, 400);
  }
  const location = await getLocationBySlug(env, slug);
  if (!location) return json({ error: 'Review location not found.' }, 404);
  if (location.serviceStatus !== 'active') return json({ error: 'Service inactive.' }, 402);
  await recordEvent(env, location.id, sessionId, eventType);
  return json({ ok: true }, 201);
}

async function handleDraft(request, env) {
  const body = await readJson(request);
  const slug = cleanText(body.slug, 80);
  const sessionId = cleanText(body.sessionId, 100);
  const rating = Number(body.rating);
  const topics = normalizeTopics(body.topics);
  const note = cleanText(body.note, 500);
  if (!slug || !sessionId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: 'Choose a valid rating.' }, 400);
  }
  if (!topics.length && note.length < 10) {
    return json({ error: 'Add one genuine detail from the visit.' }, 400);
  }
  const location = await getLocationBySlug(env, slug);
  if (!location) return json({ error: 'Review location not found.' }, 404);
  if (location.serviceStatus !== 'active') return json({ error: 'Service inactive.' }, 402);

  if (env.DB && location.id !== 'demo') {
    const rate = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM review_events
       WHERE session_id = ? AND event_type = 'draft_created'
         AND created_at >= datetime('now', '-1 hour')`,
    ).bind(sessionId).first();
    if (Number(rate?.count || 0) >= 10) {
      return json({ error: 'Please wait before creating another draft.' }, 429);
    }
  }

  const input = { businessName: location.name, rating, topics, note };
  const aiDraft = await createAiDraft(env, input);
  const draftEngine = aiDraft ? 'openai' : 'safe_fallback';
  const draft = aiDraft || buildFallbackDraft(input);
  await recordEvent(env, location.id, sessionId, 'draft_created', {
    rating, topics, draftEngine,
  });
  return json({ draft, googleReviewUrl: location.googleReviewUrl, engine: draftEngine });
}

async function handleEnrollment(request, env) {
  if (!env.DB) return json({ error: 'Enrollment is temporarily unavailable.' }, 503);
  const body = await readJson(request);
  const application = {
    businessName: cleanText(body.businessName, 100),
    contactName: cleanText(body.contactName, 100),
    contactEmail: normalizeEmail(body.contactEmail),
    contactPhone: cleanText(body.contactPhone, 30),
    locationName: cleanText(body.locationName, 100),
    address: cleanText(body.address, 180),
    googleReviewUrl: cleanText(body.googleReviewUrl, 700),
    planCode: cleanText(body.planCode, 30),
  };
  if (!application.businessName || !application.contactName
    || !isEmail(application.contactEmail) || application.contactPhone.length < 7
    || !application.locationName || !application.address
    || !isAllowedGoogleUrl(application.googleReviewUrl)
    || !ALLOWED_PLANS.has(application.planCode)) {
    return json({ error: 'Enter complete business, contact, location and Google review details.' }, 400);
  }
  const existing = await env.DB.prepare(
    `SELECT id FROM enrollment_applications
     WHERE lower(contact_email) = lower(?) AND status IN ('submitted', 'approved')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(application.contactEmail).first();
  if (existing) return json({ applicationId: existing.id, status: 'already_submitted' }, 200);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO enrollment_applications
      (id, business_name, contact_name, contact_email, contact_phone,
       location_name, address, google_review_url, plan_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, application.businessName, application.contactName, application.contactEmail,
    application.contactPhone, application.locationName, application.address,
    application.googleReviewUrl, application.planCode,
  ).run();
  return json({ applicationId: id, status: 'submitted' }, 201);
}

async function loadLocations(env, businessId, origin) {
  const result = await env.DB.prepare(
    `SELECT l.id, l.slug, l.name, l.address, l.google_review_url, l.brand_color,
       SUM(CASE WHEN e.event_type = 'scan' THEN 1 ELSE 0 END) AS scans,
       SUM(CASE WHEN e.event_type = 'draft_created' THEN 1 ELSE 0 END) AS drafts,
       SUM(CASE WHEN e.event_type = 'google_open' THEN 1 ELSE 0 END) AS handoffs
     FROM locations l
     LEFT JOIN review_events e ON e.location_id = l.id
       AND e.created_at >= datetime('now', '-30 days')
     WHERE l.business_id = ? AND l.active = 1
     GROUP BY l.id ORDER BY l.created_at DESC`,
  ).bind(businessId).all();
  return (result.results || []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    googleReviewUrl: row.google_review_url,
    brandColor: row.brand_color,
    reviewUrl: `${origin}/r/${row.slug}`,
    scans: Number(row.scans || 0),
    drafts: Number(row.drafts || 0),
    handoffs: Number(row.handoffs || 0),
  }));
}

function totalsFor(locations) {
  return locations.reduce((sum, location) => ({
    scans: sum.scans + location.scans,
    drafts: sum.drafts + location.drafts,
    handoffs: sum.handoffs + location.handoffs,
  }), { scans: 0, drafts: 0, handoffs: 0 });
}

async function handleMe(request, env, url) {
  const session = await getSession(request, env, url);
  if (!session.authenticated) return json({ authenticated: false, role: 'anonymous' }, 401);
  return json({
    authenticated: true,
    role: session.role,
    user: { email: session.user.email },
    businessId: session.businessId,
  });
}

async function handleAdminDashboard(request, env, url) {
  const session = await getSession(request, env, url);
  const failure = authFailure(session, 'admin');
  if (failure) return failure;
  if (!env.DB) return json({ error: 'Database is not configured.' }, 503);

  const [applicationResult, businessResult, locationResult, paymentResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, business_name, contact_name, contact_email, contact_phone,
         location_name, address, google_review_url, plan_code, status, created_at
       FROM enrollment_applications ORDER BY created_at DESC LIMIT 50`,
    ).all(),
    env.DB.prepare(
      `SELECT id, name, owner_email, contact_name, contact_phone, status, plan_code,
         billing_cycle_months, price_paise, payment_status, payment_link_url,
         service_starts_at, service_ends_at, created_at
       FROM businesses ORDER BY created_at DESC LIMIT 100`,
    ).all(),
    env.DB.prepare(
      `SELECT l.id, l.business_id, l.slug, l.name, l.address, l.google_review_url,
         l.brand_color,
         SUM(CASE WHEN e.event_type = 'scan' THEN 1 ELSE 0 END) AS scans,
         SUM(CASE WHEN e.event_type = 'draft_created' THEN 1 ELSE 0 END) AS drafts,
         SUM(CASE WHEN e.event_type = 'google_open' THEN 1 ELSE 0 END) AS handoffs
       FROM locations l
       LEFT JOIN review_events e ON e.location_id = l.id
         AND e.created_at >= datetime('now', '-30 days')
       WHERE l.active = 1 GROUP BY l.id ORDER BY l.created_at DESC`,
    ).all(),
    env.DB.prepare(
      `SELECT id, business_id, amount_paise, method, reference, status, created_at
       FROM payments WHERE status = 'submitted' ORDER BY created_at DESC`,
    ).all(),
  ]);

  const locationsByBusiness = new Map();
  for (const row of locationResult.results || []) {
    const location = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      address: row.address,
      googleReviewUrl: row.google_review_url,
      brandColor: row.brand_color,
      reviewUrl: `${url.origin}/r/${row.slug}`,
      scans: Number(row.scans || 0),
      drafts: Number(row.drafts || 0),
      handoffs: Number(row.handoffs || 0),
    };
    const list = locationsByBusiness.get(row.business_id) || [];
    list.push(location);
    locationsByBusiness.set(row.business_id, list);
  }
  const pendingByBusiness = new Map();
  for (const payment of paymentResult.results || []) {
    const list = pendingByBusiness.get(payment.business_id) || [];
    list.push({
      id: payment.id,
      amountPaise: payment.amount_paise,
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
      createdAt: payment.created_at,
    });
    pendingByBusiness.set(payment.business_id, list);
  }
  const businesses = (businessResult.results || []).map((row) => {
    const locations = locationsByBusiness.get(row.id) || [];
    return {
      id: row.id,
      name: row.name,
      email: row.owner_email,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      status: row.status,
      planCode: row.plan_code,
      billingCycleMonths: row.billing_cycle_months,
      pricePaise: row.price_paise,
      paymentStatus: row.payment_status,
      paymentLinkUrl: row.payment_link_url,
      serviceStartsAt: row.service_starts_at,
      serviceEndsAt: row.service_ends_at,
      locations,
      totals: totalsFor(locations),
      pendingPayments: pendingByBusiness.get(row.id) || [],
    };
  });
  const applications = (applicationResult.results || []).map((row) => ({
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    locationName: row.location_name,
    address: row.address,
    googleReviewUrl: row.google_review_url,
    planCode: row.plan_code,
    status: row.status,
    createdAt: row.created_at,
  }));
  return json({
    role: 'admin',
    user: { email: session.user.email },
    applications,
    businesses,
    totals: {
      applications: applications.filter((item) => item.status === 'submitted').length,
      activeBusinesses: businesses.filter((item) => item.status === 'active').length,
      pendingPayments: businesses.reduce((sum, item) => sum + item.pendingPayments.length, 0),
      locations: businesses.reduce((sum, item) => sum + item.locations.length, 0),
    },
  });
}

async function handleClientDashboard(request, env, url) {
  const session = await getSession(request, env, url);
  const failure = authFailure(session, 'client');
  if (failure) return failure;
  if (!env.DB) return json({ error: 'Database is not configured.' }, 503);
  const business = await env.DB.prepare(
    `SELECT id, name, owner_email, contact_name, contact_phone, status, plan_code,
       billing_cycle_months, price_paise, payment_status, payment_link_url,
       service_starts_at, service_ends_at
     FROM businesses WHERE id = ? LIMIT 1`,
  ).bind(session.businessId).first();
  if (!business) return json({ error: 'Business account not found.' }, 404);
  const locations = await loadLocations(env, business.id, url.origin);
  const paymentResult = await env.DB.prepare(
    `SELECT id, amount_paise, method, reference, status, paid_at, created_at
     FROM payments WHERE business_id = ? ORDER BY created_at DESC LIMIT 20`,
  ).bind(business.id).all();
  return json({
    role: 'client',
    user: { email: session.user.email },
    business: {
      id: business.id,
      name: business.name,
      email: business.owner_email,
      contactName: business.contact_name,
      contactPhone: business.contact_phone,
      status: business.status,
      planCode: business.plan_code,
      billingCycleMonths: business.billing_cycle_months,
      pricePaise: business.price_paise,
      paymentStatus: business.payment_status,
      paymentLinkUrl: business.payment_link_url,
      serviceStartsAt: business.service_starts_at,
      serviceEndsAt: business.service_ends_at,
    },
    locations,
    totals: totalsFor(locations),
    payments: (paymentResult.results || []).map((payment) => ({
      id: payment.id,
      amountPaise: payment.amount_paise,
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
    })),
  });
}

async function handleApproveEnrollment(request, env, url, applicationId) {
  const session = await getSession(request, env, url);
  const failure = authFailure(session, 'admin');
  if (failure) return failure;
  const body = await readJson(request);
  const amountInr = Number(body.amountInr);
  const paymentLinkUrl = cleanText(body.paymentLinkUrl, 700);
  const brandColor = /^#[0-9a-f]{6}$/i.test(body.brandColor)
    ? body.brandColor.toLowerCase() : '#315efb';
  if (!Number.isFinite(amountInr) || amountInr < 0 || amountInr > 10_000_000
    || !isHttpsUrl(paymentLinkUrl)) {
    return json({ error: 'Enter a valid six-month quote and HTTPS payment link.' }, 400);
  }
  const application = await env.DB.prepare(
    `SELECT * FROM enrollment_applications WHERE id = ? AND status = 'submitted' LIMIT 1`,
  ).bind(applicationId).first();
  if (!application) return json({ error: 'Enrollment is no longer awaiting approval.' }, 409);
  const memberExists = await env.DB.prepare(
    'SELECT id FROM business_members WHERE lower(email) = lower(?) LIMIT 1',
  ).bind(application.contact_email).first();
  if (memberExists) return json({ error: 'That client email already belongs to a business.' }, 409);

  const businessId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const locationId = crypto.randomUUID();
  const slug = `${slugify(application.location_name)}-${randomSuffix()}`;
  const pricePaise = Math.round(amountInr * 100);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO businesses
        (id, owner_id, owner_email, name, contact_name, contact_phone, status,
         plan_code, billing_cycle_months, price_paise, payment_status,
         payment_link_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?, 6, ?, 'unpaid', ?, ?)`,
    ).bind(
      businessId, `client:${businessId}`, application.contact_email,
      application.business_name, application.contact_name, application.contact_phone,
      application.plan_code, pricePaise, paymentLinkUrl || null, session.user.email,
    ),
    env.DB.prepare(
      `INSERT INTO business_members (id, business_id, email, role)
       VALUES (?, ?, ?, 'client_owner')`,
    ).bind(memberId, businessId, application.contact_email),
    env.DB.prepare(
      `INSERT INTO locations
        (id, business_id, slug, name, address, google_review_url, brand_color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      locationId, businessId, slug, application.location_name, application.address,
      application.google_review_url, brandColor,
    ),
    env.DB.prepare(
      `UPDATE enrollment_applications
       SET status = 'approved', business_id = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(businessId, session.user.email, applicationId),
  ]);
  return json({ businessId, location: { id: locationId, slug }, status: 'pending_payment' }, 201);
}

async function handleCreateAdminLocation(request, env, url) {
  const session = await getSession(request, env, url);
  const failure = authFailure(session, 'admin');
  if (failure) return failure;
  const body = await readJson(request);
  const businessId = cleanText(body.businessId, 80);
  const locationName = cleanText(body.locationName, 100);
  const address = cleanText(body.address, 180);
  const googleReviewUrl = cleanText(body.googleReviewUrl, 700);
  const brandColor = /^#[0-9a-f]{6}$/i.test(body.brandColor)
    ? body.brandColor.toLowerCase() : '#315efb';
  if (!businessId || !locationName || !address || !isAllowedGoogleUrl(googleReviewUrl)) {
    return json({ error: 'Enter complete location details and an official Google review URL.' }, 400);
  }
  const business = await env.DB.prepare(
    'SELECT id, plan_code FROM businesses WHERE id = ? LIMIT 1',
  ).bind(businessId).first();
  if (!business) return json({ error: 'Business not found.' }, 404);
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM locations WHERE business_id = ? AND active = 1',
  ).bind(businessId).first();
  const limit = PLAN_LOCATION_LIMITS[business.plan_code] || 1;
  if (Number(count?.count || 0) >= limit) {
    return json({ error: `This plan supports up to ${limit} active location${limit === 1 ? '' : 's'}.` }, 409);
  }
  const id = crypto.randomUUID();
  const slug = `${slugify(locationName)}-${randomSuffix()}`;
  await env.DB.prepare(
    `INSERT INTO locations
      (id, business_id, slug, name, address, google_review_url, brand_color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, businessId, slug, locationName, address, googleReviewUrl, brandColor).run();
  return json({ location: { id, slug } }, 201);
}

async function handleSubmitPayment(request, env, url) {
  const session = await getSession(request, env, url);
  const failure = authFailure(session, 'client');
  if (failure) return failure;
  const body = await readJson(request);
  const reference = cleanText(body.reference, 120);
  const method = cleanText(body.method, 40);
  if (reference.length < 4 || !PAYMENT_METHODS.has(method)) {
    return json({ error: 'Enter the payment method and transaction reference.' }, 400);
  }
  const business = await env.DB.prepare(
    'SELECT id, price_paise FROM businesses WHERE id = ? LIMIT 1',
  ).bind(session.businessId).first();
  if (!business) return json({ error: 'Business account not found.' }, 404);
  const duplicate = await env.DB.prepare(
    `SELECT id FROM payments
     WHERE business_id = ? AND reference = ? AND status IN ('submitted', 'paid') LIMIT 1`,
  ).bind(business.id, reference).first();
  if (duplicate) return json({ paymentId: duplicate.id, status: 'already_submitted' }, 200);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payments
        (id, business_id, amount_paise, method, reference, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?)`,
    ).bind(id, business.id, business.price_paise, method, reference, session.user.email),
    env.DB.prepare(
      "UPDATE businesses SET payment_status = 'submitted' WHERE id = ?",
    ).bind(business.id),
  ]);
  return json({ paymentId: id, status: 'submitted' }, 201);
}

async function handleActivateBusiness(request, env, url, businessId) {
  const session = await getSession(request, env, url);
  const failure = authFailure(session, 'admin');
  if (failure) return failure;
  const body = await readJson(request);
  const paymentId = cleanText(body.paymentId, 80);
  const manualReference = cleanText(body.reference, 120);
  const method = cleanText(body.method, 40) || 'other';
  const business = await env.DB.prepare(
    `SELECT id, price_paise, billing_cycle_months FROM businesses WHERE id = ? LIMIT 1`,
  ).bind(businessId).first();
  if (!business) return json({ error: 'Business not found.' }, 404);

  let payment = null;
  if (paymentId) {
    payment = await env.DB.prepare(
      `SELECT id, reference FROM payments
       WHERE id = ? AND business_id = ? AND status = 'submitted' LIMIT 1`,
    ).bind(paymentId, businessId).first();
    if (!payment) return json({ error: 'Pending payment not found.' }, 404);
  } else if (manualReference.length < 4 || !PAYMENT_METHODS.has(method)) {
    return json({ error: 'Choose a submitted payment or enter a verified transaction reference.' }, 400);
  }

  const statements = [];
  if (payment) {
    statements.push(env.DB.prepare(
      `UPDATE payments SET status = 'paid', verified_by = ?, paid_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(session.user.email, payment.id));
  } else {
    statements.push(env.DB.prepare(
      `INSERT INTO payments
        (id, business_id, amount_paise, method, reference, status,
         submitted_by, verified_by, paid_at)
       VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      crypto.randomUUID(), businessId, business.price_paise, method, manualReference,
      session.user.email, session.user.email,
    ));
  }
  statements.push(env.DB.prepare(
    `UPDATE businesses
     SET status = 'active', payment_status = 'paid',
       service_starts_at = CASE
         WHEN service_ends_at IS NOT NULL AND service_ends_at > CURRENT_TIMESTAMP
           THEN service_starts_at
         ELSE CURRENT_TIMESTAMP
       END,
       service_ends_at = datetime(
         CASE
           WHEN service_ends_at IS NOT NULL AND service_ends_at > CURRENT_TIMESTAMP
             THEN service_ends_at
           ELSE CURRENT_TIMESTAMP
         END,
         '+' || billing_cycle_months || ' months'
       )
     WHERE id = ?`,
  ).bind(businessId));
  await env.DB.batch(statements);
  const updated = await env.DB.prepare(
    'SELECT status, payment_status, service_starts_at, service_ends_at FROM businesses WHERE id = ?',
  ).bind(businessId).first();
  return json({ businessId, ...updated });
}

async function handleApi(request, env, url) {
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Cross-origin request blocked.' }, 403);
  }
  if (request.method === 'GET' && url.pathname === '/api/me') return handleMe(request, env, url);
  if (request.method === 'POST' && url.pathname === '/api/enrollments') {
    return handleEnrollment(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/dashboard') {
    return handleAdminDashboard(request, env, url);
  }
  if (request.method === 'GET' && url.pathname === '/api/client/dashboard') {
    return handleClientDashboard(request, env, url);
  }
  const approval = url.pathname.match(/^\/api\/admin\/enrollments\/([^/]+)\/approve$/);
  if (request.method === 'POST' && approval) {
    return handleApproveEnrollment(request, env, url, cleanText(decodeURIComponent(approval[1]), 80));
  }
  if (request.method === 'POST' && url.pathname === '/api/admin/locations') {
    return handleCreateAdminLocation(request, env, url);
  }
  const activation = url.pathname.match(/^\/api\/admin\/businesses\/([^/]+)\/activate$/);
  if (request.method === 'POST' && activation) {
    return handleActivateBusiness(request, env, url, cleanText(decodeURIComponent(activation[1]), 80));
  }
  if (request.method === 'POST' && url.pathname === '/api/client/payments') {
    return handleSubmitPayment(request, env, url);
  }
  if (request.method === 'POST' && url.pathname === '/api/events') return handleEvent(request, env);
  if (request.method === 'POST' && url.pathname === '/api/drafts') return handleDraft(request, env);
  if (request.method === 'GET' && url.pathname.startsWith('/api/locations/')) {
    const slug = cleanText(decodeURIComponent(url.pathname.slice('/api/locations/'.length)), 80);
    return handlePublicLocation(env, slug);
  }
  return json({ error: 'API route not found.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      if (!['GET', 'HEAD'].includes(request.method)) {
        return withSecurityHeaders(new Response('Method not allowed', {
          status: 405, headers: { Allow: 'GET, HEAD' },
        }));
      }
      if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
        return withSecurityHeaders(new Response('Static assets are unavailable.', { status: 503 }));
      }

      let assetRequest = request;
      if (url.pathname.startsWith('/r/')) {
        assetRequest = new Request(new URL('/review.html', url), request);
      } else if (url.pathname === '/dashboard' || url.pathname === '/dashboard/') {
        assetRequest = new Request(new URL('/dashboard.html', url), request);
      } else if (url.pathname === '/enroll' || url.pathname === '/enroll/') {
        assetRequest = new Request(new URL('/enroll.html', url), request);
      }
      return withSecurityHeaders(await env.ASSETS.fetch(assetRequest));
    } catch {
      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'The service could not complete this request.' }, 500);
      }
      return withSecurityHeaders(new Response('Something went wrong.', { status: 500 }));
    }
  },
};
