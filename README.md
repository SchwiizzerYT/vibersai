# 🌟 Vibers AI — Universal Sun'iy Intellekt Agenti

**Vibers AI** — zamonaviy, nafis uslubda yaratilgan, **ko'p API kalitlar havzasi (Multi-Key Pool)** va **failover (avtomatik rotatsiya)** tizimiga ega sun'iy intellekt agenti veb-platformasi.

Ushbu loyiha dizayni **shaxzodbekbaxtiyorov.uz** va **yusupovjavohirbek.netlify.app** saytlarining terrakotta aktsentli, minimalist va toza tipografiya uslubiga asoslangan.

---

## 🔑 API Kalitlarni Qayerda Berish Kerak?

API kalitlar xavfsizligi uchun ular to'g'ridan-to'g'ri loyiha ildizidagi **`.env`** faylida beriladi:

📂 Fayl yo'li: `ai-agent-web/.env`

Ushbu faylni oching va o'zingizning API kalitlaringizni quyidagicha vergul bilan ajratib yozing:

```env
# 1. Google Gemini API kalitlaringiz (xohlagancha ko'p yozishingiz mumkin):
GEMINI_API_KEYS=AIzaSyA123...,AIzaSyB456...,AIzaSyC789...

# Standart model
DEFAULT_MODEL=gemini-2.5-flash

# Rotatsiya strategiyasi: failover (tavsiya etiladi), round-robin, yoki random
ROTATION_STRATEGY=failover

# Port
PORT=3000
```

> **Avtomatik Failover qanday ishlaydi?**
> Bitta API kalitingiz kunlik yoki daqiqalik limitga (`429 Rate Limit`) tushsa, server uni avtomatik 60 soniyaga kutishga qo'yadi va darhol navbatdagi kalitga o'tib javobni olib keladi. Foydalanuvchi uzilishni sezmaydi!

---

## 🛡️ GitHub'ga API Kalitlarni Qanday XAVFSIZ Yuklash Kerak?

### ⚠️ Muhim Qoida:
Google Gemini va OpenAI kalitlarini **ochiq kodga (HTML, JS ichiga) yozib GitHub'ga yuklash qat'iyan man etiladi!** 
GitHub da avtomatik *Secret Scanner* bor: agar kalitingiz commitga tushsa, Google buni 30 soniyada payqab, **kalitingizni avtomatik bloklaydi (revoke qiladi)**.

### ✅ Biz yaratgan xavfsiz tizim:
1. Biz loyihada **`.gitignore`** faylini tayyorlab qo'ydik. Uning ichida:
   ```
   .env
   node_modules/
   ```
   deb yozilgan.
2. Bu degani — siz `git add .` qilganingizda ham sizning maxfiy `.env` faylingiz **GitHub'ga aslo yuklanmaydi**!
3. Buning o'rniga GitHub'ga faqat **`.env.example`** (namuna) fayli yuklanadi. Repozitoriyangizni yuklab olgan boshqa odam `.env.example` dan nusxa olib o'z kalitini qo'yadi.

---

## 🚀 GitHub'ga Yuklash Ketma-Ketligi

Terminalda (yoki VS Code / PowerShell da) loyiha jildiga kiring:

```bash
cd "C:\Users\Lenovo PC\.gemini\antigravity\scratch\ai-agent-web"
```

1. Git repozitoriyasini boshlang:
```bash
git init
```

2. Barcha fayllarni tayyorlang:
```bash
git add .
```

3. **ENG MUHIM QADAM (Tekshirish):**
```bash
git status
```
> Tekshiring: yashil ro'yxatda `.env` fayli **bo'lmasligi** kerak! Faqat `.env.example`, `server.js`, `public/index.html`, `public/app.js`, `public/style.css` ko'rinsa — hammasi 100% to'g'ri va xavfsiz.

4. Birinchi commitni yarating:
```bash
git commit -m "Initial commit: Vibers AI with Multi-Key Pool"
```

5. O'zingizning GitHub repozitoriyangizga ulang va yuklang:
```bash
git branch -M main
git remote add origin https://github.com/SIZNING_PROFILINGIZ/vibers-ai.git
git push -u origin main
```

---

## ⚡ Loyihani Ishga Tushirish

1. Bog'liqliklarni o'rnating (agar o'rnatilmagan bo'lsa):
```bash
npm install
```

2. `.env` faylida kalitlaringiz borligiga ishonch hosil qiling.

3. Serverni ishga tushiring:
```bash
npm start
```

4. Brauzerda oching:
👉 **http://localhost:3000**


---

## 🆕 v3 o'zgarishlari
- **Streaming:** javob so'zma-so'z chiqadi (`/api/chat/stream`).
- **Model faqat `.env` dan:** `DEFAULT_MODEL` (brauzer yuborgan model nomi hisobga olinmaydi). Nomlarni ko'rish: `npm run models`.
- **Rate limit:** bitta IP daqiqasiga 15 ta so'rov (`RATE_LIMIT_PER_MIN`).
- **Sayt fayllari `public/` jildida**, `server.js` va `package.json` brauzerga berilmaydi.
- Noto'g'ri model nomi (404) bo'lsa, behuda barcha kalitlarni aylanib chiqmaydi, yaroqsiz kalit (401/403) soatga o'chiriladi.
- Tarixdagi oxirgi xabar ikki marta ketib qolish xatosi tuzatildi.

## ☁️ Render'ga joylash (bepul)
1. Kodni GitHub'ga yuklang (`.env` ketmasligini `git status` bilan tekshiring).
2. Render → New → Web Service → repozitoriyani tanlang.
3. Build: `npm install`, Start: `npm start`.
4. Environment Variables: `GEMINI_API_KEYS`, `DEFAULT_MODEL`.
5. Bepul servis jim tursa uxlaydi, birinchi kirish sekin ochiladi.
