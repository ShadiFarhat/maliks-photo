const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
require('dotenv').config();
const app = express();
const PORT = 3700;

const API_TOKEN = process.env.KIE_API_TOKEN;
const AUTH_HEADER = 'Bearer ' + API_TOKEN;
const KIE_BASE = 'https://api.kie.ai';
const KIE_UPLOAD = 'https://kieai.redpandaai.co';

app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Proxy: upload base64 image -> returns a hosted URL (Kie needs URLs, not base64)
app.post('/api/upload', async (req, res) => {
  try {
    const r = await fetch(`${KIE_UPLOAD}/api/file-base64-upload`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Data: req.body.base64Data,
        uploadPath: 'maliks-photo',
        fileName: req.body.fileName,
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: create generation task
app.post('/api/predictions', async (req, res) => {
  try {
    const r = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: poll task
app.get('/api/predictions/:id', async (req, res) => {
  try {
    const r = await fetch(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(req.params.id)}`, {
      headers: { 'Authorization': AUTH_HEADER },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: download generated image
app.get('/api/download', async (req, res) => {
  try {
    const r = await fetch(req.query.url);
    const buffer = await r.buffer();
    res.set('Content-Type', r.headers.get('content-type'));
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  Maliks Photo Studio running on :${PORT}   ║`);
  console.log(`  ║  http://localhost:${PORT}                  ║`);
  console.log(`  ╚══════════════════════════════════════════╝`);
  console.log(`  Kie API Token: ${API_TOKEN ? API_TOKEN.slice(0,6) + '...' + API_TOKEN.slice(-4) : 'NOT FOUND - check .env file'}\n`);
});
