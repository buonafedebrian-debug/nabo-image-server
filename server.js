const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ── image store (30 min TTL) ──────────────────────────────────────────────────
var imageStore = {};
function cleanupOldImages() {
  var now = Date.now();
  Object.keys(imageStore).forEach(function(id) {
    if (now - imageStore[id].createdAt > 30 * 60 * 1000) delete imageStore[id];
  });
}
function storeAndGetUrl(req, base64, mimeType) {
  var id = crypto.randomBytes(12).toString('hex');
  imageStore[id] = { base64, mimeType, createdAt: Date.now() };
  cleanupOldImages();
  var host = req.get('host');
  var protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return { id, publicUrl: protocol + '://' + host + '/img/' + id };
}

// ── shared browser instance ───────────────────────────────────────────────────
let browser = null;
async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none'
      ]
    });
  }
  return browser;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slideHtml(bodyContent) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&family=Playfair+Display:ital,wght@0,700;1,400&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body { font-family: 'DM Sans', sans-serif; }
</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

// SLIDE 1 — Hero: dark green, big typographic headline
function heroHtml(headline, category) {
  return slideHtml(`
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;background:#1B3D2E;">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 100% 0%,rgba(82,183,136,0.22) 0%,transparent 55%);"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.80) 100%);"></div>
  <div style="position:absolute;bottom:310px;left:72px;background:#52B788;color:#fff;font-family:'DM Sans',sans-serif;font-weight:700;font-size:28px;padding:10px 28px;border-radius:999px;letter-spacing:1px;text-transform:uppercase;">${escHtml(category || 'Nabo')}</div>
  <div style="position:absolute;bottom:100px;left:72px;right:72px;font-family:'DM Serif Display',serif;font-size:102px;line-height:1.1;color:#fff;">${escHtml(headline || 'Spend less. Share more.')}</div>
  <div style="position:absolute;bottom:52px;right:72px;font-family:'DM Serif Display',serif;font-size:32px;color:#52B788;font-weight:700;">nabo.</div>
</div>`);
}

// SLIDE 2 — Info: cream bg, left accent bar
function infoHtml(heading, body, slideNum) {
  return slideHtml(`
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;background:#F5F2EC;">
  <div style="position:absolute;left:0;top:0;width:10px;height:1080px;background:#2D6A4F;"></div>
  <div style="position:absolute;top:-180px;right:-180px;width:680px;height:680px;border-radius:50%;background:rgba(82,183,136,0.07);"></div>
  <div style="position:absolute;top:64px;right:72px;font-family:'DM Sans',sans-serif;font-size:24px;font-weight:700;color:rgba(45,106,79,0.25);">${slideNum || 2} / 5</div>
  <div style="position:absolute;top:180px;left:90px;right:72px;font-family:'DM Serif Display',serif;font-size:78px;line-height:1.15;color:#1A1A1A;">${escHtml(heading || '')}</div>
  <div style="position:absolute;top:500px;left:90px;width:90px;height:7px;background:#52B788;border-radius:3px;"></div>
  <div style="position:absolute;top:570px;left:90px;right:72px;font-family:'DM Sans',sans-serif;font-size:42px;line-height:1.6;color:#444;">${escHtml(body || '')}</div>
  <div style="position:absolute;bottom:52px;right:72px;font-family:'DM Serif Display',serif;font-size:28px;color:rgba(45,106,79,0.5);font-weight:700;">nabo.</div>
</div>`);
}

// SLIDE 3 — Stat: green bg, bold centered
function statHtml(heading, body) {
  return slideHtml(`
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;background:#2D6A4F;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:840px;height:840px;border-radius:50%;border:60px solid rgba(255,255,255,0.07);"></div>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;height:520px;border-radius:50%;border:30px solid rgba(255,255,255,0.06);"></div>
  <div style="position:relative;z-index:1;font-family:'DM Serif Display',serif;font-size:110px;line-height:1.1;color:#fff;text-align:center;padding:0 100px;margin-bottom:24px;">${escHtml(heading || '')}</div>
  <div style="width:120px;height:6px;background:#52B788;border-radius:3px;margin-bottom:32px;position:relative;z-index:1;"></div>
  <div style="position:relative;z-index:1;font-family:'DM Sans',sans-serif;font-size:40px;line-height:1.5;color:rgba(255,255,255,0.75);text-align:center;padding:0 120px;">${escHtml(body || '')}</div>
  <div style="position:absolute;bottom:52px;right:72px;font-family:'DM Serif Display',serif;font-size:28px;color:rgba(255,255,255,0.3);font-weight:700;">nabo.</div>
</div>`);
}

// SLIDE 4 — CTA: cream bg, quote mark, button
function ctaHtml(heading, body) {
  return slideHtml(`
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;background:#F5F2EC;">
  <div style="position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 360px 360px 0;border-color:transparent rgba(45,106,79,0.08) transparent transparent;"></div>
  <div style="position:absolute;top:40px;left:40px;font-family:'DM Serif Display',serif;font-size:320px;line-height:1;color:#52B788;opacity:0.15;">\u201C</div>
  <div style="position:absolute;top:340px;left:80px;right:80px;font-family:'DM Serif Display',serif;font-size:80px;line-height:1.2;color:#1A1A1A;">${escHtml(heading || '')}</div>
  <div style="position:absolute;top:640px;left:80px;right:80px;font-family:'DM Sans',sans-serif;font-size:40px;line-height:1.6;color:#555;">${escHtml(body || '')}</div>
  <div style="position:absolute;bottom:120px;left:80px;background:#2D6A4F;color:#fff;font-family:'DM Sans',sans-serif;font-size:36px;font-weight:700;padding:20px 52px;border-radius:999px;">Browse Nabo \u2192</div>
  <div style="position:absolute;bottom:52px;right:72px;font-family:'DM Serif Display',serif;font-size:28px;color:rgba(45,106,79,0.4);font-weight:700;">nabo.</div>
</div>`);
}

// SLIDE 5 — Closing: green, rings, logo
function closingHtml() {
  return slideHtml(`
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;background:#2D6A4F;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:1320px;height:1320px;border-radius:50%;border:48px solid rgba(255,255,255,0.09);"></div>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:1040px;height:1040px;border-radius:50%;border:48px solid rgba(255,255,255,0.05);"></div>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:760px;height:760px;border-radius:50%;border:48px solid rgba(255,255,255,0.03);"></div>
  <div style="width:360px;height:2px;background:rgba(255,255,255,0.18);position:relative;z-index:1;margin-bottom:40px;"></div>
  <div style="position:relative;z-index:1;font-family:'DM Serif Display',serif;font-size:130px;line-height:1;margin-bottom:12px;"><span style="color:#fff;">nabo</span><span style="color:#52B788;">.</span></div>
  <div style="position:relative;z-index:1;font-family:'DM Sans',sans-serif;font-size:40px;color:#52B788;margin-bottom:16px;">usenabo.com</div>
  <div style="position:relative;z-index:1;font-family:'Playfair Display',serif;font-style:italic;font-size:32px;color:rgba(255,255,255,0.45);">Spend less. Share more.</div>
</div>`);
}

// ── render HTML to PNG via Puppeteer ─────────────────────────────────────────
async function renderHtmlToPng(html) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800)); // wait for web fonts
    const buf = await page.screenshot({ type: 'png', clip: { x:0, y:0, width:1080, height:1080 } });
    return buf.toString('base64');
  } finally {
    await page.close();
  }
}

// ── routes ────────────────────────────────────────────────────────────────────
app.get('/', function(req, res) {
  res.json({ status: 'Nabo image server running', renderer: 'puppeteer', images: Object.keys(imageStore).length });
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

app.post('/render-slide', async function(req, res) {
  try {
    var type = req.body.type;
    var html;
    if      (type === 'hero')    html = heroHtml(req.body.headline, req.body.category);
    else if (type === 'info')    html = infoHtml(req.body.heading, req.body.body, req.body.slideNum || 2);
    else if (type === 'stat')    html = statHtml(req.body.heading, req.body.body);
    else if (type === 'cta')     html = ctaHtml(req.body.heading, req.body.body);
    else if (type === 'closing') html = closingHtml();
    else return res.status(400).json({ error: 'Unknown slide type: ' + type });

    var base64 = await renderHtmlToPng(html);
    var stored = storeAndGetUrl(req, base64, 'image/png');
    res.json({ image: base64, mimeType: 'image/png', publicUrl: stored.publicUrl });
  } catch(err) {
    console.error('render-slide error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/render-text-slide', async function(req, res) {
  if (!req.body.type || req.body.type === 'text') req.body.type = 'info';
  try {
    var type = req.body.type;
    var html = (type === 'closing') ? closingHtml() : infoHtml(req.body.heading, req.body.body, req.body.slideNum || 2);
    var base64 = await renderHtmlToPng(html);
    var stored = storeAndGetUrl(req, base64, 'image/png');
    res.json({ image: base64, mimeType: 'image/png', publicUrl: stored.publicUrl });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

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
    var geminiData = await geminiRes.json();
    if (!geminiRes.ok) return res.status(geminiRes.status).json({ error: geminiData.error?.message || 'Gemini error' });
    var parts = geminiData.candidates?.[0]?.content?.parts || [];
    var imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart) return res.status(500).json({ error: 'No image returned from Gemini' });
    var stored = storeAndGetUrl(req, imgPart.inlineData.data, imgPart.inlineData.mimeType);
    res.json({ image: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType, publicUrl: stored.publicUrl });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Nabo image server (Puppeteer) on port ' + PORT); });
