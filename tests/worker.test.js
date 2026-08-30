import assert from 'node:assert/strict';
import test from 'node:test';

import worker, {
  buildFallbackDraft,
  isAllowedGoogleUrl,
} from '../worker/index.js';

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
