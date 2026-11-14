import express from 'express';
import session from 'express-session';
import multer from 'multer';
import {
  KNOWLEDGE_DIR,
  listKnowledgeFiles,
  getActiveFileName,
  setActiveFile,
  saveUploadedBuffer,
  loadActiveKnowledgeBase,
} from './knowledgeManager.js';
import { getQrState } from './qrState.js';
import { requestLogout } from './sessionControl.js';
import { adminPageHtml } from './adminPage.js';
import { loginPageHtml } from './loginPage.js';
import { validateAdminCredentials, getSessionSecret } from './authConfig.js';
import {
  getPublicAiSettings,
  setActiveModel,
  saveAiConfig,
  loadAiConfig,
} from './aiConfigStore.js';
import { peekActiveAi } from './aiRouter.js';
import { demoPageHtml } from './demoPage.js';
import { scrapeWebsite } from './websiteScraper.js';
import {
  initDatabase,
  upsertWebsiteKnowledge,
  listWebsiteKnowledge,
} from './db.js';
import {
  listDemoProfiles,
  getActiveDemoProfile,
  getDemoWelcomePreview,
  triggerDemoProfile,
  answerDemoChat,
  getLastDemoWhatsAppJid,
} from './demoProfiles.js';
import { listVilasaLeads } from './vilasaDemo.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function qrPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GS AI Solutions — WhatsApp QR</title>
  <style>
    :root {
      --bg: #0f1720;
      --card: #17212b;
      --text: #e8eef4;
      --muted: #93a4b5;
      --accent: #25d366;
      --warn: #f5c542;
      --danger: #e35d6a;
      --action: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(circle at top, #1d3a2b 0%, transparent 45%),
        var(--bg);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(440px, 100%);
      background: color-mix(in srgb, var(--card) 92%, black);
      border: 1px solid #2a3b4c;
      border-radius: 18px;
      padding: 28px 24px 22px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    h1 { margin: 0 0 6px; font-size: 1.35rem; font-weight: 650; }
    p { margin: 0; color: var(--muted); line-height: 1.45; }
    .status {
      display: inline-block;
      margin: 16px 0 12px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: .85rem;
      background: #243142;
      color: var(--warn);
    }
    .status.ok { color: var(--accent); }
    .qr-wrap {
      background: #fff;
      border-radius: 14px;
      padding: 16px;
      min-height: 280px;
      display: grid;
      place-items: center;
    }
    .qr-wrap img { width: min(260px, 70vw); height: auto; }
    .hint { margin-top: 16px; font-size: .92rem; }
    .actions { margin-top: 14px; min-height: 44px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    .btn-danger {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: .95rem;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(180deg, #3b82f6, var(--action));
    }
    .btn-danger:disabled {
      opacity: .6;
      cursor: wait;
    }
    .btn-session {
      appearance: none;
      border: 1px solid #3a4d61;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: .95rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--text);
      background: #243142;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .links { margin-top: 18px; font-size: .85rem; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .links a { color: #8fd3ff; }
  </style>
</head>
<body>
  <main class="card">
    <h1>WhatsApp Bot Login</h1>
    <p>Scan this QR with WhatsApp → Linked Devices</p>
    <div id="status" class="status">Checking connection…</div>
    <div class="qr-wrap">
      <div id="qr">Waiting for QR…</div>
    </div>
    <div class="actions">
      <button id="disconnectBtn" class="btn-danger" hidden>Disconnect WhatsApp</button>
      <a class="btn-session" href="/logout">Logout</a>
    </div>
    <p class="hint" id="hint">Open this page on your computer and scan from your phone.</p>
    <div class="links">
      <a href="/knowledge">Knowledge upload</a>
      <a href="/admin">AI Settings</a>
      <a href="/demo">Website Demo</a>
    </div>
  </main>
  <script>
    const disconnectBtn = document.getElementById('disconnectBtn');
    let disconnecting = false;

    async function refresh() {
      try {
        const res = await fetch('/qr.json', { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        const statusEl = document.getElementById('status');
        const qrEl = document.getElementById('qr');
        const hintEl = document.getElementById('hint');
        const connected = data.connectionStatus === 'connected';
        const isLoggingOut = data.connectionStatus === 'logging_out';

        statusEl.textContent = data.connectionStatus || 'unknown';
        statusEl.classList.toggle('ok', connected);

        disconnectBtn.hidden = !(connected || isLoggingOut);
        disconnectBtn.disabled = disconnecting || isLoggingOut;
        disconnectBtn.textContent = (disconnecting || isLoggingOut) ? 'Disconnecting…' : 'Disconnect WhatsApp';

        if (data.qrDataUrl) {
          qrEl.innerHTML = '<img alt="WhatsApp QR Code" src="' + data.qrDataUrl + '" />';
          hintEl.textContent = 'QR ready — scan now before it expires.';
        } else if (connected) {
          qrEl.innerHTML = '<p style="color:#128c7e;font-weight:600;margin:0">Connected ✅<br/>No QR needed.</p>';
          hintEl.textContent = 'Bot is online. Use Disconnect WhatsApp for a new QR, or Logout to leave the dashboard.';
        } else if (isLoggingOut) {
          qrEl.innerHTML = '<p style="color:#b45309;font-weight:600;margin:0">Disconnecting WhatsApp…</p>';
          hintEl.textContent = 'Clearing session and requesting a fresh QR.';
        } else {
          qrEl.textContent = 'Waiting for QR from Baileys…';
          hintEl.textContent = 'Keep the bot running. This page auto-refreshes.';
        }
      } catch (err) {
        document.getElementById('status').textContent = 'web server unreachable';
      }
    }

    disconnectBtn.addEventListener('click', async () => {
      if (disconnecting) return;
      const ok = confirm('Disconnect this WhatsApp session and show a new QR code?');
      if (!ok) return;
      disconnecting = true;
      disconnectBtn.disabled = true;
      disconnectBtn.textContent = 'Disconnecting…';
      try {
        const res = await fetch('/disconnect', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Disconnect failed');
      } catch (err) {
        alert(err.message || 'Disconnect failed');
      } finally {
        disconnecting = false;
        refresh();
      }
    });

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;
}

function knowledgePageHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GS AI Knowledge Upload</title>
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
code{background:#f4f4f4;padding:2px 6px;border-radius:4px}
.card{border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0}
a{color:#0b6bcb}
.nav{display:flex;gap:14px;margin-bottom:12px;flex-wrap:wrap}
</style></head><body>
<div class="nav"><a href="/">QR Login</a><a href="/knowledge">Knowledge</a><a href="/admin">AI Settings</a><a href="/demo">Website Demo</a><a href="/logout">Logout</a></div>
<h1>Knowledge Base Upload</h1>
<p>Drop a <code>.txt</code>, <code>.pdf</code>, or <code>.docx</code> file for Gemini.</p>
<div class="card">
<form action="/knowledge/upload?makeActive=true" method="post" enctype="multipart/form-data">
  <input type="file" name="file" accept=".txt,.pdf,.docx" required />
  <label><input type="checkbox" name="makeActive" value="true" checked /> Make active</label>
  <button type="submit">Upload</button>
</form>
</div>
<p>API: <code>GET /knowledge/files</code> · <code>POST /knowledge/select</code> · <code>GET /knowledge/active</code></p>
</body></html>`;
}

export function startKnowledgeServer(port = Number(process.env.PORT) || 3000) {
  const host = process.env.HOST || '0.0.0.0';
  const app = express();

  // Required behind Nginx so secure cookies / client IP work correctly
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      name: 'gsai.sid',
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // Use Secure cookies when served over HTTPS (Nginx TLS)
        secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
      },
    })
  );

  function requireAuth(req, res, next) {
    if (req.session?.authenticated) return next();

    const wantsJson =
      req.path.startsWith('/api/') ||
      req.path.endsWith('.json') ||
      req.xhr ||
      (req.headers.accept || '').includes('application/json');

    if (wantsJson) {
      return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
    return res.redirect('/login');
  }

  // Public health check (no auth) — use this to verify Nginx -> Node
  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'wbot',
      routes: ['/', '/login', '/knowledge', '/admin', '/demo'],
    });
  });

  // Public auth routes
  app.get('/login', (req, res) => {
    if (req.session?.authenticated) return res.redirect('/');
    res.type('html').send(loginPageHtml());
  });

  app.post('/login', (req, res) => {
    const username = req.body?.username;
    const password = req.body?.password;

    if (!validateAdminCredentials(username, password)) {
      return res.status(401).type('html').send(loginPageHtml('Invalid username or password.'));
    }

    req.session.authenticated = true;
    req.session.username = String(username);
    return res.redirect('/');
  });

  // Session logout (destroys web login session)
  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('gsai.sid');
      res.redirect('/login');
    });
  });
  app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('gsai.sid');
      res.json({ ok: true });
    });
  });

  // Everything below requires login
  app.use(requireAuth);

  // Dashboard / QR UI (protected — redirects to /login if not authenticated)
  app.get('/', (_req, res) => {
    res.type('html').send(qrPageHtml());
  });

  app.get('/qr.json', (_req, res) => {
    res.json(getQrState());
  });

  app.get('/qr.png', (_req, res) => {
    const { qrDataUrl } = getQrState();
    if (!qrDataUrl) return res.status(404).send('QR not available yet');
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    res.type('png').send(Buffer.from(base64, 'base64'));
  });

  async function handleWhatsAppDisconnect(_req, res) {
    try {
      const result = await requestLogout();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  }

  // WhatsApp session disconnect (not web auth logout)
  app.post('/disconnect', handleWhatsAppDisconnect);

  app.get('/admin', (_req, res) => {
    res.type('html').send(adminPageHtml());
  });
  app.get('/settings', (_req, res) => {
    res.redirect('/admin');
  });

  app.get('/demo', (_req, res) => {
    res.type('html').send(demoPageHtml());
  });

  app.get('/api/demo/profiles', async (_req, res) => {
    try {
      const active = getActiveDemoProfile();
      const preview = await getDemoWelcomePreview(active.id);
      res.json({
        ok: true,
        profiles: listDemoProfiles(),
        activeProfileId: active.id,
        preview,
        lastWhatsAppJid: getLastDemoWhatsAppJid(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/api/demo/profile', async (req, res) => {
    try {
      const profileId = req.body?.profileId;
      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
      }

      const result = await triggerDemoProfile(profileId, {
        pushToWhatsAppJid: req.body?.pushToWhatsAppJid || null,
        trigger: req.body?.trigger !== false,
      });

      res.json({
        ok: true,
        profile: result.profile,
        preview: result.preview,
        whatsapp: result.whatsapp,
        lastWhatsAppJid: result.lastWhatsAppJid || getLastDemoWhatsAppJid(),
        triggered: req.body?.trigger !== false,
      });
    } catch (err) {
      console.error('demo profile activate failed:', err?.message || err);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/api/scrape-and-store', async (req, res) => {
    try {
      const scraped = await scrapeWebsite(req.body?.url);
      const saved = await upsertWebsiteKnowledge({
        url: scraped.url,
        title: scraped.title,
        content: scraped.content,
      });

      res.json({
        ok: true,
        status: 'stored',
        id: saved.id,
        url: saved.url,
        title: saved.title,
        contentLength: saved.content_length,
        wordCount: saved.word_count,
        preview: scraped.preview,
      });
    } catch (err) {
      console.error('scrape-and-store failed:', err?.message || err);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/api/website-knowledge', async (_req, res) => {
    try {
      const items = await listWebsiteKnowledge(25);
      res.json({ ok: true, items });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/api/demo/chat', async (req, res) => {
    try {
      const question = String(req.body?.question || '').trim();
      if (!question) {
        return res.status(400).json({ error: 'question is required' });
      }

      const result = await answerDemoChat(question, req.body?.profileId);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('demo chat failed:', err?.message || err);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/api/demo/vilasa-leads', (_req, res) => {
    res.json({ ok: true, leads: listVilasaLeads() });
  });

  app.get('/api/ai/settings', (_req, res) => {
    res.json(getPublicAiSettings());
  });

  app.get('/api/ai/active', (_req, res) => {
    res.json(peekActiveAi());
  });

  app.post('/api/ai/model', (req, res) => {
    try {
      const activeModel = req.body?.activeModel;
      if (!activeModel) return res.status(400).json({ error: 'activeModel is required' });
      setActiveModel(activeModel);
      res.json({
        ok: true,
        activeModel,
        settings: getPublicAiSettings(),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/ai/keys', (req, res) => {
    try {
      const providers = req.body?.providers || {};
      const current = loadAiConfig();
      const nextProviders = { ...current.providers };

      for (const [name, value] of Object.entries(providers)) {
        if (!nextProviders[name]) {
          return res.status(400).json({ error: `Unknown provider: ${name}` });
        }
        if (value?.apiKey !== undefined && String(value.apiKey).trim() !== '') {
          nextProviders[name] = {
            ...nextProviders[name],
            apiKey: String(value.apiKey).trim(),
          };
        }
      }

      saveAiConfig({ providers: nextProviders });
      res.json({ ok: true, settings: getPublicAiSettings() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/knowledge', (_req, res) => {
    res.type('html').send(knowledgePageHtml());
  });

  app.get('/knowledge/files', (_req, res) => {
    res.json({
      files: listKnowledgeFiles(),
      activeFile: getActiveFileName(),
      folder: KNOWLEDGE_DIR,
    });
  });

  app.get('/knowledge/active', async (_req, res) => {
    const kb = await loadActiveKnowledgeBase();
    res.json({
      activeFile: kb.filename,
      chars: kb.text.length,
      preview: kb.text.slice(0, 300),
      error: kb.error,
    });
  });

  app.post('/knowledge/select', (req, res) => {
    try {
      const filename = req.body?.filename;
      if (!filename) return res.status(400).json({ error: 'filename is required' });
      const active = setActiveFile(filename);
      res.json({ ok: true, activeFile: active });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/knowledge/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file field is required' });
      const makeActive =
        req.body?.makeActive === 'true' ||
        req.body?.makeActive === true ||
        req.query?.makeActive === 'true';

      const saved = await saveUploadedBuffer(req.file.originalname, req.file.buffer, {
        makeActive,
      });
      res.json({ ok: true, ...saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Keep connections from dying silently on handler errors
  app.use((err, _req, res, _next) => {
    console.error('Express error:', err?.stack || err);
    if (res.headersSent) return;
    res.status(500).type('html').send('<h1>Server error</h1><p>Check PM2 logs.</p>');
  });

  initDatabase().catch((err) => {
    console.error('DB init failed:', err?.message || err);
  });

  const server = app.listen(port, host, () => {
    console.log(`🌐 Web UI bound on http://${host}:${port}`);
    console.log(`📷 WhatsApp QR page: http://127.0.0.1:${port}/`);
    console.log(`🔐 Login page: http://127.0.0.1:${port}/login`);
    console.log(`❤️  Health: http://127.0.0.1:${port}/health`);
    console.log(`🧪 Website Demo: http://127.0.0.1:${port}/demo`);
    console.log(`📚 Knowledge upload: http://127.0.0.1:${port}/knowledge`);
    console.log(`⚙️  AI Settings: http://127.0.0.1:${port}/admin`);
    console.log(`📂 Knowledge folder: ${KNOWLEDGE_DIR}`);
  });

  server.on('error', (err) => {
    console.error(`HTTP server failed to bind ${host}:${port}:`, err.message);
  });

  return server;
}
