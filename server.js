/**
 * ==============================================================================
 * VIBERS AI - BACKEND (v3: streaming, xavfsizroq, tezroq)
 * ==============================================================================
 * - Kalitlar faqat .env / hosting "Environment Variables" dan o'qiladi
 * - /api/chat/stream  -> javob so'zma-so'z (SSE) keladi  (asosiy, tez)
 * - /api/chat         -> oddiy javob (zaxira)
 * - Rate limit: bitta IP daqiqasiga cheklangan so'rov yuboradi
 * - Sayt fayllari faqat /public jildidan beriladi (server.js ochiq emas)
 * ==============================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // hosting o'zgaruvchilari ustun
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

// Model FAQAT shu yerdan olinadi (brauzer yuborgan model nomi hisobga olinmaydi)
const MODEL = process.env.DEFAULT_MODEL || 'gemini-flash-latest';
// Ixtiyoriy: "o'ylash" byudjeti. Bo'sh qoldirsangiz model o'z standartini ishlatadi.
// Tezroq javob uchun .env ga THINKING_BUDGET=0 yozib ko'ring (modelingiz qo'llab-quvvatlasa).
const THINKING_BUDGET = process.env.THINKING_BUDGET;

const MAX_PROMPT_CHARS = 20000;
const MAX_FILES_CHARS = 200000;
const MAX_HISTORY = 10;

app.disable('x-powered-by');
app.set('trust proxy', 1); // Render/Railway kabi proksi ortida to'g'ri IP olish uchun

// CORS: ALLOWED_ORIGINS=https://sizning-sayt.onrender.com bo'lsa faqat o'sha ruxsat etiladi
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(allowed.length ? { origin: allowed } : undefined));
app.use(express.json({ limit: '2mb' }));

// ==========================================
// 1. RATE LIMIT (qo'shimcha kutubxonasiz)
// ==========================================
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of hits) if (now > e.reset) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let e = hits.get(req.ip);
    if (!e || now > e.reset) {
      e = { count: 0, reset: now + windowMs };
      hits.set(req.ip, e);
    }
    e.count++;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ error: "Juda ko'p so'rov yuborildi. Bir ozdan so'ng qayta urinib ko'ring." });
    }
    next();
  };
}
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN, 10) || 15
});

// ==========================================
// 2. API KALITLAR HAVZASI
// ==========================================
class KeyPool {
  constructor() {
    this.strategy = process.env.ROTATION_STRATEGY || 'failover';
    this.rr = 0;
    this.keys = (process.env.GEMINI_API_KEYS || '')
      .split(/[\n,]+/)
      .map(k => k.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .map((key, i) => ({ id: `gemini_${i + 1}`, key, label: `Gemini Key #${i + 1}`, cooldownUntil: 0 }));
    console.log(`[Pool] Gemini kalitlari: ${this.keys.length} ta (strategiya: ${this.strategy}, model: ${MODEL})`);
  }

  active() {
    const now = Date.now();
    return this.keys.filter(k => now >= k.cooldownUntil);
  }

  // Shu so'rov uchun kalitlarni tanlangan strategiya tartibida qaytaradi
  orderedForRequest() {
    const act = this.active();
    if (this.strategy === 'random') return act.sort(() => Math.random() - 0.5);
    if (this.strategy === 'round-robin' && act.length) {
      const start = this.rr++ % act.length;
      return [...act.slice(start), ...act.slice(0, start)];
    }
    return act; // failover: doim birinchi faol kalitdan boshlaydi
  }

  cooldown(k, sec, reason) {
    k.cooldownUntil = Date.now() + sec * 1000;
    console.warn(`[Pool] ${k.label} ${sec}s kutishga qo'yildi: ${reason}`);
  }
}
const pool = new KeyPool();

// ==========================================
// 3. GEMINI'GA SO'ROV
// ==========================================
function buildBody(reqBody) {
  const { prompt = '', history = [], agent = {}, attachedFiles = [] } = reqBody || {};

  if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_CHARS) {
    const e = new Error(`Xabar juda uzun (maksimum ${MAX_PROMPT_CHARS} belgi).`);
    e.status = 400; throw e;
  }

  const contents = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY)
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content.slice(0, MAX_PROMPT_CHARS) }]
    }));

  let fullPrompt = prompt;
  const files = Array.isArray(attachedFiles) ? attachedFiles : [];
  const filesText = files.map(f => `--- ${String(f.name || 'fayl')} ---\n${String(f.content || '')}`).join('\n\n');
  if (filesText.length > MAX_FILES_CHARS) {
    const e = new Error("Ilova qilingan fayllar juda katta."); e.status = 400; throw e;
  }
  if (filesText) fullPrompt += '\n\n[ILOVA QILINGAN FAYLLAR]:\n' + filesText;
  if (!fullPrompt.trim()) { const e = new Error("Bo'sh xabar."); e.status = 400; throw e; }

  contents.push({ role: 'user', parts: [{ text: fullPrompt }] });

  const generationConfig = {
    temperature: typeof agent.temperature === 'number' ? Math.min(Math.max(agent.temperature, 0), 2) : 0.7,
    maxOutputTokens: 8192
  };
  if (THINKING_BUDGET !== undefined && THINKING_BUDGET !== '') {
    generationConfig.thinkingConfig = { thinkingBudget: parseInt(THINKING_BUDGET, 10) };
  }

  return {
    contents,
    systemInstruction: {
      parts: [{ text: String(agent.systemPrompt || "Siz Vibers AI sun'iy intellekt assistentisiz.").slice(0, 4000) }]
    },
    generationConfig
  };
}

// Kalitlarni navbat bilan sinaydi. Muvaffaqiyatli bo'lsa fetch Response qaytaradi.
async function fetchWithFailover(endpoint, body, signal) {
  const keys = pool.orderedForRequest();
  if (!keys.length) {
    const e = new Error(pool.keys.length
      ? "Barcha API kalitlar vaqtincha limitda. 1 daqiqadan so'ng qayta urinib ko'ring."
      : "Serverda GEMINI_API_KEYS topilmadi. .env faylini tekshiring.");
    e.status = pool.keys.length ? 503 : 500; throw e;
  }

  let lastErr;
  for (const k of keys) {
    try {
      const r = await fetch(`${GEMINI_BASE}/models/${MODEL}:${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key },
        body: JSON.stringify(body),
        signal
      });
      if (r.ok) return r;

      const errData = await r.json().catch(() => ({}));
      const msg = errData.error?.message || r.statusText;
      lastErr = new Error(`Gemini ${r.status}: ${msg}`);
      lastErr.status = 502;

      if (r.status === 429) { pool.cooldown(k, 60, '429 limit'); continue; }
      if (r.status === 401 || r.status === 403) { pool.cooldown(k, 3600, `kalit yaroqsiz (${r.status})`); continue; }
      if (r.status >= 500) continue;
      // 400/404 va h.k.: muammo kalitda emas (masalan model nomi) - boshqa kalit yordam bermaydi
      throw lastErr;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (err === lastErr) throw err;
      lastErr = err; // tarmoq xatosi: keyingi kalitga o'tamiz
      console.warn(`[Pool] ${k.label} xato: ${err.message}`);
    }
  }
  throw lastErr || new Error('Noma\'lum xato');
}

const partsText = (parts = []) => parts.filter(p => p.text && !p.thought).map(p => p.text).join('');

// ==========================================
// 4. ENDPOINTLAR
// ==========================================

// 4.1 STREAMING (so'zma-so'z)
app.post('/api/chat/stream', chatLimiter, async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });

  let upstream;
  try {
    upstream = await fetchWithFailover('streamGenerateContent?alt=sse', buildBody(req.body), ac.signal);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('[Stream] xato:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let gotText = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
                    const j = JSON.parse(payload);
          const text = partsText(j.candidates?.[0]?.content?.parts);
          if (text) { gotText = true; send({ text }); }
          const fr = j.candidates?.[0]?.finishReason;
          if (fr && fr !== 'STOP') {
            console.warn('[Stream] finishReason:', fr);
            send({ text: `\n\n⚠️ Javob to'liq emas (${fr}).` });
          }
        } catch (_) { /* to'liq bo'lmagan bo'lak - o'tkazib yuboramiz */ }
      }
    }
    if (!gotText) send({ error: "Bo'sh javob qaytdi yoki xavfsizlik filtriga tushdi." });
    send({ done: true });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[Stream] oqim uzildi:', err.message);
      send({ error: 'Oqim uzildi: ' + err.message });
    }
  } finally {
    res.end();
  }
});

// 4.2 ODDIY (zaxira)
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const r = await fetchWithFailover('generateContent', buildBody(req.body));
    const data = await r.json();
    const text = partsText(data.candidates?.[0]?.content?.parts);
    if (!text) throw Object.assign(new Error("Bo'sh javob qaytdi yoki filtrga tushdi."), { status: 502 });
    res.json({ success: true, response: text });
  } catch (err) {
    console.warn('[Chat] xato:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Holat (kalitlar ko'rsatilmaydi)
app.get('/api/pool-status', (req, res) => {
  res.json({ totalKeys: pool.keys.length, activeKeys: pool.active().length, strategy: pool.strategy, model: MODEL });
});

// ==========================================
// 5. SAYT (faqat /public)
// ==========================================
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.listen(PORT, () => {
  console.log('=======================================================');
  console.log(`🚀 VIBERS AI ishga tushdi: http://localhost:${PORT}`);
  console.log('=======================================================');
});
