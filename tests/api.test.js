const request = require('supertest');
const app = require('../index');

function urlOfLength(targetLen) {
  const prefix = 'https://cdn.example.com/';
  return prefix + 'a'.repeat(targetLen - prefix.length);
}

function imageUrls(n, tag = 'x') {
  return Array.from({ length: n }, (_, i) => `https://cdn.example.com/${tag}-${i}.jpg`);
}

function videoUrls(n, tag = 'x') {
  return Array.from({ length: n }, (_, i) => `https://cdn.example.com/${tag}-${i}.mp4`);
}

describe('POST /request — input validation', () => {
  const uid = (suffix) => `v1-${suffix}`;

  test('400 on malformed JSON body', async () => {
    const res = await request(app)
      .post('/request')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Invalid JSON body' });
  });

  test('400 when body is a JSON array (not an object)', async () => {
    const res = await request(app).post('/request').send([{ user_id: 'x', payload: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body');
  });

  test('400 when user_id is absent', async () => {
    const res = await request(app).post('/request').send({ payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id is required and must be a non-empty string');
  });

  test('400 when user_id is null', async () => {
    const res = await request(app).post('/request').send({ user_id: null, payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id is required and must be a non-empty string');
  });

  test('400 when user_id is a number', async () => {
    const res = await request(app).post('/request').send({ user_id: 42, payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id is required and must be a non-empty string');
  });

  test('400 when user_id is a boolean', async () => {
    const res = await request(app).post('/request').send({ user_id: true, payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id is required and must be a non-empty string');
  });

  test('400 when user_id is an empty string', async () => {
    const res = await request(app).post('/request').send({ user_id: '', payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id is required and must be a non-empty string');
  });

  test('400 when user_id is whitespace-only', async () => {
    const res = await request(app).post('/request').send({ user_id: '   ', payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id is required and must be a non-empty string');
  });

  test('400 when user_id is 257 characters (one over limit)', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: 'a'.repeat(257), payload: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('user_id must not exceed 256 characters');
  });

  test('400 when payload key is absent (user_id is valid)', async () => {
    const res = await request(app).post('/request').send({ user_id: uid('no-payload') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('payload is required');
  });

  test('201 when user_id is exactly 256 characters (boundary)', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: 'b'.repeat(256), payload: 'x' });
    expect(res.status).toBe(201);
  });

  test('201 when payload is null (key exists — any value allowed)', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: uid('null-payload'), payload: null });
    expect(res.status).toBe(201);
  });

  test('201 when payload is false', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: uid('false-payload'), payload: false });
    expect(res.status).toBe(201);
  });

  test('201 when payload is 0', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: uid('zero-payload'), payload: 0 });
    expect(res.status).toBe(201);
  });

  test('201 when payload is an empty string', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: uid('emptystr-payload'), payload: '' });
    expect(res.status).toBe(201);
  });

  test('201 and user_id is trimmed in response when it has surrounding spaces', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: `  ${uid('trimmed')}  `, payload: 'x' });
    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(uid('trimmed'));
  });
});

describe('POST /request — 201 response shape', () => {
  test('response contains all required fields with correct types', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: 'shape-check-user', payload: { action: 'buy' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'accepted',
      message: 'Request accepted',
      user_id: 'shape-check-user',
    });
    expect(typeof res.body.accepted_in_window).toBe('number');
    expect(res.body.accepted_in_window).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /request — rate limiting behaviour', () => {
  const RATE_USER = 'rl-window-user';

  test('first 5 requests return 201 with incrementing accepted_in_window', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/request')
        .send({ user_id: RATE_USER, payload: 'test' });
      expect(res.status).toBe(201);
      expect(res.body.accepted_in_window).toBe(i);
    }
  });

  test('6th request returns 429 (limit exhausted)', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: RATE_USER, payload: 'test' });
    expect(res.status).toBe(429);
  });

  test('429 response contains all required fields', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: RATE_USER, payload: 'x' });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      status: 'rejected',
      error: 'Rate limit exceeded',
      message: 'Maximum 5 requests per minute allowed per user',
      user_id: RATE_USER,
    });
    expect(typeof res.body.retry_after_seconds).toBe('number');
    expect(res.body.retry_after_seconds).toBeGreaterThan(0);
    expect(res.body.retry_after_seconds).toBeLessThanOrEqual(60);
  });

  test('retry_after_seconds is a whole number (Math.ceil result)', async () => {
    const res = await request(app)
      .post('/request')
      .send({ user_id: RATE_USER, payload: 'x' });
    expect(res.status).toBe(429);
    expect(Number.isInteger(res.body.retry_after_seconds)).toBe(true);
  });

  test('different users have completely independent rate limit windows', async () => {
    const userA = 'rl-indep-a';
    const userB = 'rl-indep-b';

    for (let i = 0; i < 5; i++) {
      await request(app).post('/request').send({ user_id: userA, payload: 'x' });
    }
    const exhaustedA = await request(app)
      .post('/request')
      .send({ user_id: userA, payload: 'x' });
    expect(exhaustedA.status).toBe(429);

    const resB = await request(app).post('/request').send({ user_id: userB, payload: 'x' });
    expect(resB.status).toBe(201);
    expect(resB.body.accepted_in_window).toBe(1);
  });

  test('rejected count is cumulative across multiple rejections', async () => {
    const userId = 'rl-cumulative-user';
    for (let i = 0; i < 8; i++) {
      await request(app).post('/request').send({ user_id: userId, payload: 'x' });
    }
    const stats = await request(app).get('/stats');
    const entry = stats.body.users.find((u) => u.user_id === userId);
    expect(entry.accepted_in_window).toBe(5);
    expect(entry.rejected_cumulative).toBe(3);
  });
});

describe('GET /stats', () => {
  test('200 with correct top-level shape', async () => {
    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(typeof res.body.global.total_accepted_in_window).toBe('number');
    expect(typeof res.body.global.total_rejected_cumulative).toBe('number');
  });

  test('per-user entry has all required fields with correct types', async () => {
    await request(app).post('/request').send({ user_id: 'stats-shape-check', payload: 'x' });

    const res = await request(app).get('/stats');
    const entry = res.body.users.find((u) => u.user_id === 'stats-shape-check');
    expect(entry).toBeDefined();
    expect(typeof entry.accepted_in_window).toBe('number');
    expect(typeof entry.rejected_cumulative).toBe('number');
    expect(typeof entry.window_started_at).toBe('string');
    expect(new Date(entry.window_started_at).toISOString()).toBe(entry.window_started_at);
  });

  test('global totals are non-negative integers', async () => {
    const res = await request(app).get('/stats');
    expect(res.body.global.total_accepted_in_window).toBeGreaterThanOrEqual(0);
    expect(res.body.global.total_rejected_cumulative).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.body.global.total_accepted_in_window)).toBe(true);
    expect(Number.isInteger(res.body.global.total_rejected_cumulative)).toBe(true);
  });

  test('global totals reflect cumulative activity across all users', async () => {
    const before = (await request(app).get('/stats')).body.global.total_accepted_in_window;
    await request(app).post('/request').send({ user_id: 'stats-total-delta', payload: 'x' });
    await request(app).post('/request').send({ user_id: 'stats-total-delta', payload: 'x' });
    const after = (await request(app).get('/stats')).body.global.total_accepted_in_window;
    expect(after).toBe(before + 2);
  });

  test('stats includes users with rejected_cumulative of 0', async () => {
    await request(app).post('/request').send({ user_id: 'stats-no-rejections', payload: 'x' });
    const res = await request(app).get('/stats');
    const entry = res.body.users.find((u) => u.user_id === 'stats-no-rejections');
    expect(entry).toBeDefined();
    expect(entry.rejected_cumulative).toBe(0);
  });
});

describe('POST /products — input validation', () => {
  const sku = (s) => `VAL-${s}`;

  test('400 on malformed JSON body', async () => {
    const res = await request(app)
      .post('/products')
      .set('Content-Type', 'application/json')
      .send('{bad json}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Invalid JSON body' });
  });

  test('400 when body is a JSON array', async () => {
    const res = await request(app).post('/products').send([{ name: 'x', sku: sku('arr') }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body');
  });

  test('400 when name is absent', async () => {
    const res = await request(app).post('/products').send({ sku: sku('no-name') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name is required and must be a non-empty string');
  });

  test('400 when name is null', async () => {
    const res = await request(app).post('/products').send({ name: null, sku: sku('null-name') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name is required and must be a non-empty string');
  });

  test('400 when name is a number', async () => {
    const res = await request(app).post('/products').send({ name: 99, sku: sku('num-name') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name is required and must be a non-empty string');
  });

  test('400 when name is an empty string', async () => {
    const res = await request(app).post('/products').send({ name: '', sku: sku('empty-name') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name is required and must be a non-empty string');
  });

  test('400 when name is whitespace-only', async () => {
    const res = await request(app).post('/products').send({ name: '   ', sku: sku('ws-name') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name is required and must be a non-empty string');
  });

  test('400 when name is 501 characters (one over limit)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'n'.repeat(501), sku: sku('long-name') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('name must not exceed 500 characters');
  });

  test('400 when sku is absent', async () => {
    const res = await request(app).post('/products').send({ name: 'Widget' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('sku is required and must be a non-empty string');
  });

  test('400 when sku is an empty string', async () => {
    const res = await request(app).post('/products').send({ name: 'Widget', sku: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('sku is required and must be a non-empty string');
  });

  test('400 when sku is whitespace-only', async () => {
    const res = await request(app).post('/products').send({ name: 'Widget', sku: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('sku is required and must be a non-empty string');
  });

  test('400 when sku is 101 characters (one over limit)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Widget', sku: 's'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('sku must not exceed 100 characters');
  });

  test('400 when image_urls is a string (not array)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-str'), image_urls: 'https://cdn.example.com/a.jpg' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('image_urls must be an array');
  });

  test('400 when image_urls is an object (not array)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-obj'), image_urls: { url: 'https://cdn.example.com/a.jpg' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('image_urls must be an array');
  });

  test('400 when image_urls has 21 entries (one over limit)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-21'), image_urls: imageUrls(21) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('image_urls must not exceed 20 URLs per request');
  });

  test('400 when an image URL is not a string (number)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-num-url'), image_urls: [42] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Each URL must be a string');
  });

  test('400 when image URL has ftp:// scheme', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-ftp'), image_urls: ['ftp://cdn.example.com/img.jpg'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must start with http:// or https://');
  });

  test('400 when image URL has no scheme at all', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-noscheme'), image_urls: ['cdn.example.com/img.jpg'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must start with http:// or https://');
  });

  test('400 when image URL exceeds 2048 characters after trim', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('img-2049'), image_urls: [urlOfLength(2049)] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('URL exceeds maximum allowed length of 2048 characters');
  });

  test('400 when video_urls is a string (not array)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('vid-str'), video_urls: 'https://cdn.example.com/v.mp4' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('video_urls must be an array');
  });

  test('400 when video_urls has 21 entries (one over limit)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('vid-21'), video_urls: videoUrls(21) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('video_urls must not exceed 20 URLs per request');
  });

  test('400 when video URL has invalid scheme', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'X', sku: sku('vid-bad'), video_urls: ['data:video/mp4,abc'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must start with http:// or https://');
  });

  test('409 when SKU is a duplicate', async () => {
    const dupSku = 'DUPE-409-001';
    await request(app).post('/products').send({ name: 'Original', sku: dupSku });
    const res = await request(app).post('/products').send({ name: 'Duplicate', sku: dupSku });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Conflict',
      message: 'A product with this SKU already exists',
    });
  });

  test('409 persists — SKU locked even after conflict response', async () => {
    const lockedSku = 'DUPE-409-002';
    await request(app).post('/products').send({ name: 'First', sku: lockedSku });
    await request(app).post('/products').send({ name: 'Second', sku: lockedSku });
    const res = await request(app).post('/products').send({ name: 'Third', sku: lockedSku });
    expect(res.status).toBe(409);
  });
});

describe('POST /products — success paths and boundary conditions', () => {
  const sku = (s) => `OK-${s}`;

  test('201 with fully correct response shape', async () => {
    const res = await request(app).post('/products').send({
      name: 'Widget Alpha',
      sku: sku('shape'),
      image_urls: ['https://cdn.example.com/img1.jpg'],
      video_urls: ['https://cdn.example.com/vid1.mp4'],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(new Date(res.body.created_at).toISOString()).toBe(res.body.created_at);
    expect(res.body).toMatchObject({
      name: 'Widget Alpha',
      sku: sku('shape'),
      image_count: 1,
      video_count: 1,
      image_urls: ['https://cdn.example.com/img1.jpg'],
      video_urls: ['https://cdn.example.com/vid1.mp4'],
    });
  });

  test('201 when image_urls and video_urls are omitted — defaults to empty', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'No Media', sku: sku('no-media') });
    expect(res.status).toBe(201);
    expect(res.body.image_count).toBe(0);
    expect(res.body.video_count).toBe(0);
    expect(res.body.image_urls).toEqual([]);
    expect(res.body.video_urls).toEqual([]);
  });

  test('201 when image_urls is null (treated as optional / absent)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Null Image', sku: sku('null-img'), image_urls: null });
    expect(res.status).toBe(201);
    expect(res.body.image_count).toBe(0);
    expect(res.body.image_urls).toEqual([]);
  });

  test('201 when video_urls is null (treated as optional / absent)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Null Video', sku: sku('null-vid'), video_urls: null });
    expect(res.status).toBe(201);
    expect(res.body.video_count).toBe(0);
  });

  test('name is stored trimmed when submitted with surrounding whitespace', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: '  Padded Name  ', sku: sku('name-trim') });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Padded Name');
  });

  test('sku is stored trimmed when submitted with surrounding whitespace', async () => {
    const cleanSku = sku('sku-trim');
    const res = await request(app)
      .post('/products')
      .send({ name: 'SKU Trim', sku: `  ${cleanSku}  ` });
    expect(res.status).toBe(201);
    expect(res.body.sku).toBe(cleanSku);
  });

  test('image URL with leading/trailing spaces is trimmed before storage', async () => {
    const res = await request(app).post('/products').send({
      name: 'URL Trim',
      sku: sku('url-trim'),
      image_urls: [' https://cdn.example.com/trimmed.jpg '],
    });
    expect(res.status).toBe(201);
    expect(res.body.image_urls[0]).toBe('https://cdn.example.com/trimmed.jpg');
  });

  test('201 with exactly 20 image_urls (boundary)', async () => {
    const urls = imageUrls(20, 'boundary');
    const res = await request(app)
      .post('/products')
      .send({ name: 'Max URLs', sku: sku('20-urls'), image_urls: urls });
    expect(res.status).toBe(201);
    expect(res.body.image_count).toBe(20);
  });

  test('201 when name is exactly 500 characters (boundary)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'n'.repeat(500), sku: sku('name-500') });
    expect(res.status).toBe(201);
  });

  test('201 when sku is exactly 100 characters (boundary)', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Long SKU', sku: 's'.repeat(100) });
    expect(res.status).toBe(201);
  });

  test('201 when image URL is exactly 2048 characters (boundary)', async () => {
    const res = await request(app).post('/products').send({
      name: 'Max URL Length',
      sku: sku('url-2048'),
      image_urls: [urlOfLength(2048)],
    });
    expect(res.status).toBe(201);
    expect(res.body.image_count).toBe(1);
  });

  test('http:// URLs are accepted (not just https://)', async () => {
    const res = await request(app).post('/products').send({
      name: 'HTTP Product',
      sku: sku('http-url'),
      image_urls: ['http://cdn.example.com/img.jpg'],
    });
    expect(res.status).toBe(201);
    expect(res.body.image_urls[0]).toBe('http://cdn.example.com/img.jpg');
  });

  test('image_count and video_count reflect exact number of URLs provided', async () => {
    const res = await request(app).post('/products').send({
      name: 'Count Check',
      sku: sku('counts'),
      image_urls: imageUrls(3, 'count'),
      video_urls: videoUrls(2, 'count'),
    });
    expect(res.status).toBe(201);
    expect(res.body.image_count).toBe(3);
    expect(res.body.video_count).toBe(2);
    expect(res.body.image_urls).toHaveLength(3);
    expect(res.body.video_urls).toHaveLength(2);
  });
});

describe('GET /products — query param validation', () => {
  test('400 when limit is a float (e.g. 20.5)', async () => {
    const res = await request(app).get('/products?limit=20.5');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('limit must be a whole number');
  });

  test('400 when limit is 0', async () => {
    const res = await request(app).get('/products?limit=0');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('limit must be a positive integer');
  });

  test('400 when limit is negative', async () => {
    const res = await request(app).get('/products?limit=-5');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('limit must be a positive integer');
  });

  test('400 when limit is a non-numeric string', async () => {
    const res = await request(app).get('/products?limit=abc');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('limit must be a positive integer');
  });

  test('400 when limit exceeds 100', async () => {
    const res = await request(app).get('/products?limit=101');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('limit must not exceed 100');
  });

  test('400 when offset is a float', async () => {
    const res = await request(app).get('/products?offset=1.9');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('offset must be a whole number');
  });

  test('400 when offset is negative', async () => {
    const res = await request(app).get('/products?offset=-1');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('offset must be a non-negative integer');
  });

  test('400 when offset is a non-numeric string', async () => {
    const res = await request(app).get('/products?offset=xyz');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('offset must be a non-negative integer');
  });
});

describe('GET /products — pagination behaviour', () => {
  const PAGE_SKU = (i) => `PAGE-SKU-${i}`;
  const createdIds = [];

  beforeAll(async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/products').send({
        name: `Page Product ${i}`,
        sku: PAGE_SKU(i),
        image_urls: ['https://cdn.example.com/page-img.jpg'],
      });
      createdIds.push(res.body.id);
    }
  });

  test('200 with correct top-level shape using defaults', async () => {
    const res = await request(app).get('/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.pagination).toMatchObject({ limit: 20, offset: 0 });
    expect(typeof res.body.pagination.total).toBe('number');
    expect(typeof res.body.pagination.has_more).toBe('boolean');
  });

  test('list products contain ONLY core fields — no image_urls or video_urls', async () => {
    const res = await request(app).get('/products?limit=5');
    expect(res.status).toBe(200);
    for (const product of res.body.products) {
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('sku');
      expect(product).toHaveProperty('image_count');
      expect(product).toHaveProperty('video_count');
      expect(product).toHaveProperty('created_at');
      expect(product).not.toHaveProperty('image_urls');
      expect(product).not.toHaveProperty('video_urls');
    }
  });

  test('limit=1 returns exactly 1 product', async () => {
    const res = await request(app).get('/products?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  test('limit=100 is accepted (maximum valid value)', async () => {
    const res = await request(app).get('/products?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  test('offset skips the correct number of products', async () => {
    const resAll = await request(app).get('/products?limit=100&offset=0');
    const resOffset = await request(app).get('/products?limit=100&offset=1');
    expect(resOffset.status).toBe(200);
    expect(resOffset.body.pagination.offset).toBe(1);
    if (resAll.body.products.length >= 2) {
      expect(resOffset.body.products[0].id).toBe(resAll.body.products[1].id);
    }
  });

  test('has_more is true when more products exist beyond the current page', async () => {
    const resAll = await request(app).get('/products?limit=100');
    const total = resAll.body.pagination.total;
    if (total >= 2) {
      const res = await request(app).get('/products?limit=1&offset=0');
      expect(res.body.pagination.has_more).toBe(true);
    }
  });

  test('has_more is false when all products fit on one page', async () => {
    const res = await request(app).get('/products?limit=100&offset=0');
    expect(res.body.pagination.has_more).toBe(false);
  });

  test('has_more is false when offset + page size equals total', async () => {
    const resAll = await request(app).get('/products?limit=100');
    const total = resAll.body.pagination.total;
    const res = await request(app).get(`/products?limit=1&offset=${total - 1}`);
    expect(res.body.pagination.has_more).toBe(false);
    expect(res.body.products).toHaveLength(1);
  });

  test('offset beyond total returns empty products array', async () => {
    const res = await request(app).get('/products?limit=10&offset=99999');
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.pagination.has_more).toBe(false);
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  test('pagination.total reflects the complete store count, not the page size', async () => {
    const resLimited = await request(app).get('/products?limit=1');
    const resFull = await request(app).get('/products?limit=100');
    expect(resLimited.body.pagination.total).toBe(resFull.body.pagination.total);
  });

  test('products are returned in insertion order (oldest first)', async () => {
    const res = await request(app).get('/products?limit=100');
    const ids = res.body.products.map((p) => p.id);
    for (let i = 1; i < createdIds.length; i++) {
      const prevIdx = ids.indexOf(createdIds[i - 1]);
      const currIdx = ids.indexOf(createdIds[i]);
      expect(prevIdx).toBeGreaterThanOrEqual(0);
      expect(currIdx).toBeGreaterThan(prevIdx);
    }
  });
});

describe('GET /products/:id', () => {
  let productId;

  beforeAll(async () => {
    const res = await request(app).post('/products').send({
      name: 'Detail Test Product',
      sku: 'DETAIL-001',
      image_urls: ['https://cdn.example.com/detail-img.jpg'],
      video_urls: ['https://cdn.example.com/detail-vid.mp4'],
    });
    productId = res.body.id;
  });

  test('200 with full product shape including URL arrays', async () => {
    const res = await request(app).get(`/products/${productId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: productId,
      name: 'Detail Test Product',
      sku: 'DETAIL-001',
      image_count: 1,
      video_count: 1,
      image_urls: ['https://cdn.example.com/detail-img.jpg'],
      video_urls: ['https://cdn.example.com/detail-vid.mp4'],
    });
    expect(new Date(res.body.created_at).toISOString()).toBe(res.body.created_at);
  });

  test('detail response includes image_urls and video_urls (not just counts)', async () => {
    const res = await request(app).get(`/products/${productId}`);
    expect(Array.isArray(res.body.image_urls)).toBe(true);
    expect(Array.isArray(res.body.video_urls)).toBe(true);
  });

  test('404 when product id does not exist (valid UUID format)', async () => {
    const res = await request(app).get('/products/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', message: 'Product not found' });
  });

  test('404 when id is an arbitrary non-UUID string', async () => {
    const res = await request(app).get('/products/this-id-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});

describe('POST /products/:id/media — input validation', () => {
  let productId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Media Validation Base', sku: 'MEDIAV-BASE-001' });
    productId = res.body.id;
  });

  test('400 on malformed JSON body', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .set('Content-Type', 'application/json')
      .send('{bad json}');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body');
  });

  test('400 when both image_urls and video_urls are absent', async () => {
    const res = await request(app).post(`/products/${productId}/media`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At least one URL must be provided in image_urls or video_urls');
  });

  test('400 when both are explicitly empty arrays', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ image_urls: [], video_urls: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At least one URL must be provided in image_urls or video_urls');
  });

  test('400 when image_urls is empty and video_urls is absent', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ image_urls: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At least one URL must be provided in image_urls or video_urls');
  });

  test('400 when video_urls is empty and image_urls is absent', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ video_urls: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At least one URL must be provided in image_urls or video_urls');
  });

  test('400 when image_urls is not an array', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ image_urls: 'https://cdn.example.com/img.jpg' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('image_urls must be an array');
  });

  test('400 when video_urls exceeds 20 entries', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ video_urls: videoUrls(21, 'mv') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('video_urls must not exceed 20 URLs per request');
  });

  test('400 when image URL has an invalid scheme', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ image_urls: ['ftp://cdn.example.com/img.jpg'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must start with http:// or https://');
  });

  test('400 when image URL with leading space has invalid scheme after trim', async () => {
    const res = await request(app)
      .post(`/products/${productId}/media`)
      .send({ image_urls: [' ftp://cdn.example.com/img.jpg'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must start with http:// or https://');
  });

  test('404 when product id does not exist', async () => {
    const res = await request(app)
      .post('/products/00000000-0000-0000-0000-000000000000/media')
      .send({ image_urls: ['https://cdn.example.com/img.jpg'] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', message: 'Product not found' });
  });
});

describe('POST /products/:id/media — success and state', () => {
  let productId;

  beforeAll(async () => {
    const res = await request(app).post('/products').send({
      name: 'Media Append Base',
      sku: 'MEDIA-APPEND-BASE-001',
      image_urls: ['https://cdn.example.com/original.jpg'],
    });
    productId = res.body.id;
  });

  test('200 when appending only image_urls', async () => {
    const res = await request(app).post(`/products/${productId}/media`).send({
      image_urls: ['https://cdn.example.com/new1.jpg'],
    });
    expect(res.status).toBe(200);
    expect(res.body.image_urls).toContain('https://cdn.example.com/original.jpg');
    expect(res.body.image_urls).toContain('https://cdn.example.com/new1.jpg');
  });

  test('200 when appending only video_urls', async () => {
    const res = await request(app).post(`/products/${productId}/media`).send({
      video_urls: ['https://cdn.example.com/vid1.mp4'],
    });
    expect(res.status).toBe(200);
    expect(res.body.video_urls).toContain('https://cdn.example.com/vid1.mp4');
  });

  test('200 when appending both image_urls and video_urls', async () => {
    const res = await request(app).post(`/products/${productId}/media`).send({
      image_urls: ['https://cdn.example.com/extra.jpg'],
      video_urls: ['https://cdn.example.com/extra.mp4'],
    });
    expect(res.status).toBe(200);
    expect(res.body.image_urls.length).toBeGreaterThanOrEqual(2);
    expect(res.body.video_urls.length).toBeGreaterThanOrEqual(1);
  });

  test('image_count and video_count update correctly after appends', async () => {
    const res = await request(app).get(`/products/${productId}`);
    expect(res.body.image_count).toBe(3);
    expect(res.body.video_count).toBe(2);
  });

  test('appended URLs are trimmed before storage', async () => {
    const trimId = (
      await request(app)
        .post('/products')
        .send({ name: 'Trim Append', sku: 'TRIM-APPEND-TEST-001' })
    ).body.id;

    const res = await request(app).post(`/products/${trimId}/media`).send({
      image_urls: [' https://cdn.example.com/trimmed-append.jpg '],
    });
    expect(res.status).toBe(200);
    expect(res.body.image_urls[0]).toBe('https://cdn.example.com/trimmed-append.jpg');
  });

  test('multiple sequential appends accumulate correctly', async () => {
    const accId = (
      await request(app)
        .post('/products')
        .send({ name: 'Accumulate', sku: 'ACCUM-MEDIA-001' })
    ).body.id;

    await request(app)
      .post(`/products/${accId}/media`)
      .send({ image_urls: ['https://cdn.example.com/a1.jpg'] });
    await request(app)
      .post(`/products/${accId}/media`)
      .send({ image_urls: ['https://cdn.example.com/a2.jpg'] });
    await request(app)
      .post(`/products/${accId}/media`)
      .send({ video_urls: ['https://cdn.example.com/v1.mp4'] });

    const detail = await request(app).get(`/products/${accId}`);
    expect(detail.body.image_count).toBe(2);
    expect(detail.body.video_count).toBe(1);
    expect(detail.body.image_urls).toHaveLength(2);
    expect(detail.body.video_urls).toHaveLength(1);
  });

  test('full response shape on 200 includes all product fields', async () => {
    const newProd = (
      await request(app)
        .post('/products')
        .send({ name: 'Shape Check', sku: 'MEDIA-SHAPE-001' })
    ).body;

    const res = await request(app).post(`/products/${newProd.id}/media`).send({
      image_urls: ['https://cdn.example.com/shape.jpg'],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', newProd.id);
    expect(res.body).toHaveProperty('name', 'Shape Check');
    expect(res.body).toHaveProperty('sku', 'MEDIA-SHAPE-001');
    expect(res.body).toHaveProperty('image_count', 1);
    expect(res.body).toHaveProperty('video_count', 0);
    expect(res.body).toHaveProperty('created_at');
    expect(Array.isArray(res.body.image_urls)).toBe(true);
    expect(Array.isArray(res.body.video_urls)).toBe(true);
  });
});

describe('State consistency across endpoints', () => {
  test('product created via POST is immediately fetchable via GET /:id', async () => {
    const created = await request(app)
      .post('/products')
      .send({ name: 'Consistency Check', sku: 'STATE-CON-001' });
    const id = created.body.id;

    const fetched = await request(app).get(`/products/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(id);
    expect(fetched.body.sku).toBe('STATE-CON-001');
  });

  test('product appears in GET /products list immediately after creation', async () => {
    const created = await request(app)
      .post('/products')
      .send({ name: 'List State', sku: 'STATE-LIST-001' });
    const id = created.body.id;

    const list = await request(app).get('/products?limit=100');
    const found = list.body.products.find((p) => p.id === id);
    expect(found).toBeDefined();
    expect(found.sku).toBe('STATE-LIST-001');
  });

  test('image_count in list matches image_count in detail view', async () => {
    const created = await request(app).post('/products').send({
      name: 'Count Sync',
      sku: 'STATE-COUNT-001',
      image_urls: imageUrls(3, 'sync'),
    });
    const id = created.body.id;

    const list = await request(app).get('/products?limit=100');
    const listProduct = list.body.products.find((p) => p.id === id);
    const detail = await request(app).get(`/products/${id}`);

    expect(listProduct.image_count).toBe(3);
    expect(detail.body.image_count).toBe(3);
    expect(detail.body.image_urls).toHaveLength(3);
  });

  test('image_count in list updates after appendMedia', async () => {
    const created = await request(app)
      .post('/products')
      .send({ name: 'Append Sync', sku: 'STATE-APPEND-001' });
    const id = created.body.id;

    const before = (await request(app).get('/products?limit=100')).body.products.find(
      (p) => p.id === id
    );
    expect(before.image_count).toBe(0);

    await request(app)
      .post(`/products/${id}/media`)
      .send({ image_urls: imageUrls(2, 'append-sync') });

    const after = (await request(app).get('/products?limit=100')).body.products.find(
      (p) => p.id === id
    );
    expect(after.image_count).toBe(2);
  });

  test('list endpoint never exposes URL arrays even for products with media', async () => {
    const created = await request(app).post('/products').send({
      name: 'No URLs In List',
      sku: 'STATE-NOURLS-001',
      image_urls: imageUrls(5, 'nourls'),
      video_urls: videoUrls(3, 'nourls'),
    });
    const id = created.body.id;

    const list = await request(app).get('/products?limit=100');
    const listProduct = list.body.products.find((p) => p.id === id);
    expect(listProduct).not.toHaveProperty('image_urls');
    expect(listProduct).not.toHaveProperty('video_urls');
    expect(listProduct.image_count).toBe(5);
    expect(listProduct.video_count).toBe(3);
  });

  test('pagination total increments after each successful product creation', async () => {
    const before = (await request(app).get('/products?limit=100')).body.pagination.total;
    await request(app).post('/products').send({ name: 'Total Increment', sku: 'STATE-TOTAL-001' });
    const after = (await request(app).get('/products?limit=100')).body.pagination.total;
    expect(after).toBe(before + 1);
  });
});

describe('Global middleware — 404 and error handling', () => {
  test('GET to an unknown route returns 404 with correct message', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'Not Found',
      message: 'Route GET /unknown-route does not exist',
    });
  });

  test('POST to an unknown route returns 404 mentioning the method', async () => {
    const res = await request(app).post('/unknown-route').send({});
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('POST');
    expect(res.body.message).toContain('/unknown-route');
  });

  test('DELETE /products (unhandled method) returns 404', async () => {
    const res = await request(app).delete('/products');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });

  test('PUT /products/:id (unhandled method) returns 404', async () => {
    const res = await request(app).put('/products/some-id').send({ name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });

  test('malformed JSON returns 400 with correct body (not 500)', async () => {
    const res = await request(app)
      .post('/products')
      .set('Content-Type', 'application/json')
      .send('{"name": "missing-closing-brace"');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Invalid JSON body' });
  });

  test('all 404 responses are JSON (Content-Type application/json)', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('all 400 validation responses are JSON', async () => {
    const res = await request(app).post('/request').send({ payload: 'x' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.status).toBe(400);
  });
});
