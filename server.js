const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const app = express();
const PORT = 3700;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Proxy: create prediction
app.post('/api/predictions', async (req, res) => {
  try {
    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization,
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

// Proxy: poll prediction
app.get('/api/predictions/:id', async (req, res) => {
  try {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${req.params.id}`, {
      headers: { 'Authorization': req.headers.authorization },
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
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
