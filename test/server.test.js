// Goal: the app talks to Replicate only. Kie is fully off.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.REPLICATE_API_TOKEN = 'test-token';

const realFetch = global.fetch;
const calls = []; // every outside call the server makes

// Fake the outside world: anything not localhost is recorded and answered here
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
  calls.push({ url: u, opts });
  if (u === 'https://api.replicate.com/v1/files') {
    return Response.json({ id: 'f1', urls: { get: 'https://api.replicate.com/v1/files/f1' } }, { status: 201 });
  }
  if (u.endsWith('/predictions')) {
    return Response.json({ id: 'p1', status: 'starting' }, { status: 201 });
  }
  if (u.endsWith('/v1/predictions/pBlocked')) {
    return Response.json({ id: 'pBlocked', status: 'failed', error: 'The input or output was flagged as sensitive. (E005): finishReason=IMAGE_PROHIBITED_CONTENT' });
  }
  if (u.endsWith('/v1/predictions/pBroken')) {
    return Response.json({ id: 'pBroken', status: 'failed', error: 'The input was invalid. (E006)' });
  }
  if (u.includes('/v1/predictions/')) {
    return Response.json({ id: 'p1', status: 'succeeded', output: 'https://replicate.delivery/x/out.jpg' });
  }
  if (u.startsWith('https://replicate.delivery/')) {
    return new Response(Buffer.from('IMG'), { headers: { 'content-type': 'image/jpeg' } });
  }
  return new Response('unexpected', { status: 599 });
};

const { app } = require('../server.js');
let server, base;

test.before(async () => {
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

const post = (p, body) => realFetch(base + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('upload sends the image to Replicate files and returns a url', async () => {
  calls.length = 0;
  const r = await post('/api/upload', { base64Data: 'data:image/png;base64,aGVsbG8=', fileName: 'a.png' });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.url, 'https://api.replicate.com/v1/files/f1');
  assert.equal(calls[0].url, 'https://api.replicate.com/v1/files');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer test-token');
});

test('upload rejects a body that is not a base64 image', async () => {
  const r = await post('/api/upload', { base64Data: 'not-an-image', fileName: 'a.png' });
  assert.equal(r.status, 400);
});

test('create calls the Replicate nano-banana model with the server token', async () => {
  calls.length = 0;
  const r = await post('/api/predictions', { prompt: 'p', image: 'https://api.replicate.com/v1/files/f1' });
  const j = await r.json();
  assert.equal(j.id, 'p1');
  assert.equal(calls[0].url, 'https://api.replicate.com/v1/models/google/nano-banana/predictions');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[0].opts.body).input.image_input, ['https://api.replicate.com/v1/files/f1']);
});

test('fallback create calls Flux Kontext with its own input names', async () => {
  calls.length = 0;
  await post('/api/predictions', { prompt: 'p', image: 'https://api.replicate.com/v1/files/f1', fallback: true });
  assert.equal(calls[0].url, 'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions');
  const input = JSON.parse(calls[0].opts.body).input;
  assert.equal(input.input_image, 'https://api.replicate.com/v1/files/f1');
  assert.equal(input.aspect_ratio, '1:1');
  assert.equal(input.image_input, undefined);
});

test('poll marks a safety-filter failure as blocked', async () => {
  const j = await (await realFetch(base + '/api/predictions/pBlocked')).json();
  assert.equal(j.status, 'failed');
  assert.equal(j.blocked, true);
});

test('poll does not mark other failures or successes as blocked', async () => {
  const broken = await (await realFetch(base + '/api/predictions/pBroken')).json();
  assert.equal(broken.blocked, false);
  const ok = await (await realFetch(base + '/api/predictions/p1')).json();
  assert.equal(ok.blocked, false);
});

test('poll reads the prediction from Replicate', async () => {
  calls.length = 0;
  const j = await (await realFetch(base + '/api/predictions/p1')).json();
  assert.equal(j.status, 'succeeded');
  assert.equal(calls[0].url, 'https://api.replicate.com/v1/predictions/p1');
});

test('download works for replicate.delivery', async () => {
  const r = await realFetch(base + '/api/download?url=' + encodeURIComponent('https://replicate.delivery/x/out.jpg'));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'IMG');
});

test('download refuses any other host', async () => {
  for (const bad of ['http://localhost:3700/.env', 'https://evil.example.com/a.jpg', 'https://replicate.delivery.evil.com/a.jpg', 'nonsense']) {
    calls.length = 0;
    const r = await realFetch(base + '/api/download?url=' + encodeURIComponent(bad));
    assert.equal(r.status, 400, bad);
    assert.equal(calls.length, 0, 'must not fetch ' + bad);
  }
});

test('Kie is fully off: no Kie text in the app code', () => {
  for (const f of ['server.js', 'index.html', 'package.json']) {
    const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!/kie|redpandaai/i.test(txt), f + ' still mentions Kie');
  }
});
