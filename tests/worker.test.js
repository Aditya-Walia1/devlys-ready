import assert from 'node:assert/strict';
import test from 'node:test';

import worker, {
  buildFallbackDraft,
  isAllowedGoogleUrl,
} from '../worker/index.js';
import { createDevDatabase } from '../scripts/dev-review-api.mjs';

test('fallback draft preserves negative sentiment and supplied detail', () => {
  const draft = buildFallbackDraft({
    businessName: 'Saffron Table',
    rating: 1,
    topics: ['service'],
    note: 'We waited forty minutes for our table',
  });
  assert.match(draft, /fell short/i);
  assert.match(draft, /waited forty minutes/i);
  assert.doesNotMatch(draft, /recommend/i);
});

test('Google review URL validation rejects arbitrary redirects', () => {
  assert.equal(isAllowedGoogleUrl('https://g.page/r/example/review'), true);
  assert.equal(
    isAllowedGoogleUrl('https://search.google.com/local/writereview?placeid=abc'),
    true,
  );
  assert.equal(isAllowedGoogleUrl('https://example.com/review'), false);
  assert.equal(isAllowedGoogleUrl('javascript:alert(1)'), false);
});

test('demo draft endpoint completes without storing personal text', async () => {
  const response = await worker.fetch(
    new Request('https://devlys.example/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://devlys.example',
      },
      body: JSON.stringify({
        slug: 'demo',
        sessionId: 'test-session',
        rating: 5,
        topics: ['food', 'ambience'],
        note: 'The team made our family dinner feel special',
      }),
    }),
    {},
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.engine, 'safe_fallback');
  assert.match(payload.draft, /family dinner feel special/i);
});

test('management endpoints require an authenticated Site user', async () => {
  const response = await worker.fetch(
    new Request('https://devlys.example/api/dashboard'),
    {},
  );
  assert.equal(response.status, 401);
});

test('cross-origin writes are blocked', async () => {
  const response = await worker.fetch(
    new Request('https://devlys.example/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious.example',
      },
      body: JSON.stringify({
        slug: 'demo',
        sessionId: 'test-session',
        eventType: 'scan',
      }),
    }),
    {},
  );
  assert.equal(response.status, 403);
});

test('local development database supports the complete dashboard flow', async () => {
  const database = await createDevDatabase();
  const authHeaders = {
    'oai-authenticated-user-id': 'local-user',
    'oai-authenticated-user-email': 'owner@example.com',
  };

  try {
    const emptyResponse = await worker.fetch(
      new Request('http://127.0.0.1/api/dashboard', { headers: authHeaders }),
      { DB: database },
    );
    assert.deepEqual(await emptyResponse.json(), {
      business: null,
      locations: [],
      totals: { scans: 0, drafts: 0, handoffs: 0 },
    });

    const createResponse = await worker.fetch(
      new Request('http://127.0.0.1/api/locations', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1',
        },
        body: JSON.stringify({
          businessName: 'Devlys Hospitality',
          locationName: 'Saffron Table',
          address: 'Connaught Place · New Delhi',
          googleReviewUrl: 'https://g.page/r/example/review',
          brandColor: '#315efb',
        }),
      }),
      { DB: database },
    );
    assert.equal(createResponse.status, 201);

    const dashboardResponse = await worker.fetch(
      new Request('http://127.0.0.1/api/dashboard', { headers: authHeaders }),
      { DB: database },
    );
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboard.business.name, 'Devlys Hospitality');
    assert.equal(dashboard.locations.length, 1);
    assert.match(dashboard.locations[0].reviewUrl, /^http:\/\/127\.0\.0\.1\/r\//);
    assert.deepEqual(dashboard.totals, { scans: 0, drafts: 0, handoffs: 0 });
  } finally {
    database.close();
  }
});
