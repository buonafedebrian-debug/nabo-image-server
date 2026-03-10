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

// ── helpers ──────────────────────────────────────────────────────────────────
function wrapText(ctx, text, maxWidth) {
  var words = String(text).split(' ');
  var lines = [], cur = '';
  words.forEach(function(w) {
    var test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  });
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── slide renderers ───────────────────────────────────────────────────────────

// SLIDE 1 — Hero (dark green, big typographic headline)
function renderHeroSlide(headline, category) {
  var S = 1080;
  var canvas = createCanvas(S, S);
  var ctx = canvas.getContext('2d');

  // Background: deep green
  ctx.fillStyle = '#1B3D2E';
  ctx.fillRect(0, 0, S, S);

  // Subtle radial glow top-right
  var grd = ctx.createRadialGradient(S, 0, 0, S * 0.5, S * 0.15, S * 0.9);
  grd.addColorStop(0, 'rgba(82,183,136,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);

  // Bottom gradient overlay for text contrast
  var bot = ctx.createLinearGradient(0, S * 0.45, 0, S);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, 0, S, S);

  // Category pill
  var cat = category || 'Nabo';
  ctx.font = 'bold 28px sans-serif';
  var pillW = ctx.measureText(cat).width + 48;
  ctx.fillStyle = '#52B788';
  roundRect(ctx, 60, S - 260, pillW, 50, 25);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(cat, 60 + 24, S - 226);

  // Main headline
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px sans-serif';
  var lines = wrapText(ctx, headline || 'Spend less.\nShare more.', S - 120);
  var startY = S - 180 - (lines.length - 1) * 110;
  lines.forEach(function(line, i) {
    ctx.fillText(line, 60, startY + i * 110);
  });

  // nabo. bottom-right
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#52B788';
  ctx.textAlign = 'right';
  ctx.fillText('nabo.', S - 60, S - 52);
  ctx.textAlign = 'left';

  return canvas;
}

// SLIDE 2 — Info (cream bg, left accent bar, heading + body)
function renderInfoSlide(heading, body, slideNum) {
  var S = 1080;
  var canvas = createCanvas(S, S);
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#F5F2EC';
  ctx.fillRect(0, 0, S, S);

  // Left accent bar
  ctx.fillStyle = '#2D6A4F';
  ctx.fillRect(0, 0, 10, S);

  // Subtle background circle
  ctx.fillStyle = '#52B788';
  ctx.globalAlpha = 0.06;
  ctx.beginPath(); ctx.arc(S + 60, -60, 520, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // Slide number top-right
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#2D6A4F';
  ctx.globalAlpha = 0.25;
  ctx.textAlign = 'right';
  ctx.fillText(slideNum + ' / 5', S - 56, 76);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // Heading
  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = '#1A1A1A';
  var hLines = wrapText(ctx, heading || '', S - 160);
  var hY = 220;
  hLines.forEach(function(line) {
    ctx.fillText(line, 80, hY);
    hY += 88;
  });

  // Green underline
  ctx.fillStyle = '#52B788';
  ctx.fillRect(80, hY - 4, 90, 7);
  hY += 52;

  // Body text
  ctx.font = '40px sans-serif';
  ctx.fillStyle = '#444444';
  var bLines = wrapText(ctx, body || '', S - 160);
  bLines.forEach(function(line) {
    ctx.fillText(line, 80, hY);
    hY += 60;
  });

  // Bottom nabo. branding
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#2D6A4F';
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'right';
  ctx.fillText('nabo.', S - 56, S - 52);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  return canvas;
}

// SLIDE 3 — Stat (green bg, massive number, label)
function renderStatSlide(heading, body) {
  var S = 1080;
  var canvas = createCanvas(S, S);
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2D6A4F';
  ctx.fillRect(0, 0, S, S);

  // Decorative rings
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 60;
  ctx.beginPath(); ctx.arc(S * 0.5, S * 0.42, 420, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 30;
  ctx.beginPath(); ctx.arc(S * 0.5, S * 0.42, 260, 0, Math.PI * 2); ctx.stroke();

  // Heading (acts as the big stat/hook)
  ctx.font = 'bold 100px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  var hLines = wrapText(ctx, heading || '', S - 140);
  var hY = S * 0.38 - ((hLines.length - 1) * 60);
  hLines.forEach(function(line, i) {
    ctx.fillText(line, S / 2, hY + i * 118);
    hY += 0;
  });

  // Mint accent line
  ctx.fillStyle = '#52B788';
  ctx.fillRect(S / 2 - 60, S * 0.62, 120, 6);

  // Body label
  ctx.font = '40px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  var bLines = wrapText(ctx, body || '', S - 200);
  var bY = S * 0.68;
  bLines.forEach(function(line) {
    ctx.fillText(line, S / 2, bY);
    bY += 56;
  });

  // nabo. bottom right
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.fillText('nabo.', S - 56, S - 52);
  ctx.textAlign = 'left';

  return canvas;
}

// SLIDE 4 — CTA / Quote (cream bg, large quote mark, cta button)
function renderCtaSlide(heading, body) {
  var S = 1080;
  var canvas = createCanvas(S, S);
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#F5F2EC';
  ctx.fillRect(0, 0, S, S);

  // Geometric corner triangle top-right
  ctx.fillStyle = '#2D6A4F';
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.moveTo(S, 0); ctx.lineTo(S - 340, 0); ctx.lineTo(S, 340);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  // Large quote mark
  ctx.font = 'bold 280px sans-serif';
  ctx.fillStyle = '#52B788';
  ctx.globalAlpha = 0.18;
  ctx.fillText('\u201C', 48, 340);
  ctx.globalAlpha = 1;

  // Heading
  ctx.font = 'bold 74px sans-serif';
  ctx.fillStyle = '#1A1A1A';
  var hLines = wrapText(ctx, heading || '', S - 140);
  var hY = 380;
  hLines.forEach(function(line) {
    ctx.fillText(line, 80, hY);
    hY += 92;
  });

  // Body
  ctx.font = '40px sans-serif';
  ctx.fillStyle = '#555555';
  var bLines = wrapText(ctx, body || '', S - 140);
  hY += 20;
  bLines.forEach(function(line) {
    ctx.fillText(line, 80, hY);
    hY += 58;
  });

  // CTA pill button
  hY += 40;
  var btnLabel = 'Browse Nabo \u2192';
  ctx.font = 'bold 36px sans-serif';
  var btnW = ctx.measureText(btnLabel).width + 72;
  ctx.fillStyle = '#2D6A4F';
  roundRect(ctx, 80, hY, btnW, 72, 36);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(btnLabel, 80 + 36, hY + 48);

  // nabo. bottom right
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#2D6A4F';
  ctx.globalAlpha = 0.4;
  ctx.textAlign = 'right';
  ctx.fillText('nabo.', S - 56, S - 52);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  return canvas;
}

// SLIDE 5 — Closing (green, logo, tagline)
function renderClosingSlide() {
  var S = 1080;
  var canvas = createCanvas(S, S);
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2D6A4F';
  ctx.fillRect(0, 0, S, S);

  // Concentric rings
  [380, 520, 660].forEach(function(r, i) {
    ctx.strokeStyle = 'rgba(255,255,255,' + [0.09, 0.05, 0.03][i] + ')';
    ctx.lineWidth = 48;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke();
  });

  // Divider line
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(S / 2 - 180, S / 2 - 120);
  ctx.lineTo(S / 2 + 180, S / 2 - 120);
  ctx.stroke();

  // nabo. logo
  ctx.font = 'bold 130px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  // "nabo" white, "." mint
  var naboW = ctx.measureText('nabo').width;
  var dotW = ctx.measureText('.').width;
  var totalW = naboW + dotW;
  ctx.fillText('nabo', S / 2 - dotW / 2, S / 2 + 20);
  ctx.fillStyle = '#52B788';
  ctx.fillText('.', S / 2 + naboW / 2, S / 2 + 20);

  // URL
  ctx.font = '40px sans-serif';
  ctx.fillStyle = '#52B788';
  ctx.fillText('usenabo.com', S / 2, S / 2 + 96);

  // Tagline
  ctx.font = 'italic 32px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('Spend less. Share more.', S / 2, S / 2 + 160);

  ctx.textAlign = 'left';
  return canvas;
}

// ── route: render any slide by type ──────────────────────────────────────────
app.post('/render-slide', function(req, res) {
  try {
    var type = req.body.type;
    var canvas;

    if (type === 'hero') {
      canvas = renderHeroSlide(req.body.headline, req.body.category);
    } else if (type === 'info') {
      canvas = renderInfoSlide(req.body.heading, req.body.body, req.body.slideNum || 2);
    } else if (type === 'stat') {
      canvas = renderStatSlide(req.body.heading, req.body.body);
    } else if (type === 'cta') {
      canvas = renderCtaSlide(req.body.heading, req.body.body);
    } else if (type === 'closing') {
      canvas = renderClosingSlide();
    } else {
      return res.status(400).json({ error: 'Unknown slide type: ' + type });
    }

    var base64 = canvas.toBuffer('image/png').toString('base64');
    var stored = storeAndGetUrl(req, base64, 'image/png');
    res.json({ image: base64, mimeType: 'image/png', publicUrl: stored.publicUrl });

  } catch(err) {
    console.error('render-slide error:', err);
    res.status(500).json({ error: err.message });
  }
});

// keep old route working too
app.post('/render-text-slide', function(req, res) {
  req.body.type = req.body.type === 'closing' ? 'closing' : 'info';
  return app._router.handle(Object.assign(req, { url: '/render-slide', path: '/render-slide' }), res, function() {});
});

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


