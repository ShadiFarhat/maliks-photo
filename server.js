const express = require('express');
require('dotenv').config();
const app = express();
const PORT = 3700;

// Image provider: Replicate only
const API_TOKEN = process.env.REPLICATE_API_TOKEN;
const AUTH_HEADER = 'Bearer ' + API_TOKEN;
const REPLICATE = 'https://api.replicate.com/v1';
const MODEL = 'google/nano-banana';

app.use(express.json({ limit: '50mb' }));
app.use(express.static('.', { dotfiles: 'deny' }));

// Proxy: upload base64 image -> Replicate file URL (big photos are too large to send inline)
app.post('/api/upload', async (req, res) => {
  try {
    const m = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(req.body.base64Data || '');
    if (!m) return res.status(400).json({ error: 'Not a valid image' });

    const form = new FormData();
    form.append('content', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), req.body.fileName || 'image');

    const r = await fetch(`${REPLICATE}/files`, {
      method: 'POST',
      headers: { 'Authorization': AUTH_HEADER },
      body: form,
    });
    const data = await r.json();
    if (!r.ok || !data.urls?.get) {
      return res.status(r.ok ? 502 : r.status).json({ error: data.detail || 'Upload failed' });
    }
    res.json({ url: data.urls.get });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: create prediction
app.post('/api/predictions', async (req, res) => {
  try {
    const r = await fetch(`${REPLICATE}/models/${MODEL}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: req.body.input }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: poll prediction
app.get('/api/predictions/:id', async (req, res) => {
  try {
    const r = await fetch(`${REPLICATE}/predictions/${encodeURIComponent(req.params.id)}`, {
      headers: { 'Authorization': AUTH_HEADER },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Only Replicate result hosts may be downloaded through this server
function isReplicateResult(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'replicate.delivery' || u.hostname.endsWith('.replicate.delivery'));
  } catch {
    return false;
  }
}

// Proxy: download generated image
app.get('/api/download', async (req, res) => {
  try {
    if (!isReplicateResult(req.query.url)) return res.status(400).json({ error: 'URL not allowed' });
    const r = await fetch(req.query.url);
    if (!r.ok) return res.status(502).json({ error: 'Download failed' });
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║  Maliks Photo Studio running on :${PORT}   ║`);
    console.log(`  ║  http://localhost:${PORT}                  ║`);
    console.log(`  ╚══════════════════════════════════════════╝`);
    console.log(`  Replicate API Token: ${API_TOKEN ? API_TOKEN.slice(0,6) + '...' + API_TOKEN.slice(-4) : 'NOT FOUND - check .env file'}\n`);
  });
}

module.exports = { app };
