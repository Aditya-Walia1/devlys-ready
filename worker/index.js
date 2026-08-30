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
const DEMO_LOCATION = {
  id: 'demo',
  slug: 'demo',
  name: 'Saffron Table',
  address: 'Connaught Place · New Delhi',
  brandColor: '#315efb',
  googleReviewUrl: null,
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

async function readJson(request, maxLength = 8_000) {
  const text = await request.text();
  if (!text || text.length > maxLength) throw new Error('Invalid request body.');
  return JSON.parse(text);
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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

function getAuthenticatedUser(request) {
  const id = cleanText(request.headers.get('oai-authenticated-user-id'), 160);
  if (!id) return null;
  return {
    id,
    email: cleanText(request.headers.get('oai-authenticated-user-email'), 240),
  };
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
    `SELECT id, slug, name, address, google_review_url, brand_color
     FROM locations WHERE slug = ? AND active = 1 LIMIT 1`,
  ).bind(slug).first();
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    googleReviewUrl: row.google_review_url,
    brandColor: row.brand_color,
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
  return location ? json({ location }) : json({ error: 'Review location not found.' }, 404);
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

async function handleMe(request) {
  const user = getAuthenticatedUser(request);
  return user
    ? json({ authenticated: true, user: { email: user.email } })
    : json({ authenticated: false }, 401);
}

async function handleCreateLocation(request, env) {
  const user = getAuthenticatedUser(request);
  if (!user) return json({ error: 'Sign in to manage locations.' }, 401);
  if (!env.DB) return json({ error: 'Database is not configured.' }, 503);
  const body = await readJson(request, 12_000);
  const businessName = cleanText(body.businessName, 100);
  const locationName = cleanText(body.locationName, 100);
  const address = cleanText(body.address, 180);
  const googleReviewUrl = cleanText(body.googleReviewUrl, 700);
  const brandColor = /^#[0-9a-f]{6}$/i.test(body.brandColor)
    ? body.brandColor.toLowerCase() : '#315efb';
  if (!businessName || !locationName || !address || !isAllowedGoogleUrl(googleReviewUrl)) {
    return json({ error: 'Enter complete business details and an official Google review URL.' }, 400);
  }

  let business = await env.DB.prepare(
    'SELECT id, name FROM businesses WHERE owner_id = ? LIMIT 1',
  ).bind(user.id).first();
  if (!business) {
    business = { id: crypto.randomUUID(), name: businessName };
    await env.DB.prepare(
      'INSERT INTO businesses (id, owner_id, owner_email, name) VALUES (?, ?, ?, ?)',
    ).bind(business.id, user.id, user.email || null, businessName).run();
  }

  const id = crypto.randomUUID();
  const slug = `${slugify(locationName)}-${randomSuffix()}`;
  await env.DB.prepare(
    `INSERT INTO locations
      (id, business_id, slug, name, address, google_review_url, brand_color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, business.id, slug, locationName, address, googleReviewUrl, brandColor).run();
  return json({ location: { id, slug } }, 201);
}

async function handleDashboard(request, env, origin) {
  const user = getAuthenticatedUser(request);
  if (!user) return json({ error: 'Sign in to manage locations.' }, 401);
  if (!env.DB) return json({ error: 'Database is not configured.' }, 503);
  const business = await env.DB.prepare(
    'SELECT id, name, owner_email FROM businesses WHERE owner_id = ? LIMIT 1',
  ).bind(user.id).first();
  if (!business) {
    return json({ business: null, locations: [], totals: { scans: 0, drafts: 0, handoffs: 0 } });
  }

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
  ).bind(business.id).all();

  const locations = (result.results || []).map((row) => ({
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
  const totals = locations.reduce((sum, location) => ({
    scans: sum.scans + location.scans,
    drafts: sum.drafts + location.drafts,
    handoffs: sum.handoffs + location.handoffs,
  }), { scans: 0, drafts: 0, handoffs: 0 });
  return json({
    business: { name: business.name, email: business.owner_email || user.email },
    locations,
    totals,
  });
}

async function handleApi(request, env, url) {
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Cross-origin request blocked.' }, 403);
  }
  if (request.method === 'GET' && url.pathname === '/api/me') return handleMe(request);
  if (request.method === 'GET' && url.pathname === '/api/dashboard') {
    return handleDashboard(request, env, url.origin);
  }
  if (request.method === 'POST' && url.pathname === '/api/locations') {
    return handleCreateLocation(request, env);
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
