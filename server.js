const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// In-memory image store — images live for 30 minutes
var imageStore = {};

function cleanupOldImages() {
  var now = Date.now();
  Object.keys(imageStore).forEach(function(id) {
    if (now - imageStore[id].createdAt > 30 * 60 * 1000) {
      delete imageStore[id];
    }
  });
}

// Health check
app.get('/', function(req, res) {
  res.json({ status: 'Nabo image server running', images: Object.keys(imageStore).length });
});

// Serve a stored image by ID — this is the public URL Instagram fetches
app.get('/img/:id', function(req, res) {
  var entry = imageStore[req.params.id];
  if (!entry) return res.status(404).send('Image not found or expired');
  var buf = Buffer.from(entry.base64, 'base64');
  res.set('Content-Type', entry.mimeType);
  res.set('Content-Length', buf.length);
  res.set('Cache-Control', 'public, max-age=1800');
  res.send(buf);
});

// Generate image via Gemini and store it, return a public URL
app.post('/generate-image', async function(req, res) {
  var prompt = req.body.prompt;
  var apiKey = req.body.apiKey;
  if (!prompt || !apiKey) return res.status(400).json({ error: 'Missing prompt or apiKey' });

  try {
    var geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      }
    );

    var geminiData = await geminiRes.json();
    if (!geminiRes.ok) return res.status(geminiRes.status).json({ error: geminiData.error?.message || 'Gemini error' });

    var parts = geminiData.candidates?.[0]?.content?.parts || [];
    var imgPart = parts.find(function(p) { return p.inlineData?.mimeType?.startsWith('image/'); });
    if (!imgPart) return res.status(500).json({ error: 'No image returned from Gemini' });

    // Store image with a unique ID
    var id = crypto.randomBytes(12).toString('hex');
    imageStore[id] = {
      base64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType,
      createdAt: Date.now()
    };

    cleanupOldImages();

    // Build public URL using the server's own domain
    var host = req.get('host');
    var protocol = req.headers['x-forwarded-proto'] || req.protocol;
    var publicUrl = protocol + '://' + host + '/img/' + id;

    res.json({
      image: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType,
      publicUrl: publicUrl
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Nabo image server on port ' + PORT); });

