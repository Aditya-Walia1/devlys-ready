import assert from 'node:assert/strict';
import test from 'node:test';

import worker, {
  buildFallbackDraft,
  isAllowedGoogleUrl,
} from '../worker/index.js';
import { createDevDatabase } from '../scripts/dev-review-api.mjs';

const origin = 'https://devlys.example';
const adminHeaders = {
  'oai-authenticated-user-id': 'devlys-owner-1',
  'oai-authenticated-user-email': 'awalia1_be22@thapar.edu',
};
const clientHeaders = {
  'oai-authenticated-user-id': 'client-user-1',
  'oai-authenticated-user-email': 'owner@blueorchid.example',
};
const otherHeaders = {
  'oai-authenticated-user-id': 'other-user-1',
  'oai-authenticated-user-email': 'other@example.com',
};

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', origin);
  }
  return new Request(`${origin}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function submitEnrollment(database) {
  const response = await worker.fetch(request('/api/enrollments', {
    method: 'POST',
    body: {
      businessName: 'Blue Orchid Hospitality',
      contactName: 'Riya Kapoor',
      contactEmail: 'owner@blueorchid.example',
      contactPhone: '+91 98765 43210',
      locationName: 'Blue Orchid Cafe',
      address: 'Khan Market · New Delhi',
      googleReviewUrl: 'https://g.page/r/example/review',
      planCode: 'growth',
    },
  }), { DB: database });
  assert.equal(response.status, 201);
  return response.json();
}

test('fallback draft preserves negative sentiment and supplied detail', () => {
  const draft = buildFallbackDraft({
    businessName: 'Saffron Table',
    rating: 1,
    topics: ['service'],
    note: 'We waited forty minutes for our table',
  });
  assert.match(draft, /did not meet my expectations/i);
  assert.match(draft, /waited forty minutes/i);
  assert.doesNotMatch(draft, /recommend/i);
  assert.doesNotMatch(draft, /great experience|what stood out/i);
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
    request('/api/drafts', {
      method: 'POST',
      body: {
        slug: 'demo',
        sessionId: 'test-session',
        rating: 5,
        topics: ['food', 'ambience'],
        note: 'The team made our family dinner feel special',
      },
    }),
    {},
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.engine, 'safe_fallback');
  assert.match(payload.draft, /family dinner feel special/i);
});

test('draft quality gate requires a specific customer moment', async () => {
  const response = await worker.fetch(
    request('/api/drafts', {
      method: 'POST',
      body: {
        slug: 'demo',
        sessionId: 'quality-session',
        rating: 5,
        topics: ['food', 'service'],
        note: '',
      },
    }),
    {},
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /specific moment/i);
});

test('only a Devlys owner can approve clients or create QR locations', async () => {
  const database = await createDevDatabase();
  try {
    const anonymous = await worker.fetch(request('/api/admin/dashboard'), { DB: database });
    assert.equal(anonymous.status, 401);
    const signedInNonOwner = await worker.fetch(
      request('/api/admin/dashboard', { headers: otherHeaders }),
      { DB: database },
    );
    assert.equal(signedInNonOwner.status, 403);
    const forbiddenCreate = await worker.fetch(
      request('/api/admin/locations', {
        method: 'POST', headers: otherHeaders,
        body: {
          businessId: 'unknown',
          locationName: 'Blocked location',
          address: 'New Delhi',
          googleReviewUrl: 'https://g.page/r/example/review',
        },
      }),
      { DB: database },
    );
    assert.equal(forbiddenCreate.status, 403);
  } finally {
    database.close();
  }
});

test('cross-origin writes are blocked', async () => {
  const response = await worker.fetch(
    new Request(`${origin}/api/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://malicious.example' },
      body: JSON.stringify({ businessName: 'Bad request' }),
    }),
    {},
  );
  assert.equal(response.status, 403);
});

test('commercial lifecycle enrolls, pays, activates, tracks, renews, and reuses one QR', async () => {
  const database = await createDevDatabase();
  try {
    const enrollment = await submitEnrollment(database);

    const queueResponse = await worker.fetch(
      request('/api/admin/dashboard', { headers: adminHeaders }),
      { DB: database },
    );
    const queue = await queueResponse.json();
    assert.equal(queue.role, 'admin');
    assert.equal(queue.totals.applications, 1);
    assert.equal(queue.applications[0].contactEmail, 'owner@blueorchid.example');

    const approvalResponse = await worker.fetch(
      request(`/api/admin/enrollments/${enrollment.applicationId}/approve`, {
        method: 'POST', headers: adminHeaders,
        body: { amountInr: 8999, paymentLinkUrl: 'https://payments.example/blue-orchid', brandColor: '#315efb' },
      }),
      { DB: database },
    );
    assert.equal(approvalResponse.status, 201);
    const approved = await approvalResponse.json();
    const originalSlug = approved.location.slug;

    const inactiveQr = await worker.fetch(
      request(`/api/locations/${originalSlug}`),
      { DB: database },
    );
    assert.equal(inactiveQr.status, 402);

    const clientSessionResponse = await worker.fetch(
      request('/api/me', { headers: clientHeaders }),
      { DB: database },
    );
    const clientSession = await clientSessionResponse.json();
    assert.equal(clientSession.role, 'client');
    assert.equal(clientSession.businessId, approved.businessId);

    const paymentResponse = await worker.fetch(
      request('/api/client/payments', {
        method: 'POST', headers: clientHeaders,
        body: { method: 'upi', reference: 'UPI-TEST-0001' },
      }),
      { DB: database },
    );
    assert.equal(paymentResponse.status, 201);
    const payment = await paymentResponse.json();

    const activationResponse = await worker.fetch(
      request(`/api/admin/businesses/${approved.businessId}/activate`, {
        method: 'POST', headers: adminHeaders,
        body: { paymentId: payment.paymentId },
      }),
      { DB: database },
    );
    assert.equal(activationResponse.status, 200);
    const activation = await activationResponse.json();
    assert.equal(activation.status, 'active');
    assert.equal(activation.payment_status, 'paid');

    const activeQrResponse = await worker.fetch(
      request(`/api/locations/${originalSlug}`),
      { DB: database },
    );
    assert.equal(activeQrResponse.status, 200);

    await database.prepare(
      `UPDATE businesses SET service_ends_at = '2000-01-01 00:00:00' WHERE id = ?`,
    ).bind(approved.businessId).run();
    const expiredClientDashboard = await worker.fetch(
      request('/api/client/dashboard', { headers: clientHeaders }),
      { DB: database },
    );
    assert.equal((await expiredClientDashboard.json()).business.status, 'expired');
    const expiredAdminDashboard = await worker.fetch(
      request('/api/admin/dashboard', { headers: adminHeaders }),
      { DB: database },
    );
    assert.equal((await expiredAdminDashboard.json()).businesses[0].status, 'expired');
    const expiredQrResponse = await worker.fetch(
      request(`/api/locations/${originalSlug}`),
      { DB: database },
    );
    assert.equal(expiredQrResponse.status, 402);
    await database.prepare(
      'UPDATE businesses SET service_ends_at = ? WHERE id = ?',
    ).bind(activation.service_ends_at, approved.businessId).run();

    for (const eventType of ['scan', 'google_open']) {
      const eventResponse = await worker.fetch(
        request('/api/events', {
          method: 'POST',
          body: { slug: originalSlug, sessionId: 'customer-session', eventType },
        }),
        { DB: database },
      );
      assert.equal(eventResponse.status, 201);
    }
    const draftResponse = await worker.fetch(
      request('/api/drafts', {
        method: 'POST',
        body: {
          slug: originalSlug,
          sessionId: 'customer-session',
          rating: 5,
          topics: ['food', 'service'],
          note: 'The team was attentive and our order arrived quickly',
        },
      }),
      { DB: database },
    );
    assert.equal(draftResponse.status, 200);

    const clientDashboardResponse = await worker.fetch(
      request('/api/client/dashboard', { headers: clientHeaders }),
      { DB: database },
    );
    const clientDashboard = await clientDashboardResponse.json();
    assert.equal(clientDashboard.business.status, 'active');
    assert.equal(clientDashboard.business.pricePaise, 899900);
    assert.equal(clientDashboard.locations[0].slug, originalSlug);
    assert.deepEqual(clientDashboard.totals, { scans: 1, drafts: 1, handoffs: 1 });
    const firstExpiry = Date.parse(`${clientDashboard.business.serviceEndsAt.replace(' ', 'T')}Z`);

    const renewalPaymentResponse = await worker.fetch(
      request('/api/client/payments', {
        method: 'POST', headers: clientHeaders,
        body: { method: 'bank_transfer', reference: 'BANK-RENEWAL-0002' },
      }),
      { DB: database },
    );
    const renewalPayment = await renewalPaymentResponse.json();
    await worker.fetch(
      request(`/api/admin/businesses/${approved.businessId}/activate`, {
        method: 'POST', headers: adminHeaders,
        body: { paymentId: renewalPayment.paymentId },
      }),
      { DB: database },
    );

    const renewedDashboardResponse = await worker.fetch(
      request('/api/client/dashboard', { headers: clientHeaders }),
      { DB: database },
    );
    const renewedDashboard = await renewedDashboardResponse.json();
    const renewedExpiry = Date.parse(`${renewedDashboard.business.serviceEndsAt.replace(' ', 'T')}Z`);
    assert.ok(renewedExpiry > firstExpiry);
    assert.equal(renewedDashboard.locations[0].slug, originalSlug);
  } finally {
    database.close();
  }
});

test('a business client can view but cannot create QR locations', async () => {
  const database = await createDevDatabase();
  try {
    const enrollment = await submitEnrollment(database);
    const approval = await worker.fetch(
      request(`/api/admin/enrollments/${enrollment.applicationId}/approve`, {
        method: 'POST', headers: adminHeaders,
        body: { amountInr: 5000, paymentLinkUrl: '', brandColor: '#111827' },
      }),
      { DB: database },
    );
    const approved = await approval.json();
    const response = await worker.fetch(
      request('/api/admin/locations', {
        method: 'POST', headers: clientHeaders,
        body: {
          businessId: approved.businessId,
          locationName: 'Client-created location',
          address: 'Should not be created',
          googleReviewUrl: 'https://g.page/r/example/review',
        },
      }),
      { DB: database },
    );
    assert.equal(response.status, 403);
  } finally {
    database.close();
  }
});
