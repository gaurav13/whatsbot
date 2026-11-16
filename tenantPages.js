import { TENANT_AI_PROVIDERS, MODEL_CATALOG } from './aiConfigStore.js';
import { BUSINESS_CATEGORIES } from './tenantCatalog.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const shell = (title, body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --bg:#0f1720; --card:#17212b; --text:#e8eef4; --muted:#93a4b5; --line:#2a3b4c; --accent:#2563eb; --ok:#25d366; --danger:#ff8e9a; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:radial-gradient(circle at top,#1d3a2b 0%,transparent 42%),var(--bg); color:var(--text); min-height:100vh; }
    a { color:#8fd3ff; }
    .wrap { max-width:960px; margin:0 auto; padding:28px 16px 48px; }
    .card { background:#121b25; border:1px solid var(--line); border-radius:16px; padding:22px; margin-bottom:16px; }
    .narrow { max-width:440px; margin:8vh auto; }
    h1 { margin:0 0 8px; font-size:1.4rem; }
    .sub { color:var(--muted); margin:0 0 18px; }
    label { display:block; font-size:.85rem; color:var(--muted); margin:10px 0 6px; }
    input, select, textarea { width:100%; border:1px solid var(--line); background:#0e1620; color:var(--text); border-radius:10px; padding:11px 12px; font:inherit; }
    textarea { min-height:120px; resize:vertical; }
    button { appearance:none; border:0; border-radius:10px; padding:10px 14px; font:inherit; font-weight:650; cursor:pointer; color:#fff; background:linear-gradient(180deg,#3b82f6,var(--accent)); }
    button.secondary { background:#243142; }
    .error { background:#3a1c24; color:var(--danger); padding:10px 12px; border-radius:10px; margin-bottom:12px; }
    .ok { color:var(--ok); }
    .row { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
    .nav { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:16px; }
    .qr { width:280px; height:280px; background:#0e1620; border-radius:12px; display:grid; place-items:center; overflow:hidden; }
    .qr img { width:100%; height:100%; object-fit:contain; }
    .meta { color:var(--muted); font-size:.9rem; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--muted); font-weight:600; }
    .table-wrap { overflow-x:auto; max-height:420px; overflow-y:auto; }
    .phone { background:#075e54; border-radius:22px; padding:12px 10px 16px; margin-top:10px; }
    .phone-bar { color:#d1fae5; font-size:.82rem; font-weight:650; padding:6px 10px 12px; display:flex; justify-content:space-between; }
    .chat { background:#0b141a; border-radius:14px; padding:12px; min-height:220px; max-height:340px; overflow:auto; }
    .bubble { max-width:92%; margin:8px 0; padding:8px 11px; border-radius:12px; font-size:.9rem; line-height:1.4; white-space:pre-wrap; }
    .bubble.user { margin-left:auto; background:#005c4b; color:#e7fff6; border-bottom-right-radius:4px; }
    .bubble.ai { background:#1f2c34; color:#eef6fb; border-bottom-left-radius:4px; }
    .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .chip { border:1px solid var(--line); background:#182433; color:var(--text); border-radius:999px; padding:7px 12px; font-size:.85rem; cursor:pointer; }
  </style>
</head>
<body>${body}</body>
</html>`;

export function tenantLoginPage(errorMessage = '') {
  const error = errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : '';
  return shell(
    'Client Login — WBOT',
    `<div class="wrap narrow"><div class="card">
      <h1>Client login</h1>
      <p class="sub">Sign in to connect WhatsApp and manage your AI keys.</p>
      ${error}
      <form method="post" action="/login">
        <label>Phone or email</label>
        <input name="login" required placeholder="Phone number or email" autocomplete="username" />
        <label>Password</label><input name="password" type="password" required />
        <div class="row"><button type="submit">Sign in</button></div>
      </form>
      <p class="meta" style="margin-top:14px">New client? <a href="/register">Create an account</a><br/>Platform operator? <a href="/operator">Operator login</a></p>
    </div></div>`
  );
}

export function tenantRegisterPage(errorMessage = '') {
  const error = errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : '';
  return shell(
    'Register — WBOT',
    `<div class="wrap narrow"><div class="card">
      <h1>Create your workspace</h1>
      <p class="sub">Each business gets an isolated WhatsApp session and token quota.</p>
      ${error}
      <form method="post" action="/register">
        <label>Business name</label>
        <input name="business_name" required placeholder="Vilasa Homes" />
        <label>Phone number</label>
        <input name="phone" type="tel" required placeholder="9876543210" inputmode="tel" />
        <label>Email (optional)</label>
        <input name="email" type="email" placeholder="you@business.com" />
        <label>Password</label>
        <input name="password" type="password" minlength="8" required />
        <label>Business category</label>
        <select name="business_category" required>
          ${BUSINESS_CATEGORIES.map(
            (c) =>
              `<option value="${escapeHtml(c.id)}"${c.id === 'general' ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
          ).join('')}
        </select>
        <label>Gemini API key (optional — leave blank to use platform quota)</label>
        <input name="gemini_api_key" placeholder="AIza..." />
        <div class="row"><button type="submit">Create account</button></div>
      </form>
      <p class="meta" style="margin-top:14px">Already registered? <a href="/login">Sign in</a></p>
    </div></div>`
  );
}

export function tenantDashboardPage() {
  return shell(
    'Dashboard — WBOT',
    `<div class="wrap">
      <div class="nav"><a href="/dashboard">Dashboard</a><a href="/logout">Logout</a></div>
      <h1 id="biz">Your workspace</h1>
      <p class="sub" id="meta">Loading…</p>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:1.05rem">1) Business & API keys</h2>
        <label>Business name</label><input id="businessName" />
        <label>Phone number</label><input id="phone" type="tel" required />
        <label>Email (optional)</label><input id="email" type="email" />
        <label>Business category</label>
        <select id="businessCategory">
          ${BUSINESS_CATEGORIES.map(
            (c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`
          ).join('')}
        </select>
        <label>AI provider</label>
        <select id="aiProvider">
          ${TENANT_AI_PROVIDERS.map((p) => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join('')}
        </select>
        <label>AI model</label>
        <select id="aiModel">
          <option value="">Provider default</option>
          ${MODEL_CATALOG.filter((m) =>
            ['deepseek', 'groq', 'gemini', 'anthropic'].includes(m.provider)
          )
            .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`)
            .join('')}
        </select>
        <label>Custom API key (BYOK — optional)</label>
        <input id="customApiKey" type="password" autocomplete="off" placeholder="Paste a provider API key, or leave as-is to keep the saved key" />
        <p class="meta" id="keyMeta"></p>
        <p class="meta" id="quotaMeta"></p>
        <label>Owner alert WhatsApp number</label>
        <input id="alertPhone" placeholder="e.g. 9876543210 — new leads are sent here instantly" />
        <p class="meta">If blank, alerts go to the WhatsApp account linked in step 3.</p>
        <div class="row"><button id="saveBtn" type="button">Save settings</button></div>
        <p class="meta" id="saveStatus"></p>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:1.05rem">2) Knowledge base &amp; business profile</h2>
        <p class="meta">The bot answers using this description and FAQ (or an uploaded PDF / Word / text file) instead of a global template.</p>
        <label>Business description / custom instructions</label>
        <textarea id="businessDescription" placeholder="Who you are, what you sell, tone of voice, what the bot should never do…"></textarea>
        <label>FAQ &amp; business details</label>
        <textarea id="knowledgeText" placeholder="Paste FAQs, pricing notes, hours, locations…"></textarea>
        <label>Upload knowledge file (.pdf, .docx, .txt)</label>
        <input id="knowledgeFile" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" />
        <p class="meta" id="knowledgeFileMeta"></p>
        <div class="row"><button id="saveKbBtn" type="button">Save knowledge base</button></div>
        <p class="meta" id="kbStatus"></p>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:1.05rem">3) Preview customer replies</h2>
        <p class="meta" id="previewHint">See the same style of WhatsApp message your customers will get — welcome first, then try a question.</p>
        <div class="phone">
          <div class="phone-bar"><span id="previewPhoneName">Your WhatsApp assistant</span><span>preview</span></div>
          <div class="chat" id="previewLog"></div>
        </div>
        <div class="chips" id="previewChips"></div>
        <label for="previewQuestion">Try a customer question</label>
        <textarea id="previewQuestion" placeholder="e.g. tell me about your location" style="min-height:70px"></textarea>
        <div class="row">
          <button id="previewAskBtn" type="button">Ask demo AI</button>
          <button id="previewClearBtn" class="secondary" type="button">Clear chat</button>
        </div>
        <p class="meta" id="previewStatus"></p>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:1.05rem">4) Link WhatsApp</h2>
        <p class="meta" id="waStatus">Checking connection…</p>
        <div class="qr" id="qrBox">QR appears here after you start a session</div>
        <div class="row">
          <button id="startBtn" type="button">Start / refresh QR</button>
          <button id="logoutWaBtn" class="secondary" type="button">Reset session &amp; new QR</button>
        </div>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:1.05rem">5) Leads</h2>
        <p class="meta">Captured when a visitor finishes a booking flow or shares a name and phone number.</p>
        <div class="row">
          <button id="refreshLeadsBtn" class="secondary" type="button">Refresh</button>
          <a class="meta" id="exportLeadsLink" href="/api/tenant/leads/export" style="align-self:center">Download CSV</a>
        </div>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody id="leadsBody">
              <tr><td colspan="4" class="meta">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <script>
      async function loadMe() {
        const res = await fetch('/api/tenant/me');
        if (res.status === 401) return location.href = '/login';
        const data = await res.json();
        const t = data.tenant;
        document.getElementById('biz').textContent = t.business_name;
        document.getElementById('meta').textContent =
          (t.phone || '') + (t.email ? ' · ' + t.email : '') + ' · ' + (t.business_category || t.business_type);
        document.getElementById('businessName').value = t.business_name;
        document.getElementById('phone').value = t.phone || '';
        document.getElementById('email').value = t.email || '';
        document.getElementById('businessCategory').value = t.business_category || 'general';
        document.getElementById('aiProvider').value = t.ai_provider || 'deepseek';
        document.getElementById('aiModel').value = t.ai_model || '';
        const keyInput = document.getElementById('customApiKey');
        const keyMeta = document.getElementById('keyMeta');
        if (t.has_custom_api_key) {
          keyInput.value = '••••••••••••';
          keyInput.dataset.unchanged = '1';
          keyInput.placeholder = 'Key on file — paste a new key only if you want to replace it';
          keyMeta.textContent =
            'BYOK key on file: ' + (t.custom_api_key_masked || '••••') +
            ' · provider ' + (t.ai_provider || 'deepseek') +
            '. The dots mean a key is already active; leave them to keep it.';
          keyMeta.className = 'meta ok';
        } else {
          keyInput.value = '';
          keyInput.dataset.unchanged = '0';
          keyInput.placeholder = 'Paste your provider API key (optional BYOK)';
          keyMeta.textContent = 'No tenant key on file — using the platform master key for this provider.';
          keyMeta.className = 'meta';
        }
        document.getElementById('quotaMeta').textContent =
          'Messages used: ' + (t.messages_used || 0) + ' / ' + (t.message_quota || 0) +
          ' · Platform tokens: ' + t.tokens_used + ' / ' + t.token_quota +
          (t.plan_expires_at ? ' · Plan expires ' + new Date(t.plan_expires_at).toLocaleDateString() : '') +
          (t.is_active === false ? ' · Account inactive' : '');
        document.getElementById('businessDescription').value = t.business_description || '';
        document.getElementById('knowledgeText').value = t.knowledge_text || '';
        document.getElementById('knowledgeFileMeta').textContent = t.knowledge_file_path
          ? ('Last uploaded file: ' + t.knowledge_file_path)
          : 'No file uploaded yet';
        document.getElementById('alertPhone').value = t.alert_phone || '';
      }

      document.getElementById('customApiKey').addEventListener('input', (e) => {
        e.target.dataset.unchanged = '0';
      });

      async function pollQr() {
        const res = await fetch('/api/tenant/qr.json');
        if (res.status === 401) return;
        const data = await res.json();
        const connected = Boolean(data.connected) || data.connectionStatus === 'connected';
        const scanning = Boolean(data.scanning) || Boolean(data.qrDataUrl);
        const label = data.displayStatus || (connected ? 'Connected' : scanning ? 'Scanning QR' : (data.connectionStatus || 'unknown'));
        const statusEl = document.getElementById('waStatus');
        statusEl.textContent = 'Status: ' + label;
        statusEl.className = 'meta' + (connected ? ' ok' : '');
        const box = document.getElementById('qrBox');
        if (connected) box.textContent = 'Connected';
        else if (data.qrDataUrl) box.innerHTML = '<img alt="WhatsApp QR" src="' + data.qrDataUrl + '" />';
        else if (['connecting', 'starting', 'reconnecting'].includes(data.connectionStatus))
          box.textContent = 'Connecting existing session…';
        else box.textContent = 'Requesting a fresh QR…';
      }

      document.getElementById('saveBtn').onclick = async () => {
        const body = {
          business_name: document.getElementById('businessName').value,
          phone: document.getElementById('phone').value,
          email: document.getElementById('email').value,
          business_category: document.getElementById('businessCategory').value,
          alert_phone: document.getElementById('alertPhone').value,
          ai_provider: document.getElementById('aiProvider').value,
          ai_model: document.getElementById('aiModel').value
        };
        const keyInput = document.getElementById('customApiKey');
        const customKey = keyInput.value.trim();
        const masked = keyInput.dataset.unchanged === '1' || /^[•\u2022*·]+$/.test(customKey);
        if (customKey && !masked) body.custom_api_key = customKey;
        const res = await fetch('/api/tenant/settings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        document.getElementById('saveStatus').textContent = res.ok ? 'Saved' : (data.error || 'Save failed');
        document.getElementById('saveStatus').className = 'meta ' + (res.ok ? 'ok' : '');
        loadMe();
      };

      document.getElementById('saveKbBtn').onclick = async () => {
        const status = document.getElementById('kbStatus');
        status.textContent = 'Saving…';
        const form = new FormData();
        form.append('business_description', document.getElementById('businessDescription').value);
        form.append('knowledge_text', document.getElementById('knowledgeText').value);
        const file = document.getElementById('knowledgeFile').files[0];
        if (file) form.append('knowledge_file', file);
        const res = await fetch('/api/tenant/knowledge', { method: 'POST', body: form });
        const data = await res.json();
        status.textContent = res.ok
          ? (data.uploaded ? 'Saved. Uploaded file text was added to the knowledge base.' : 'Saved.')
          : (data.error || 'Save failed');
        status.className = 'meta ' + (res.ok ? 'ok' : '');
        if (res.ok) {
          document.getElementById('knowledgeFile').value = '';
          loadMe();
          loadWelcomePreview();
        }
      };

      document.getElementById('startBtn').onclick = async () => {
        await fetch('/api/tenant/whatsapp/start', { method: 'POST' });
        pollQr();
      };
      document.getElementById('logoutWaBtn').onclick = async () => {
        await fetch('/api/tenant/whatsapp/logout', { method: 'POST' });
        pollQr();
      };

      function esc(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function formatDetails(details) {
        if (!details) return '';
        if (typeof details === 'string') return details;
        const bits = [];
        if (details.source) bits.push(details.source);
        if (details.preferredDate) bits.push('date ' + details.preferredDate);
        if (details.preferredTime) bits.push('time ' + details.preferredTime);
        if (details.project) bits.push(details.project);
        if (details.message) bits.push(details.message);
        return bits.join(' · ') || JSON.stringify(details);
      }

      async function loadLeads() {
        const body = document.getElementById('leadsBody');
        try {
          const res = await fetch('/api/tenant/leads');
          if (res.status === 401) return;
          const data = await res.json();
          const leads = data.leads || [];
          if (!leads.length) {
            body.innerHTML = '<tr><td colspan="4" class="meta">No leads yet.</td></tr>';
            return;
          }
          body.innerHTML = leads.map((lead) => {
            const when = lead.created_at ? new Date(lead.created_at).toLocaleString() : '';
            return '<tr><td>' + esc(when) + '</td><td>' + esc(lead.customer_name) +
              '</td><td>' + esc(lead.customer_phone) + '</td><td>' +
              esc(formatDetails(lead.lead_details)) + '</td></tr>';
          }).join('');
        } catch (err) {
          body.innerHTML = '<tr><td colspan="4" class="meta">' + esc(err.message) + '</td></tr>';
        }
      }

      document.getElementById('refreshLeadsBtn').onclick = () => loadLeads();

      function previewEsc(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }

      async function loadWelcomePreview() {
        const log = document.getElementById('previewLog');
        const status = document.getElementById('previewStatus');
        try {
          const res = await fetch('/api/tenant/preview');
          if (res.status === 401) return;
          const data = await res.json();
          document.getElementById('previewPhoneName').textContent =
            (data.profileLabel || 'Your assistant') + ' · WhatsApp';
          document.getElementById('previewHint').textContent = data.customKnowledge
            ? 'Answers use your saved knowledge base — the same content WhatsApp will send.'
            : 'No custom knowledge yet, so this preview uses the default industry template. Save a profile in step 2 to see your own replies.';
          log.innerHTML = '<div class="bubble ai">' + previewEsc(data.welcome || data.reply || '') + '</div>';
          const chips = document.getElementById('previewChips');
          const options = data.menuOptions && data.menuOptions.length
            ? data.menuOptions
            : [
                { id: 'tell me about your location', title: 'Location' },
                { id: 'what do you offer?', title: 'Services' },
                { id: 'what is the price?', title: 'Pricing' }
              ];
          chips.innerHTML = options.map((o) =>
            '<button class="chip" type="button" data-q="' + previewEsc(o.id || o.title) + '">' +
            previewEsc(o.title) + '</button>'
          ).join('');
          chips.querySelectorAll('.chip').forEach((btn) => {
            btn.onclick = () => {
              document.getElementById('previewQuestion').value = btn.dataset.q;
              document.getElementById('previewAskBtn').click();
            };
          });
          status.textContent = 'Welcome preview ready — try a customer question below.';
        } catch (err) {
          status.textContent = err.message || 'Preview failed';
        }
      }

      document.getElementById('previewClearBtn').onclick = () => {
        document.getElementById('previewLog').innerHTML = '';
        loadWelcomePreview();
      };

      document.getElementById('previewAskBtn').onclick = async () => {
        const question = document.getElementById('previewQuestion').value.trim();
        const status = document.getElementById('previewStatus');
        if (!question) {
          status.textContent = 'Enter a question first.';
          return;
        }
        const log = document.getElementById('previewLog');
        const btn = document.getElementById('previewAskBtn');
        btn.disabled = true;
        status.textContent = 'Thinking with your knowledge base…';
        log.innerHTML += '<div class="bubble user">' + previewEsc(question) + '</div>';
        try {
          const res = await fetch('/api/tenant/preview-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Preview failed');
          log.innerHTML += '<div class="bubble ai">' + previewEsc(data.reply || '') + '</div>';
          log.scrollTop = log.scrollHeight;
          status.textContent = 'This is the type of reply a customer would get on WhatsApp' +
            (data.mode ? ' · ' + data.mode : '') + '.';
          status.className = 'meta ok';
        } catch (err) {
          status.textContent = err.message || 'Preview failed';
          status.className = 'meta';
        } finally {
          btn.disabled = false;
        }
      };

      loadMe();
      loadWelcomePreview();
      loadLeads();
      pollQr();
      setInterval(pollQr, 2500);
      setInterval(loadLeads, 15000);
    </script>`
  );
}
