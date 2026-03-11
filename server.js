const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json({ limit: '30mb' }));

// ── image store (60 min TTL) ──────────────────────────────────────────────────
var imageStore = {};
function cleanupOldImages() {
  var now = Date.now();
  Object.keys(imageStore).forEach(function(id) {
    if (now - imageStore[id].createdAt > 60 * 60 * 1000) delete imageStore[id];
  });
}
function storeAndGetUrl(req, base64, mimeType) {
  var id = crypto.randomBytes(12).toString('hex');
  imageStore[id] = { base64, mimeType, createdAt: Date.now() };
  cleanupOldImages();
  var host = req.get('host');
  var protocol = req.headers['x-forwarded-proto'] || req.protocol;
  // Always use .png extension so Instagram recognises it as an image
  return { id, publicUrl: protocol + '://' + host + '/img/' + id + '.png' };
}

app.get('/', function(req, res) {
  res.json({ status: 'Nabo image server running', images: Object.keys(imageStore).length });
});

// Serve image — accept both /img/:id and /img/:id.png
app.get('/img/:id', function(req, res) {
  // Strip .png extension if present
  var rawId = req.params.id.replace(/\.png$/i, '');
  var entry = imageStore[rawId];
  if (!entry) return res.status(404).send('Image not found or expired');
  var buf = Buffer.from(entry.base64, 'base64');
  res.set('Content-Type', 'image/png');
  res.set('Content-Length', buf.length);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(buf);
});

// Receive a pre-rendered PNG from the browser and host it
app.post('/store-image', function(req, res) {
  var { image, mimeType } = req.body;
  if (!image) return res.status(400).json({ error: 'No image data' });
  var stored = storeAndGetUrl(req, image, mimeType || 'image/png');
  res.json({ publicUrl: stored.publicUrl });
});

// Proxy an external image URL (fixes CORS for Unsplash etc.)
app.get('/proxy-image', async function(req, res) {
  var url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url param' });
  try {
    var r = await fetch(url, { headers: { 'User-Agent': 'NaboBot/1.0' } });
    if (!r.ok) return res.status(r.status).send('Upstream error');
    var buf = Buffer.from(await r.arrayBuffer());
    var ct = r.headers.get('content-type') || 'image/jpeg';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini image generation (optional, for hero)
app.post('/generate-image', async function(req, res) {
  var prompt = req.body.prompt;
  var apiKey = req.body.apiKey;
  if (!prompt || !apiKey) return res.status(400).json({ error: 'Missing prompt or apiKey' });
  try {
    var geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      }
    );
    var data = await geminiRes.json();
    if (!geminiRes.ok) return res.status(geminiRes.status).json({ error: data.error?.message || 'Gemini error' });
    var parts = data.candidates?.[0]?.content?.parts || [];
    var imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart) return res.status(500).json({ error: 'No image returned from Gemini' });
    var stored = storeAndGetUrl(req, imgPart.inlineData.data, imgPart.inlineData.mimeType);
    res.json({ image: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType, publicUrl: stored.publicUrl });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Nabo image server on port ' + PORT); });
