const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createCanvas } = require('canvas');
const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

var imageStore = {};

function cleanupOldImages() {
  var now = Date.now();
  Object.keys(imageStore).forEach(function(id) {
    if (now - imageStore[id].createdAt > 30 * 60 * 1000) delete imageStore[id];
  });
}

function storeAndGetUrl(req, base64, mimeType) {
  var id = crypto.randomBytes(12).toString('hex');
  imageStore[id] = { base64: base64, mimeType: mimeType, createdAt: Date.now() };
  cleanupOldImages();
  var host = req.get('host');
  var protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return { id: id, publicUrl: protocol + '://' + host + '/img/' + id };
}

app.get('/', function(req, res) {
  res.json({ status: 'Nabo image server running', images: Object.keys(imageStore).length });
});

app.get('/img/:id', function(req, res) {
  var entry = imageStore[req.params.id];
  if (!entry) return res.status(404).send('Image not found or expired');
  var buf = Buffer.from(entry.base64, 'base64');
  res.set('Content-Type', entry.mimeType);
  res.set('Content-Length', buf.length);
  res.set('Cache-Control', 'public, max-age=1800');
  res.send(buf);
});

// Render a branded Nabo text slide as a PNG image
app.post('/render-text-slide', function(req, res) {
  try {
    var size = 1080;
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext('2d');
    var isClosing = req.body.type === 'closing';

    // Background
    ctx.fillStyle = '#F5F2EC';
    ctx.fillRect(0, 0, size, size);

    // Top accent bar
    ctx.fillStyle = '#2D6A4F';
    ctx.fillRect(0, 0, size, 8);

    // Bottom accent bar
    ctx.fillRect(0, size - 8, size, 8);

    // Decorative corner circles
    ctx.fillStyle = '#52B788';
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(0, 0, 280, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(size, size, 280, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    if (isClosing) {
      // Closing slide
      // Large logo text
      ctx.fillStyle = '#2D6A4F';
      ctx.font = 'bold 88px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('nabo.', size / 2, size / 2 - 40);

      // URL
      ctx.fillStyle = '#52B788';
      ctx.font = '36px sans-serif';
      ctx.fillText('usenabo.com', size / 2, size / 2 + 30);

      // Tagline
      ctx.fillStyle = '#555';
      ctx.font = '28px sans-serif';
      ctx.fillText('Spend less. Share more.', size / 2, size / 2 + 90);

      // Divider line
      ctx.strokeStyle = '#2D6A4F';
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size / 2 - 160, size / 2 - 90);
      ctx.lineTo(size / 2 + 160, size / 2 - 90);
      ctx.stroke();
      ctx.globalAlpha = 1;

    } else {
      // Text info slide
      var heading = req.body.heading || '';
      var body = req.body.body || '';

      // Slide number hint - small nabo pill top right
      ctx.fillStyle = '#2D6A4F';
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.roundRect(size - 180, 40, 130, 44, 22);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2D6A4F';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('nabo.', size - 52, 69);

      // Heading
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1A1A1A';
      ctx.font = 'bold 68px sans-serif';

      // Word-wrap heading
      var headingLines = wrapText(ctx, heading, size - 120);
      var headingY = 280;
      headingLines.forEach(function(line) {
        ctx.fillText(line, 60, headingY);
        headingY += 82;
      });

      // Green underline accent
      ctx.fillStyle = '#52B788';
      ctx.fillRect(60, headingY - 10, 80, 6);
      headingY += 40;

      // Body text
      ctx.fillStyle = '#444';
      ctx.font = '36px sans-serif';
      var bodyLines = wrapText(ctx, body, size - 120);
      bodyLines.forEach(function(line) {
        ctx.fillText(line, 60, headingY);
        headingY += 54;
      });

      // Bottom nabo branding
      ctx.fillStyle = '#2D6A4F';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('usenabo.com', size / 2, size - 40);
    }

    var base64 = canvas.toBuffer('image/png').toString('base64');
    var stored = storeAndGetUrl(req, base64, 'image/png');
    res.json({ image: base64, mimeType: 'image/png', publicUrl: stored.publicUrl });

  } catch(err) {
    console.error('render-text-slide error:', err);
    res.status(500).json({ error: err.message });
  }
});

function wrapText(ctx, text, maxWidth) {
  var words = text.split(' ');
  var lines = [];
  var current = '';
  words.forEach(function(word) {
    var test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

// Gemini image generation
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

    var stored = storeAndGetUrl(req, imgPart.inlineData.data, imgPart.inlineData.mimeType);
    res.json({ image: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType, publicUrl: stored.publicUrl });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Nabo image server on port ' + PORT); });


