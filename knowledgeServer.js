import fs from 'fs';
import path from 'path';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import {
  KNOWLEDGE_DIR,
  listKnowledgeFiles,
  getActiveFileName,
  setActiveFile,
  saveUploadedBuffer,
  saveTenantKnowledgeFile,
  loadActiveKnowledgeBase,
} from './knowledgeManager.js';
import { getQrState } from './qrState.js';
import { requestLogout } from './sessionControl.js';
import { adminPageHtml } from './adminPage.js';
import { loginPageHtml } from './loginPage.js';
import { validateAdminCredentials, getSessionSecret } from './authConfig.js';
import {
  tenantLoginPage,
  tenantRegisterPage,
  tenantDashboardPage,
} from './tenantPages.js';
import {
  createTenant,
  authenticateTenant,
  getPublicTenantById,
  updateTenantSettings,
  updateTenantKnowledge,
  listTenantLeads,
  listTenantsAdmin,
  isTenantPlanActive,
  adminUpdateTenant,
  deleteTenant,
  phoneFromJid,
  ensurePlatformTenant,
} from './db.js';
import {
  startTenantSession,
  stopTenantSession,
  destroyTenantRuntime,
  getTenantQrState,
  listWhatsAppInstances,
  ensureTenantSessionForUi,
  publicQrPayload,
} from './sessionManager.js';
import { superAdminDashboardHtml } from './superAdminPage.js';
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
  getTokenUsageSummary,
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
import { leadsToCsv } from './leadCapture.js';

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
      <a href="/admin/dashboard">Tenants</a>
      <a href="/admin/ai">AI Settings</a>
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
        const connected = Boolean(data.connected) || data.connectionStatus === 'connected';
        const scanning = Boolean(data.scanning) || Boolean(data.qrDataUrl);
        const isLoggingOut = data.connectionStatus === 'logging_out';
        const connecting = ['connecting', 'starting', 'reconnecting'].includes(data.connectionStatus);

        statusEl.textContent = data.displayStatus || (connected ? 'Connected' : scanning ? 'Scanning QR' : (data.connectionStatus || 'unknown'));
        statusEl.classList.toggle('ok', connected);

        disconnectBtn.hidden = !(connected || isLoggingOut || scanning);
        disconnectBtn.disabled = disconnecting || isLoggingOut;
        disconnectBtn.textContent = (disconnecting || isLoggingOut) ? 'Disconnecting…' : 'Disconnect WhatsApp';

        if (connected) {
          qrEl.innerHTML = '<p style="color:#128c7e;font-weight:600;margin:0">Connected ✅<br/>Session is live — no QR needed.</p>';
          hintEl.textContent = 'Bot is online. Use Disconnect WhatsApp to expire this session and show a new QR.';
        } else if (data.qrDataUrl) {
          qrEl.innerHTML = '<img alt="WhatsApp QR Code" src="' + data.qrDataUrl + '" />';
          hintEl.textContent = 'Scanning QR — scan now in WhatsApp → Linked Devices before it expires.';
        } else if (isLoggingOut) {
          qrEl.innerHTML = '<p style="color:#b45309;font-weight:600;margin:0">Disconnecting WhatsApp…</p>';
          hintEl.textContent = 'Clearing the old session and requesting a fresh QR.';
        } else if (connecting) {
          qrEl.innerHTML = '<p style="color:#93a4b5;font-weight:600;margin:0">Connecting existing session…</p>';
          hintEl.textContent = 'Reusing a saved WhatsApp link. A QR will appear only if WhatsApp asks to re-link.';
        } else {
          qrEl.innerHTML = '<p style="color:#93a4b5;margin:0">Requesting a fresh QR…</p>';
          hintEl.textContent = 'Previous session is disconnected or expired. This page auto-refreshes.';
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
<div class="nav"><a href="/">QR Login</a><a href="/knowledge">Knowledge</a><a href="/admin/dashboard">Tenants</a><a href="/admin/ai">AI Settings</a><a href="/demo">Website Demo</a><a href="/logout">Logout</a></div>
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
        path: '/',
        // Use Secure cookies when served over HTTPS (Nginx TLS)
        secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
      },
    })
  );

  function wantsJson(req) {
    return (
      req.path.startsWith('/api/') ||
      req.path.endsWith('.json') ||
      req.xhr ||
      (req.headers.accept || '').includes('application/json')
    );
  }

  function requireOperator(req, res, next) {
    if (req.session?.authenticated) return next();
    if (req.session?.tenantId && req.path === '/') return res.redirect('/dashboard');
    if (wantsJson(req)) return res.status(401).json({ error: 'Unauthorized. Please login.' });
    if (req.path === '/') return res.redirect('/login');
    return res.redirect('/operator');
  }

  const sessionCookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  };

  function endWebSession(req, res, { redirectTo = '/login', json = false } = {}) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    const finish = () => {
      res.clearCookie('gsai.sid', sessionCookieOpts);
      if (json) return res.json({ ok: true, redirect: '/login' });
      return res.redirect(302, redirectTo);
    };
    if (!req.session) return finish();
    req.session.tenantId = null;
    req.session.tenantEmail = null;
    req.session.authenticated = false;
    req.session.destroy((err) => {
      if (err) console.warn('session destroy:', err?.message || err);
      finish();
    });
  }

  function requireTenant(req, res, next) {
    if (req.session?.tenantId) return next();
    if (wantsJson(req)) return res.status(401).json({ error: 'Unauthorized. Please login.' });
    return res.redirect('/login');
  }

  // Public health check (no auth) — use this to verify Nginx -> Node
  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'wbot',
      routes: ['/login', '/register', '/dashboard', '/operator', '/admin/dashboard', '/admin/ai', '/demo'],
    });
  });

  app.get('/register', (req, res) => {
    if (req.session?.tenantId) return res.redirect('/dashboard');
    res.type('html').send(tenantRegisterPage());
  });

  function registerPayload(body = {}) {
    return {
      email: body.email,
      phone: body.phone,
      password: body.password,
      businessName: body.business_name || body.businessName,
      businessCategory: body.business_category || body.businessCategory,
      businessType: body.business_type,
      geminiApiKey: body.gemini_api_key,
    };
  }

  function registerErrorMessage(err) {
    const msg = String(err?.message || err);
    if (/tenants_phone|phone/i.test(msg) && /duplicate|unique/i.test(msg)) {
      return 'That phone number is already registered.';
    }
    if (/email/i.test(msg) && /duplicate|unique/i.test(msg)) {
      return 'That email is already registered.';
    }
    return msg;
  }

  app.post('/register', async (req, res) => {
    try {
      const tenant = await createTenant(registerPayload(req.body || {}));
      req.session.tenantId = tenant.id;
      req.session.tenantEmail = tenant.email;
      req.session.tenantPhone = tenant.phone;
      return res.redirect('/dashboard');
    } catch (err) {
      return res.status(400).type('html').send(tenantRegisterPage(registerErrorMessage(err)));
    }
  });

  app.post('/api/register', async (req, res) => {
    try {
      const tenant = await createTenant(registerPayload(req.body || {}));
      req.session.tenantId = tenant.id;
      req.session.tenantEmail = tenant.email;
      req.session.tenantPhone = tenant.phone;
      res.json({ ok: true, tenant });
    } catch (err) {
      res.status(400).json({ ok: false, error: registerErrorMessage(err) });
    }
  });

  app.get('/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.session?.tenantId) return res.redirect('/dashboard');
    if (req.session?.authenticated) return res.redirect('/');
    res.type('html').send(tenantLoginPage());
  });

  app.post('/login', async (req, res) => {
    const auth = await authenticateTenant(
      req.body?.login || req.body?.email || req.body?.phone,
      req.body?.password
    );
    if (!auth) {
      return res.status(401).type('html').send(tenantLoginPage('Invalid phone, email, or password.'));
    }
    req.session.tenantId = auth.public.id;
    req.session.tenantEmail = auth.public.email;
    req.session.tenantPhone = auth.public.phone;
    return res.redirect('/dashboard');
  });

  app.get('/operator', (req, res) => {
    if (req.session?.authenticated) return res.redirect('/');
    res.type('html').send(loginPageHtml());
  });

  app.post('/operator', (req, res) => {
    const username = req.body?.username;
    const password = req.body?.password;

    if (!validateAdminCredentials(username, password)) {
      return res.status(401).type('html').send(loginPageHtml('Invalid username or password.'));
    }

    req.session.authenticated = true;
    req.session.username = String(username);
    return res.redirect('/');
  });

  app.get('/dashboard', requireTenant, (_req, res) => {
    res.type('html').send(tenantDashboardPage());
  });

  app.get('/api/tenant/me', requireTenant, async (req, res) => {
    const tenant = await getPublicTenantById(req.session.tenantId);
    res.json({ ok: true, tenant });
  });

  app.post('/api/tenant/settings', requireTenant, async (req, res) => {
    try {
      const tenant = await updateTenantSettings(req.session.tenantId, req.body || {});
      res.json({ ok: true, tenant });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post(
    '/api/tenant/knowledge',
    requireTenant,
    upload.single('knowledge_file'),
    async (req, res) => {
      try {
        const body = req.body || {};
        let knowledgeText =
          body.knowledge_text !== undefined ? String(body.knowledge_text) : undefined;
        let knowledgeFilePath;

        if (req.file?.buffer) {
          const saved = await saveTenantKnowledgeFile(
            req.session.tenantId,
            req.file.originalname,
            req.file.buffer
          );
          knowledgeFilePath = saved.path;
          const faq = String(body.knowledge_text || '').trim();
          knowledgeText = [faq, `===== UPLOADED DOCUMENT (${saved.filename}) =====`, saved.text]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 80_000);
        }

        const tenant = await updateTenantKnowledge(req.session.tenantId, {
          business_description: body.business_description,
          knowledge_text: knowledgeText,
          knowledge_file_path: knowledgeFilePath,
        });
        res.json({ ok: true, tenant, uploaded: Boolean(req.file) });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message || String(err) });
      }
    }
  );

  app.get('/api/tenant/qr.json', requireTenant, (req, res) => {
    res.json(ensureTenantSessionForUi(req.session.tenantId, { syncGlobalQr: false }));
  });

  app.post('/api/tenant/whatsapp/start', requireTenant, async (req, res) => {
    try {
      const id = req.session.tenantId;
      const current = getTenantQrState(id);
      if (current.connected && !req.body?.relink) {
        return res.json({ ok: true, ...current });
      }
      res.json({
        ok: true,
        ...ensureTenantSessionForUi(id, {
          syncGlobalQr: false,
          forceQr: Boolean(req.body?.relink),
          stealLock: true,
        }),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/api/tenant/leads', requireTenant, async (req, res) => {
    try {
      const leads = await listTenantLeads(req.session.tenantId);
      res.json({ ok: true, leads });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/api/tenant/leads/export', requireTenant, async (req, res) => {
    try {
      const leads = await listTenantLeads(req.session.tenantId, { limit: 2000 });
      const csv = leadsToCsv(leads);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="leads-${stamp}.csv"`
      );
      res.send(csv);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/api/tenant/whatsapp/logout', requireTenant, async (req, res) => {
    try {
      const result = await stopTenantSession(req.session.tenantId, {
        logout: true,
        restart: true,
      });
      res.json({ ok: true, ...result, ...getTenantQrState(req.session.tenantId) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  // Session logout (destroys web login session)
  app.get('/logout', (req, res) => {
    endWebSession(req, res, { redirectTo: '/login' });
  });
  app.post('/logout', (req, res) => {
    endWebSession(req, res, { redirectTo: '/login' });
  });
  app.post('/auth/logout', (req, res) => {
    endWebSession(req, res, { json: true });
  });

  app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.session?.tenantId) return res.redirect('/dashboard');
    if (!req.session?.authenticated) return res.redirect('/login');
    res.type('html').send(qrPageHtml());
  });

  // Everything below requires operator login
  app.use(requireOperator);

  app.get('/qr.json', async (_req, res) => {
    try {
      const platform = await ensurePlatformTenant();
      if (platform?.id) {
        return res.json(
          ensureTenantSessionForUi(platform.id, { syncGlobalQr: true })
        );
      }
      res.json(publicQrPayload(getQrState()));
    } catch (err) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  app.get('/qr.png', async (_req, res) => {
    try {
      const platform = await ensurePlatformTenant();
      const state = platform?.id
        ? ensureTenantSessionForUi(platform.id, { syncGlobalQr: true })
        : publicQrPayload(getQrState());
      if (!state.qrDataUrl) return res.status(404).send('QR not available yet');
      const base64 = state.qrDataUrl.replace(/^data:image\/png;base64,/, '');
      res.type('png').send(Buffer.from(base64, 'base64'));
    } catch (err) {
      res.status(500).send(err.message || String(err));
    }
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
    res.redirect('/admin/dashboard');
  });
  app.get('/admin/dashboard', (_req, res) => {
    res.type('html').send(superAdminDashboardHtml());
  });
  app.get('/admin/ai', (_req, res) => {
    res.type('html').send(adminPageHtml());
  });
  app.get('/settings', (_req, res) => {
    res.redirect('/admin/ai');
  });

  app.get('/api/admin/tenants', async (_req, res) => {
    try {
      const tenants = await listTenantsAdmin();
      const sessions = new Map(
        listWhatsAppInstances().map((s) => [String(s.tenantId), s])
      );
      res.json({
        ok: true,
        tenants: tenants.map((t) => {
          const sess = sessions.get(String(t.id));
          const status = !isTenantPlanActive(t)
            ? 'disabled'
            : sess?.connectionStatus === 'connected'
              ? 'connected'
              : sess?.connectionStatus || 'disconnected';
          const jid = sess?.linkedJid || t.linked_whatsapp;
          return {
            ...t,
            session_status: status,
            linked_whatsapp: jid ? phoneFromJid(jid) || jid : null,
          };
        }),
      });
    } catch (err) {
      console.error('GET /api/admin/tenants failed:', err);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.patch('/api/admin/tenants/:id', async (req, res) => {
    try {
      const tenant = await adminUpdateTenant(req.params.id, req.body || {});
      if (req.body?.is_active === false) {
        await stopTenantSession(req.params.id, { logout: false, restart: false });
      } else if (req.body?.is_active === true || Number(req.body?.renew_days) > 0) {
        startTenantSession(req.params.id, { allowQr: false, silent: true }).catch(() => {});
      }
      res.json({ ok: true, tenant });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/api/admin/tenants/:id/disconnect', async (req, res) => {
    try {
      const result = await stopTenantSession(req.params.id, {
        logout: true,
        restart: false,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.delete('/api/admin/tenants/:id', async (req, res) => {
    try {
      await destroyTenantRuntime(req.params.id);
      const result = await deleteTenant(req.params.id);
      try {
        const dir = path.join(KNOWLEDGE_DIR, 'tenants', String(req.params.id));
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore missing knowledge folder
      }
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('DELETE /api/admin/tenants failed:', err);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
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

  app.get('/api/token-usage', async (req, res) => {
    try {
      const summary = await getTokenUsageSummary({
        jid: req.query.jid || null,
        phone: req.query.phone || null,
      });
      res.json({ ok: true, summary });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
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
    console.log(`📚 Knowledge upload: http://127.0.0.1:${port}/knowledge`);
    console.log(`⚙️  AI Settings: http://127.0.0.1:${port}/admin`);
    console.log(`🧪 Website Demo: http://127.0.0.1:${port}/demo`);
    console.log(`📂 Knowledge folder: ${KNOWLEDGE_DIR}`);
  });

  server.on('error', (err) => {
    console.error(`HTTP server failed to bind ${host}:${port}:`, err.message);
  });

  return server;
}
