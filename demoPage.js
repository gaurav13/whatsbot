export function demoPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Client Demo Hub — GS AI</title>
  <style>
    :root {
      --bg: #0f1720;
      --card: #17212b;
      --text: #e8eef4;
      --muted: #93a4b5;
      --line: #2a3b4c;
      --accent: #2563eb;
      --ok: #25d366;
      --warn: #f5c542;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(circle at top left, #1d3a2b 0%, transparent 40%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 28px 16px 48px;
    }
    .wrap { max-width: 960px; margin: 0 auto; }
    a { color: #8fd3ff; }
    h1 { margin: 0 0 6px; font-size: 1.45rem; }
    .sub { color: var(--muted); margin: 0 0 18px; }
    .nav { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; font-size: .92rem; }
    .card {
      background: color-mix(in srgb, var(--card) 94%, black);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 16px;
    }
    h2 { margin: 0 0 12px; font-size: 1.05rem; }
    label { display: block; font-size: .85rem; color: var(--muted); margin-bottom: 6px; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      background: #0e1620;
      color: var(--text);
      border-radius: 10px;
      padding: 11px 12px;
      font: inherit;
    }
    textarea { min-height: 90px; resize: vertical; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; align-items: center; }
    .profiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }
    @media (max-width: 720px) { .profiles { grid-template-columns: 1fr; } }
    .profile {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: #121b25;
      cursor: pointer;
    }
    .profile.active {
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6 inset;
    }
    .profile strong { display: block; margin-bottom: 4px; }
    .profile span { color: var(--muted); font-size: .82rem; line-height: 1.35; }
    .profile input { width: auto; margin-right: 8px; }
    button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(180deg, #3b82f6, var(--accent));
    }
    button.secondary { background: #243142; }
    button:disabled { opacity: .6; cursor: wait; }
    .status { margin-top: 10px; color: var(--warn); font-size: .92rem; min-height: 1.2em; }
    .status.ok { color: var(--ok); }
    .status.err { color: #ff8e9a; }
    .preview, .chat {
      margin-top: 12px;
      background: #0e1620;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      white-space: pre-wrap;
      font-size: .9rem;
      line-height: 1.45;
      max-height: 280px;
      overflow: auto;
    }
    .meta { color: var(--muted); font-size: .82rem; margin-top: 8px; }
    .bubble { margin: 8px 0; }
    .bubble.user { color: #9fd0ff; }
    .bubble.ai { color: #d7ffe6; }
    .bubble.system { color: #f5c542; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .chip {
      border: 1px solid var(--line);
      background: #182433;
      color: var(--text);
      border-radius: 999px;
      padding: 7px 12px;
      font-size: .85rem;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <a href="/">QR Login</a>
      <a href="/knowledge">Knowledge</a>
      <a href="/admin">AI Settings</a>
      <a href="/demo">Demo Hub</a>
      <a href="/logout">Logout</a>
    </div>
    <h1>Client Demo Hub</h1>
    <p class="sub">Switch demo profiles instantly, preview the WhatsApp welcome flow, and test AI answers against the active knowledge base.</p>

    <div class="card">
      <h2>1) Select Demo Profile</h2>
      <label for="profileSelect">Active profile</label>
      <select id="profileSelect"></select>
      <div class="profiles" id="profileRadios"></div>
      <div class="row">
        <button id="activateBtn" type="button">Activate & Preview Welcome</button>
        <button id="reloadBtn" class="secondary" type="button">Reload</button>
      </div>
      <label style="margin-top:12px" for="waJid">WhatsApp number to receive the demo welcome (e.g. 9198xxxxxxxx@s.whatsapp.net)</label>
      <input id="waJid" placeholder="9198xxxxxxxx@s.whatsapp.net — required to push live welcome" />
      <div class="status" id="profileStatus"></div>
      <div class="meta" id="profileMeta"></div>
      <div class="preview" id="welcomePreview">Welcome preview will appear here…</div>
      <div class="chips" id="menuChips"></div>
    </div>

    <div class="card">
      <h2>2) Contextual AI Chat Tester</h2>
      <p class="meta" id="chatMeta">Questions are routed to the active demo knowledge base.</p>
      <label for="question">Your question</label>
      <textarea id="question" placeholder="Ask about pricing, amenities, services…"></textarea>
      <div class="row">
        <button id="askBtn" type="button">Ask Active Demo AI</button>
        <button id="clearChatBtn" class="secondary" type="button">Clear Chat</button>
      </div>
      <div class="status" id="chatStatus"></div>
      <div class="chat" id="chatLog"></div>
    </div>

    <div class="card">
      <h2>3) Vilasa Site-Visit Leads</h2>
      <p class="meta">Captured from WhatsApp option 4 (date → time → name & phone).</p>
      <div class="row">
        <button id="leadsBtn" class="secondary" type="button">Refresh Leads</button>
      </div>
      <div class="preview" id="leadsList">No leads yet — complete a site-visit booking in WhatsApp.</div>
    </div>

    <div class="card">
      <h2>4) Website Scrape (optional enrichment)</h2>
      <label for="url">Website URL</label>
      <input id="url" placeholder="https://example.com" />
      <div class="row">
        <button id="scrapeBtn" type="button">Scrape & Store</button>
        <button id="refreshBtn" class="secondary" type="button">Refresh Saved Sites</button>
      </div>
      <div class="status" id="scrapeStatus"></div>
      <div class="meta" id="scrapeMeta"></div>
      <div class="preview" id="scrapePreview">Scraped preview will appear here…</div>
      <div class="preview" id="savedList" style="max-height:160px;margin-top:10px">Saved sites loading…</div>
    </div>
  </div>

  <script>
    let profiles = [];
    let activeProfileId = null;

    const profileStatus = document.getElementById('profileStatus');
    const chatStatus = document.getElementById('chatStatus');
    const scrapeStatus = document.getElementById('scrapeStatus');
    const chatLog = document.getElementById('chatLog');

    function setStatus(el, text, type) {
      el.textContent = text || '';
      el.className = 'status' + (type ? ' ' + type : '');
    }

    function escapeHtml(value) {
      return String(value || '').replace(/</g, '&lt;');
    }

    function renderProfileControls() {
      const select = document.getElementById('profileSelect');
      select.innerHTML = profiles.map((p) =>
        '<option value="' + p.id + '"' + (p.id === activeProfileId ? ' selected' : '') + '>' +
        p.label + '</option>'
      ).join('');

      document.getElementById('profileRadios').innerHTML = profiles.map((p) =>
        '<label class="profile' + (p.id === activeProfileId ? ' active' : '') + '">' +
        '<input type="radio" name="demoProfile" value="' + p.id + '"' +
        (p.id === activeProfileId ? ' checked' : '') + ' />' +
        '<strong>' + escapeHtml(p.label) + '</strong>' +
        '<span>' + escapeHtml(p.description) + '</span></label>'
      ).join('');

      document.querySelectorAll('input[name="demoProfile"]').forEach((input) => {
        input.onchange = () => {
          document.getElementById('profileSelect').value = input.value;
          document.querySelectorAll('.profile').forEach((el) => el.classList.remove('active'));
          input.closest('.profile').classList.add('active');
        };
      });
    }

    function renderWelcome(preview) {
      const options = (preview.menuOptions || [])
        .map((o) => o.index + ') ' + o.title + (o.description ? ' — ' + o.description : ''))
        .join('\\n');

      document.getElementById('welcomePreview').textContent =
        (preview.welcomeText || '') + '\\n\\n' +
        (preview.menuTitle ? ('*' + preview.menuTitle + '*\\n') : '') +
        options +
        (preview.hint ? ('\\n\\n' + preview.hint) : '');

      document.getElementById('profileMeta').textContent =
        'Active: ' + (preview.profile?.label || activeProfileId);

      document.getElementById('chatMeta').textContent =
        'Chat routes to: ' + (preview.profile?.label || activeProfileId);

      const chips = document.getElementById('menuChips');
      chips.innerHTML = (preview.menuOptions || []).map((o) =>
        '<button class="chip" type="button" data-q="' + escapeHtml(o.id) + '">' +
        escapeHtml(o.title) + '</button>'
      ).join('');

      chips.querySelectorAll('.chip').forEach((btn) => {
        btn.onclick = () => {
          document.getElementById('question').value = btn.dataset.q;
          document.getElementById('askBtn').click();
        };
      });

      chatLog.innerHTML +=
        '<div class="bubble system"><strong>Demo:</strong> Activated ' +
        escapeHtml(preview.profile?.label || '') + '</div>' +
        '<div class="bubble ai"><strong>WhatsApp Preview:</strong>\\n' +
        escapeHtml(preview.welcomeText || '') + '</div>';
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function loadProfiles() {
      const res = await fetch('/api/demo/profiles');
      if (res.status === 401) return location.href = '/login';
      const data = await res.json();
      profiles = data.profiles || [];
      activeProfileId = data.activeProfileId;
      if (data.lastWhatsAppJid) {
        document.getElementById('waJid').value = data.lastWhatsAppJid;
      }
      renderProfileControls();
      if (data.preview) renderWelcome(data.preview);
    }

    async function activateProfile() {
      const profileId = document.getElementById('profileSelect').value;
      const pushToWhatsAppJid = document.getElementById('waJid').value.trim() || null;
      setStatus(profileStatus, 'Activating demo profile…');
      document.getElementById('activateBtn').disabled = true;
      try {
        const res = await fetch('/api/demo/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, pushToWhatsAppJid, trigger: true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to activate profile');
        activeProfileId = data.profile.id;
        profiles = profiles.map((p) => ({ ...p, active: p.id === activeProfileId }));
        renderProfileControls();
        renderWelcome(data.preview);
        if (data.whatsapp?.ok) {
          setStatus(profileStatus, 'Demo activated — WhatsApp welcome/menu sent', 'ok');
        } else if (data.whatsapp?.skipped) {
          setStatus(
            profileStatus,
            'Demo activated on this page. Enter a WhatsApp JID above to push the live welcome.',
            'ok'
          );
        } else if (data.whatsapp?.error) {
          setStatus(profileStatus, 'Demo activated, but WhatsApp push failed: ' + data.whatsapp.error, 'err');
        } else {
          setStatus(profileStatus, 'Demo activated — welcome preview ready', 'ok');
        }
      } catch (err) {
        setStatus(profileStatus, err.message, 'err');
      } finally {
        document.getElementById('activateBtn').disabled = false;
      }
    }

    document.getElementById('activateBtn').onclick = activateProfile;
    document.getElementById('reloadBtn').onclick = () => loadProfiles().catch((e) => setStatus(profileStatus, e.message, 'err'));
    document.getElementById('profileSelect').onchange = (e) => {
      document.querySelectorAll('input[name="demoProfile"]').forEach((input) => {
        input.checked = input.value === e.target.value;
        input.closest('.profile').classList.toggle('active', input.checked);
      });
    };

    document.getElementById('clearChatBtn').onclick = () => { chatLog.innerHTML = ''; };

    document.getElementById('askBtn').onclick = async () => {
      const question = document.getElementById('question').value.trim();
      if (!question) return setStatus(chatStatus, 'Enter a question', 'err');
      const btn = document.getElementById('askBtn');
      btn.disabled = true;
      setStatus(chatStatus, 'Thinking with active demo knowledge…');
      chatLog.innerHTML += '<div class="bubble user"><strong>You:</strong> ' + escapeHtml(question) + '</div>';
      try {
        const res = await fetch('/api/demo/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, profileId: activeProfileId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'AI request failed');
        chatLog.innerHTML += '<div class="bubble ai"><strong>AI (' +
          escapeHtml(data.profile?.label || activeProfileId) + '):</strong> ' +
          escapeHtml(data.reply || '') + '</div>';
        chatLog.scrollTop = chatLog.scrollHeight;
        setStatus(
          chatStatus,
          'Answer ready · source: ' + (data.knowledgeSource || 'active profile') +
          (data.mode ? ' · mode: ' + data.mode : ''),
          'ok'
        );
      } catch (err) {
        setStatus(chatStatus, err.message, 'err');
      } finally {
        btn.disabled = false;
      }
    };

    async function refreshSaved() {
      const res = await fetch('/api/website-knowledge');
      if (res.status === 401) return location.href = '/login';
      const data = await res.json();
      const list = data.items || [];
      document.getElementById('savedList').textContent = list.length
        ? list.map((r) => '• ' + (r.title || 'Untitled') + ' — ' + r.url + ' (' + (r.word_count || 0) + ' words)').join('\\n')
        : 'No websites stored yet.';
    }

    document.getElementById('refreshBtn').onclick = () => {
      refreshSaved().catch((e) => setStatus(scrapeStatus, e.message, 'err'));
    };

    document.getElementById('scrapeBtn').onclick = async () => {
      const url = document.getElementById('url').value.trim();
      if (!url) return setStatus(scrapeStatus, 'Please enter a URL', 'err');
      const btn = document.getElementById('scrapeBtn');
      btn.disabled = true;
      setStatus(scrapeStatus, 'Scraping & saving…');
      try {
        const res = await fetch('/api/scrape-and-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Scrape failed');
        setStatus(scrapeStatus, 'Saved successfully', 'ok');
        document.getElementById('scrapeMeta').textContent =
          (data.title || '') + ' · ' + (data.contentLength || 0) + ' chars · ' + (data.wordCount || 0) + ' words';
        document.getElementById('scrapePreview').textContent = data.preview || '';
        await refreshSaved();
      } catch (err) {
        setStatus(scrapeStatus, err.message, 'err');
      } finally {
        btn.disabled = false;
      }
    };

    async function refreshLeads() {
      try {
        const res = await fetch('/api/demo/vilasa-leads');
        if (res.status === 401) return location.href = '/login';
        const data = await res.json();
        const leads = data.leads || [];
        document.getElementById('leadsList').textContent = leads.length
          ? leads.map((l, i) =>
              (i + 1) + ') ' + (l.name || 'Guest') +
              ' · ' + (l.phone || 'n/a') +
              ' · ' + (l.preferredDate || '') + ' @ ' + (l.preferredTime || '') +
              ' · ' + (l.createdAt || '')
            ).join('\\n')
          : 'No leads yet — complete a site-visit booking in WhatsApp.';
      } catch (err) {
        document.getElementById('leadsList').textContent = err.message;
      }
    }

    document.getElementById('leadsBtn').onclick = () => refreshLeads();

    loadProfiles().catch((e) => setStatus(profileStatus, e.message, 'err'));
    refreshSaved().catch(() => {});
    refreshLeads().catch(() => {});
  </script>
</body>
</html>`;
}
