import { TENANT_AI_PROVIDERS, MODEL_CATALOG } from './aiConfigStore.js';
import { BUSINESS_CATEGORIES } from './tenantCatalog.js';

function selectHtml(className, options, selected) {
  const opts = options
    .map((o) => {
      const sel = String(o.id) === String(selected || '') ? ' selected' : '';
      return `<option value="${o.id}"${sel}>${o.label}</option>`;
    })
    .join('');
  return `<select class="${className}">${opts}</select>`;
}

export function superAdminDashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Super Admin — Tenants</title>
  <style>
    :root { --bg:#0f1720; --card:#17212b; --text:#e8eef4; --muted:#93a4b5; --line:#2a3b4c; --accent:#2563eb; --ok:#25d366; --warn:#f5c542; --danger:#ff8e9a; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:radial-gradient(circle at top right,#1e3a5f 0%,transparent 40%),var(--bg); color:var(--text); min-height:100vh; padding:24px 16px 48px; }
    .wrap { max-width:1180px; margin:0 auto; }
    a { color:#8fd3ff; }
    h1 { margin:0 0 6px; font-size:1.45rem; }
    .sub { color:var(--muted); margin:0 0 16px; }
    .nav { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:16px; font-size:.92rem; }
    .toolbar { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
    .msg { color:var(--warn); min-height:1.2em; font-size:.9rem; }
    .tenants { display:flex; flex-direction:column; gap:12px; }
    .tenant {
      background:#121b25;
      border:1px solid var(--line);
      border-radius:14px;
      padding:14px 16px 12px;
    }
    .tenant-grid {
      display:grid;
      grid-template-columns: minmax(160px,1.4fr) minmax(110px,.8fr) minmax(160px,1.1fr) minmax(120px,.8fr) minmax(150px,1fr) minmax(150px,1fr);
      gap:12px 14px;
      align-items:start;
    }
    .col-label { display:block; color:var(--muted); font-size:.72rem; font-weight:650; letter-spacing:.02em; text-transform:uppercase; margin-bottom:6px; }
    .badge { display:inline-block; padding:3px 8px; border-radius:999px; font-size:.75rem; background:#243142; }
    .badge.ok { color:var(--ok); }
    .badge.warn { color:var(--warn); }
    .badge.err { color:var(--danger); }
    .badge.byok { color:#8fd3ff; }
    .biz { font-weight:650; font-size:.98rem; }
    .email { color:var(--muted); font-size:.8rem; line-height:1.4; word-break:break-word; }
    .stat { font-variant-numeric:tabular-nums; }
    .field-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:4px; }
    .field-row label { color:var(--muted); font-size:.75rem; min-width:36px; }
    input.mini, select, input.ai-key, input.expires {
      width:100%;
      max-width:100%;
      border:1px solid var(--line);
      background:#0e1620;
      color:var(--text);
      border-radius:8px;
      padding:7px 8px;
      font:inherit;
      font-size:.82rem;
    }
    input.mini { width:88px; max-width:100%; }
    select.ai-provider, select.ai-model, input.ai-key { display:block; margin:4px 0 0; }
    .actions {
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-top:12px;
      padding-top:12px;
      border-top:1px solid var(--line);
    }
    .actions button {
      appearance:none;
      border:0;
      border-radius:9px;
      padding:8px 12px;
      font:inherit;
      font-size:.8rem;
      font-weight:650;
      cursor:pointer;
      color:#fff;
      background:#2563eb;
    }
    button.secondary { background:#243142; }
    button.danger { background:#7f1d1d; }
    .toolbar button { appearance:none; border:0; border-radius:9px; padding:8px 12px; font:inherit; font-size:.8rem; font-weight:650; cursor:pointer; color:#fff; background:#243142; }
    .empty { color:var(--muted); padding:18px 4px; }
    @media (max-width: 960px) {
      .tenant-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .tenant-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <a href="/">QR Login</a>
      <a href="/admin/dashboard">Tenants</a>
      <a href="/admin/ai">AI Settings</a>
      <a href="/knowledge">Knowledge</a>
      <a href="/demo">Website Demo</a>
      <a href="/logout">Logout</a>
    </div>
    <h1>Super Admin — Tenants</h1>
    <p class="sub">Live WhatsApp sessions, API key type, token burn, quota, and account controls.</p>
    <div class="toolbar">
      <button id="reloadBtn" class="secondary" type="button">Refresh</button>
      <div class="msg" id="msg"></div>
    </div>
    <div class="tenants" id="rows"><div class="empty">Loading…</div></div>
  </div>
  <script>
    const msg = document.getElementById('msg');
    const TENANT_AI_PROVIDERS = ${JSON.stringify(TENANT_AI_PROVIDERS)};
    const MODEL_CATALOG = ${JSON.stringify(MODEL_CATALOG)};
    const CATEGORY_LABELS = ${JSON.stringify(
      Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c.id, c.label]))
    )};

    function badge(text, cls) {
      return '<span class="badge ' + (cls || '') + '">' + text + '</span>';
    }

    function selectHtml(className, options, selected) {
      return '<select class="' + className + '">' + options.map(function (o) {
        return '<option value="' + o.id + '"' + (String(o.id) === String(selected || '') ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') + '</select>';
    }

    function categoryLabel(id) {
      return CATEGORY_LABELS[id] || id || 'General';
    }

    async function loadTenants() {
      const body = document.getElementById('rows');
      try {
      const res = await fetch('/api/admin/tenants', { cache: 'no-store' });
      if (res.status === 401) return location.href = '/operator';
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      const tenants = data.tenants || [];
      if (!tenants.length) {
        body.innerHTML = '<div class="empty">No tenants yet.</div>';
        return;
      }
      body.innerHTML = tenants.map((t) => {
        const wa = t.linked_whatsapp || '—';
        const waStatus = t.session_status === 'connected'
          ? badge('Connected', 'ok')
          : badge(t.session_status || 'Disconnected', t.session_status === 'disabled' ? 'err' : 'warn');
        const key = t.api_key_type === 'BYOK' ? badge('BYOK', 'byok') : badge('Master key', 'warn');
        const modelOptions = [{ id: '', label: 'Provider default' }].concat(
          MODEL_CATALOG.filter((m) => ['deepseek', 'groq', 'gemini', 'anthropic'].includes(m.provider))
            .map((m) => ({ id: m.id, label: m.label }))
        );
        const expired = t.plan_expires_at && new Date(t.plan_expires_at).getTime() < Date.now();
        const acct = !t.is_active || expired
          ? badge(expired ? 'Expired' : 'Disabled', 'err')
          : badge('Enabled', 'ok');
        const expiresVal = t.plan_expires_at ? new Date(t.plan_expires_at).toISOString().slice(0, 16) : '';
        const resetLabel = t.quota_reset_at ? new Date(t.quota_reset_at).toLocaleDateString() : '—';
        return '<article class="tenant" data-id="' + t.id + '">' +
          '<div class="tenant-grid">' +
            '<div><span class="col-label">Business</span><div class="biz">' + (t.business_name || '') + (t.is_platform ? ' · platform' : '') + '</div>' +
            '<div class="email">' + (t.phone || '') + (t.email ? '<br>' + t.email : '') + '<br>' +
            (t.business_category ? categoryLabel(t.business_category) : (t.business_type || '')) + '</div></div>' +
            '<div><span class="col-label">WhatsApp</span>' + wa + '<br>' + waStatus + '</div>' +
            '<div><span class="col-label">AI</span>' + key +
            selectHtml('ai-provider', TENANT_AI_PROVIDERS, t.ai_provider || 'deepseek') +
            selectHtml('ai-model', modelOptions, t.ai_model || '') +
            '<input class="ai-key" type="password" placeholder="' +
              (t.has_custom_api_key ? 'Key on file — paste to replace' : 'Optional BYOK key') +
              '" /></div>' +
            '<div><span class="col-label">Usage</span><div class="stat"><strong>' + (t.total_tokens || 0) + '</strong> total</div>' +
            '<div class="email">Prompt ' + (t.prompt_tokens || 0) + '<br>Reply ' + (t.reply_tokens || 0) + '<br>' + (t.usage_calls || 0) + ' calls</div></div>' +
            '<div><span class="col-label">Quotas</span>' +
            '<div class="field-row"><label>Tok</label><input class="mini quota" type="number" min="0" value="' + t.token_quota + '" />' +
            '<label>Used</label><input class="mini used" type="number" min="0" value="' + t.tokens_used + '" /></div>' +
            '<div class="field-row"><label>Msg</label><input class="mini msg-quota" type="number" min="0" value="' + (t.message_quota || 0) + '" />' +
            '<label>Used</label><input class="mini msg-used" type="number" min="0" value="' + (t.messages_used || 0) + '" /></div>' +
            '<div class="email">Left ' + t.remaining + ' tok · ' + (t.messages_remaining || 0) + ' msg</div></div>' +
            '<div><span class="col-label">Plan</span>' + acct +
            '<input class="expires" type="datetime-local" value="' + expiresVal + '" style="margin-top:6px" />' +
            '<div class="email">Reset ' + resetLabel + '</div></div>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" data-act="save">Save</button>' +
            '<button class="secondary" type="button" data-act="renew">+30 Days Renew</button>' +
            '<button class="secondary" type="button" data-act="reset">Reset used</button>' +
            '<button class="secondary" type="button" data-act="toggle">' + (t.is_active && !expired ? 'Disable' : 'Enable') + '</button>' +
            '<button class="danger" type="button" data-act="disconnect">Disconnect WA</button>' +
            '<button class="danger" type="button" data-act="resetwa">Reset Session &amp; Re-link</button>' +
            (t.is_platform
              ? ''
              : '<button class="danger" type="button" data-act="delete">Delete tenant</button>') +
          '</div></article>';
      }).join('');

      body.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => act(btn);
      });
      } catch (err) {
        console.error('Failed to load tenants', err);
        body.innerHTML = '<div class="empty">Could not load tenants: ' + (err.message || err) + '</div>';
        msg.textContent = err.message || String(err);
      }
    }

    async function act(btn) {
      const card = btn.closest('.tenant');
      const id = card.dataset.id;
      const act = btn.dataset.act;
      msg.textContent = 'Saving…';
      try {
        let res;
        if (act === 'save') {
          res = await fetch('/api/admin/tenants/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token_quota: Number(card.querySelector('.quota').value),
              tokens_used: Number(card.querySelector('.used').value),
              message_quota: Number(card.querySelector('.msg-quota').value),
              messages_used: Number(card.querySelector('.msg-used').value),
              plan_expires_at: card.querySelector('.expires').value || null,
              ai_provider: card.querySelector('.ai-provider').value,
              ai_model: card.querySelector('.ai-model').value,
              custom_api_key: card.querySelector('.ai-key').value
            })
          });
        } else if (act === 'renew') {
          res = await fetch('/api/admin/tenants/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ renew_days: 30, is_active: true })
          });
        } else if (act === 'reset') {
          res = await fetch('/api/admin/tenants/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens_used: 0, messages_used: 0 })
          });
        } else if (act === 'toggle') {
          const disable = btn.textContent.includes('Disable');
          res = await fetch('/api/admin/tenants/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !disable })
          });
        } else if (act === 'disconnect') {
          res = await fetch('/api/admin/tenants/' + id + '/disconnect', { method: 'POST' });
        } else if (act === 'resetwa') {
          if (!confirm('Wipe this tenant’s WhatsApp keys and show a fresh QR? The phone must scan again.')) {
            msg.textContent = '';
            return;
          }
          res = await fetch('/api/admin/tenants/' + id + '/reset-whatsapp', { method: 'POST' });
        } else if (act === 'delete') {
          const name = (card.querySelector('.biz')?.textContent || 'this tenant').trim();
          if (!confirm('Delete ' + name + '? This cannot be undone. WhatsApp session, leads, and usage for this tenant will be removed.')) {
            msg.textContent = '';
            return;
          }
          res = await fetch('/api/admin/tenants/' + id, { method: 'DELETE' });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        msg.textContent = act === 'delete' ? 'Tenant deleted' : 'Updated';
        await loadTenants();
      } catch (err) {
        msg.textContent = err.message;
      }
    }

    document.getElementById('reloadBtn').onclick = loadTenants;
    loadTenants();
    setInterval(loadTenants, 15000);
  </script>
</body>
</html>`;
}