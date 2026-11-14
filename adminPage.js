export function adminPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Agent Settings — GS AI Solutions</title>
  <style>
    :root {
      --bg: #0f1720;
      --card: #17212b;
      --text: #e8eef4;
      --muted: #93a4b5;
      --line: #2a3b4c;
      --accent: #2563eb;
      --ok: #25d366;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(circle at top right, #1e3a5f 0%, transparent 40%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 28px 16px 48px;
    }
    .wrap { max-width: 880px; margin: 0 auto; }
    a { color: #8fd3ff; }
    h1 { margin: 0 0 6px; font-size: 1.5rem; }
    .sub { color: var(--muted); margin-bottom: 20px; }
    .nav { display: flex; gap: 14px; margin-bottom: 18px; font-size: .92rem; flex-wrap: wrap; }
    .card {
      background: color-mix(in srgb, var(--card) 94%, black);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 16px;
    }
    h2 { margin: 0 0 12px; font-size: 1.05rem; }
    label { display: block; font-size: .85rem; color: var(--muted); margin: 10px 0 6px; }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      background: #0e1620;
      color: var(--text);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
    }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 720px) { .row { grid-template-columns: 1fr; } }
    .provider {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      margin-top: 10px;
      background: #121b25;
    }
    .provider h3 {
      margin: 0;
      font-size: .95rem;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .badge {
      font-size: .75rem;
      padding: 3px 8px;
      border-radius: 999px;
      background: #243142;
      color: var(--muted);
    }
    .badge.ok { color: var(--ok); }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(180deg, #3b82f6, var(--accent));
    }
    button.secondary {
      background: #243142;
      color: var(--text);
    }
    .msg {
      margin-top: 12px;
      min-height: 1.2em;
      color: var(--ok);
      font-size: .92rem;
    }
    .msg.err { color: #ff8e9a; }
    .hint { color: var(--muted); font-size: .85rem; margin-top: 8px; }
    .tier { font-size: .78rem; color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <a href="/">QR Login</a>
      <a href="/knowledge">Knowledge</a>
      <a href="/admin">AI Settings</a>
      <a href="/demo">Website Demo</a>
      <a href="/logout">Logout</a>
    </div>
    <h1>Multi-AI Agent Settings</h1>
    <p class="sub">Update API keys and switch the active model live — no bot restart required.</p>

    <div class="card">
      <h2>Active Model</h2>
      <label for="activeModel">Select model</label>
      <select id="activeModel"></select>
      <p class="hint" id="activeMeta">Loading…</p>
      <div class="actions">
        <button id="saveModelBtn" type="button">Save Active Model</button>
        <button id="reloadBtn" class="secondary" type="button">Reload</button>
      </div>
      <div class="msg" id="modelMsg"></div>
    </div>

    <div class="card">
      <h2>Provider API Keys</h2>
      <div id="providers"></div>
      <div class="actions">
        <button id="saveKeysBtn" type="button">Save API Keys</button>
      </div>
      <div class="msg" id="keysMsg"></div>
      <p class="hint">Leave a field blank to keep the existing key. Keys are stored in <code>ai-config.json</code>.</p>
    </div>
  </div>

  <script>
    const providerMeta = {
      openai: 'OpenAI (GPT-4o / GPT-3.5)',
      anthropic: 'Anthropic Claude',
      gemini: 'Google Gemini',
      groq: 'Groq (Llama)',
      deepseek: 'DeepSeek'
    };

    let settings = null;

    function setMsg(id, text, isErr) {
      const el = document.getElementById(id);
      el.textContent = text || '';
      el.classList.toggle('err', Boolean(isErr));
    }

    function render() {
      const select = document.getElementById('activeModel');
      select.innerHTML = settings.catalog.map((m) => {
        const selected = m.id === settings.activeModel ? 'selected' : '';
        return '<option value="' + m.id + '" ' + selected + '>' +
          m.label + ' (' + m.tier + ')</option>';
      }).join('');

      const active = settings.catalog.find((m) => m.id === settings.activeModel);
      document.getElementById('activeMeta').textContent = active
        ? ('Provider: ' + active.provider + ' · Tier: ' + active.tier)
        : 'No model selected';

      const box = document.getElementById('providers');
      box.innerHTML = Object.keys(providerMeta).map((name) => {
        const p = settings.providers[name] || {};
        return '<div class="provider" data-provider="' + name + '">' +
          '<h3><span>' + providerMeta[name] + '</span>' +
          '<span class="badge ' + (p.hasKey ? 'ok' : '') + '">' +
          (p.hasKey ? 'Key set (' + (p.apiKeyMasked || '********') + ')' : 'No key') +
          '</span></h3>' +
          '<label>API Key</label>' +
          '<input type="password" autocomplete="off" placeholder="' +
          (p.hasKey ? '•••• keep existing key' : 'Paste API key') +
          '" data-key="' + name + '" />' +
          (p.baseUrl ? '<p class="hint">Base URL: ' + p.baseUrl + '</p>' : '') +
          '</div>';
      }).join('');
    }

    async function loadSettings() {
      const res = await fetch('/api/ai/settings', { cache: 'no-store' });
      settings = await res.json();
      render();
    }

    document.getElementById('reloadBtn').onclick = () => loadSettings().catch((e) => setMsg('modelMsg', e.message, true));

    document.getElementById('saveModelBtn').onclick = async () => {
      setMsg('modelMsg', 'Saving…');
      try {
        const activeModel = document.getElementById('activeModel').value;
        const res = await fetch('/api/ai/model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeModel })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save model');
        settings = data.settings;
        render();
        setMsg('modelMsg', 'Active model updated to ' + data.activeModel);
      } catch (err) {
        setMsg('modelMsg', err.message, true);
      }
    };

    document.getElementById('saveKeysBtn').onclick = async () => {
      setMsg('keysMsg', 'Saving…');
      try {
        const providers = {};
        document.querySelectorAll('input[data-key]').forEach((input) => {
          const value = input.value.trim();
          if (value) providers[input.dataset.key] = { apiKey: value };
        });
        const res = await fetch('/api/ai/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providers })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save keys');
        settings = data.settings;
        document.querySelectorAll('input[data-key]').forEach((input) => { input.value = ''; });
        render();
        setMsg('keysMsg', 'API keys updated');
      } catch (err) {
        setMsg('keysMsg', err.message, true);
      }
    };

    loadSettings().catch((e) => setMsg('modelMsg', e.message, true));
  </script>
</body>
</html>`;
}
