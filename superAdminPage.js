import { TENANT_AI_PROVIDERS, MODEL_CATALOG } from './aiConfigStore.js';

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
    body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:radial-gradient(circle at top right,#1e3a5f 0%,transparent 40%),var(--bg); color:var(--text); min-height:100vh; padding:28px 16px 48px; }
    .wrap { max-width:1280px; margin:0 auto; }
    a { color:#8fd3ff; }
    h1 { margin:0 0 6px; font-size:1.45rem; }
    .sub { color:var(--muted); margin:0 0 16px; }
    .nav { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:16px; font-size:.92rem; }
    .card { background:#121b25; border:1px solid var(--line); border-radius:14px; padding:16px; overflow:auto; }
    table { width:100%; border-collapse:collapse; font-size:.86rem; }
    th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--muted); font-weight:650; white-space:nowrap; }
    .badge { display:inline-block; padding:3px 8px; border-radius:999px; font-size:.75rem; background:#243142; }
    .badge.ok { color:var(--ok); }
    .badge.warn { color:var(--warn); }
    .badge.err { color:var(--danger); }
    .badge.byok { color:#8fd3ff; }
    input.mini, select { width:88px; border:1px solid var(--line); background:#0e1620; color:var(--text); border-radius:8px; padding:6px 8px; font:inherit; }
    select.ai-provider, select.ai-model { width:168px; margin:3px 0; display:block; }
    button { appearance:none; border:0; border-radius:8px; padding:6px 10px; font:inherit; font-size:.78rem; font-weight:650; cursor:pointer; color:#fff; background:#2563eb; margin:2px 2px 2px 0; }
    button.secondary { background:#243142; }
    button.danger { background:#7f1d1d; }
    .msg { margin-top:10px; color:var(--warn); min-height:1.2em; }
    .biz { font-weight:650; }
    .email { color:var(--muted); font-size:.8rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <a href="/">QR Login</a>
      <a href="/admin/dashboard">Tenants</a>
      <a href="/admin/ai">AI Settings</a>
      <a href="/knowledge">Knowledge</a>
      <a href="/demo">Demo</a>
      <a href="/logout">Logout</a>
    </div>
    <h1>Super Admin — Tenants</h1>
    <p class="sub">Live WhatsApp sessions, API key type, token burn, quota, and account controls.</p>
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <button id="reloadBtn" class="secondary" type="button">Refresh</button>
      </div>
      <div class="msg" id="msg"></div>
      <table>
        <thead>
          <tr>
            <th>Business / Email</th>
            <th>WhatsApp</th>
            <th>AI provider</th>
            <th>Prompt</th>
            <th>Completion</th>
            <th>Total burned</th>
            <th>Token quota</th>
            <th>Messages used / quota</th>
            <th>Plan / cycle</th>
            <th>Account</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="rows"><tr><td colspan="11">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>
  <script>
    const msg = document.getElementById('msg');

    function badge(text, cls) {
      return '<span class="badge ' + (cls || '') + '">' + text + '</span>';
    }

    async function loadTenants() {
      const res = await fetch('/api/admin/tenants');
      if (res.status === 401) return location.href = '/operator';
      const data = await res.json();
      const tenants = data.tenants || [];
      const body = document.getElementById('rows');
      if (!tenants.length) {
        body.innerHTML = '<tr><td colspan="11">No tenants yet.</td></tr>';
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
        return '<tr data-id="' + t.id + '">' +
          '<td><div class="biz">' + (t.business_name || '') + (t.is_platform ? ' · platform' : '') + '</div>' +
          '<div class="email">' + (t.email || '') + '<br>' + (t.business_type || '') + '</div></td>' +
          '<td>' + wa + '<br>' + waStatus + '</td>' +
          '<td>' + key + '<br>' +
          selectHtml('ai-provider', TENANT_AI_PROVIDERS, t.ai_provider || 'deepseek') + '<br>' +
          selectHtml('ai-model', modelOptions, t.ai_model || '') +
          '<input class="mini ai-key" type="password" placeholder="' +
            (t.has_custom_api_key ? 'Key on file — paste to replace' : 'Optional BYOK key') +
            '" style="width:150px;margin-top:4px" /></td>' +
          '<td>' + (t.prompt_tokens || 0) + '</td>' +
          '<td>' + (t.reply_tokens || 0) + '</td>' +
          '<td><strong>' + (t.total_tokens || 0) + '</strong><div class="email">' + (t.usage_calls || 0) + ' calls</div></td>' +
          '<td>Limit <input class="mini quota" type="number" min="0" value="' + t.token_quota + '" /><br>' +
          'Used <input class="mini used" type="number" min="0" value="' + t.tokens_used + '" /><br>' +
          '<span class="email">Remaining ' + t.remaining + '</span></td>' +
          '<td>Limit <input class="mini msg-quota" type="number" min="0" value="' + (t.message_quota || 0) + '" /><br>' +
          'Used <input class="mini msg-used" type="number" min="0" value="' + (t.messages_used || 0) + '" /><br>' +
          '<span class="email">Remaining ' + (t.messages_remaining || 0) + '</span></td>' +
          '<td>Expires <input class="mini expires" type="datetime-local" value="' + expiresVal + '" style="width:168px" /><br>' +
          '<span class="email">Quota reset ' + resetLabel + '</span></td>' +
          '<td>' + acct + '</td>' +
          '<td>' +
            '<button type="button" data-act="save">Save quota</button>' +
            '<button class="secondary" type="button" data-act="renew">+30 Days Renew</button>' +
            '<button class="secondary" type="button" data-act="reset">Reset used</button>' +
            '<button class="secondary" type="button" data-act="toggle">' + (t.is_active && !expired ? 'Disable' : 'Enable') + '</button>' +
            '<button class="danger" type="button" data-act="disconnect">Disconnect WA</button>' +
          '</td></tr>';
      }).join('');

      body.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => act(btn);
      });
    }

    async function act(btn) {
      const tr = btn.closest('tr');
      const id = tr.dataset.id;
      const act = btn.dataset.act;
      msg.textContent = 'Saving…';
      try {
        let res;
        if (act === 'save') {
          res = await fetch('/api/admin/tenants/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token_quota: Number(tr.querySelector('.quota').value),
              tokens_used: Number(tr.querySelector('.used').value),
              message_quota: Number(tr.querySelector('.msg-quota').value),
              messages_used: Number(tr.querySelector('.msg-used').value),
              plan_expires_at: tr.querySelector('.expires').value || null,
              ai_provider: tr.querySelector('.ai-provider').value,
              ai_model: tr.querySelector('.ai-model').value,
              custom_api_key: tr.querySelector('.ai-key').value
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
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        msg.textContent = 'Updated';
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