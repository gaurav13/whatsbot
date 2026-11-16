export function demoPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Website Demo — GS AI</title>
  <style>
    :root {
      --bg: #071018;
      --card: #101c27;
      --text: #f3f7fb;
      --muted: #9bb0c3;
      --line: #274056;
      --accent: #25d366;
      --accent-2: #3b82f6;
      --ok: #25d366;
      --warn: #f5c542;
      --err: #ff8e9a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      min-height: 100vh;
      background:
        radial-gradient(900px 420px at 8% -10%, rgba(37,211,102,.22), transparent 55%),
        radial-gradient(700px 380px at 100% 0%, rgba(59,130,246,.18), transparent 50%),
        var(--bg);
    }
    a { color: #8fd3ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .top {
      border-bottom: 1px solid var(--line);
      background: rgba(7,16,24,.72);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
    .nav {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: center;
      min-height: 56px;
      font-size: .92rem;
    }
    .nav a.here { color: var(--accent); font-weight: 650; }
    .hero {
      display: grid;
      grid-template-columns: 1.3fr .7fr;
      gap: 22px;
      align-items: end;
      padding: 28px 0 8px;
    }
    @media (max-width: 860px) { .hero { grid-template-columns: 1fr; } }
    .eyebrow {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      font-size: .78rem;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 8px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 6px rgba(37,211,102,.15); }
    h1 { margin: 0 0 8px; font-size: clamp(1.6rem, 3vw, 2.15rem); letter-spacing: -.02em; }
    .sub { color: var(--muted); margin: 0; line-height: 1.5; max-width: 58ch; }
    .badge {
      background: #122433;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px 18px;
      text-align: right;
    }
    @media (max-width: 860px) { .badge { text-align: left; } }
    .badge strong { display: block; font-size: 1.05rem; }
    .badge span { color: var(--muted); font-size: .85rem; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 18px 0 40px;
    }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    .span-2 { grid-column: 1 / -1; }
    .card {
      background: linear-gradient(180deg, rgba(23,38,52,.92), rgba(12,20,29,.96));
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 18px 40px rgba(0,0,0,.28);
    }
    h2 { margin: 0 0 6px; font-size: 1.08rem; }
    .hint { color: var(--muted); font-size: .88rem; margin: 0 0 14px; line-height: 1.45; }
    label { display: block; font-size: .82rem; color: var(--muted); margin: 10px 0 6px; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      background: #0b151e;
      color: var(--text);
      border-radius: 12px;
      padding: 11px 12px;
      font: inherit;
    }
    textarea { min-height: 84px; resize: vertical; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
    .profiles { display: grid; gap: 10px; margin-top: 10px; }
    .profile {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      background: #0d1822;
      cursor: pointer;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      align-items: start;
      transition: border-color .15s, box-shadow .15s;
    }
    .profile strong { grid-column: 2; }
    .profile span { grid-column: 2; color: var(--muted); font-size: .84rem; line-height: 1.4; }
    .profile input { width: auto; margin-top: 3px; }
    .profile.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(37,211,102,.45) inset, 0 10px 24px rgba(37,211,102,.08);
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 11px;
      padding: 10px 15px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      color: #06210f;
      background: linear-gradient(180deg, #4ade80, var(--accent));
    }
    button.secondary { color: var(--text); background: #1b2c3c; }
    button:disabled { opacity: .6; cursor: wait; }
    .status { margin-top: 10px; color: var(--warn); font-size: .9rem; min-height: 1.2em; }
    .status.ok { color: var(--ok); }
    .status.err { color: var(--err); }
    .phone {
      background: #075e54;
      border-radius: 22px;
      padding: 12px 10px 16px;
      min-height: 360px;
      display: flex;
      flex-direction: column;
    }
    .phone-bar {
      color: #d1fae5;
      font-size: .82rem;
      font-weight: 650;
      padding: 6px 10px 12px;
      display: flex;
      justify-content: space-between;
    }
    .chat {
      flex: 1;
      background: #0b141a url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath fill='%23ffffff08' d='M0 0h30v30H0z'/%3E%3C/svg%3E");
      border-radius: 14px;
      padding: 12px;
      overflow: auto;
      max-height: 380px;
    }
    .bubble { max-width: 92%; margin: 8px 0; padding: 8px 11px; border-radius: 12px; font-size: .9rem; line-height: 1.4; white-space: pre-wrap; }
    .bubble.user { margin-left: auto; background: #005c4b; color: #e7fff6; border-bottom-right-radius: 4px; }
    .bubble.ai { background: #1f2c34; color: #eef6fb; border-bottom-left-radius: 4px; }
    .bubble.system { margin: 10px auto; background: transparent; color: #cde7d8; font-size: .78rem; text-align: center; }
    .preview {
      margin-top: 12px;
      background: #0b151e;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      white-space: pre-wrap;
      font-size: .9rem;
      line-height: 1.45;
      max-height: 240px;
      overflow: auto;
    }
    .meta { color: var(--muted); font-size: .82rem; margin-top: 8px; }
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
    .leads { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .leads th, .leads td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
    .leads th { color: var(--muted); font-weight: 600; }
    .foot { color: var(--muted); font-size: .8rem; padding: 0 0 36px; }
  </style>
</head>
<body>
  <div class="top">
    <div class="wrap">
      <div class="nav">
        <a href="/">QR Login</a>
        <a href="/knowledge">Knowledge</a>
        <a href="/admin/dashboard">Tenants</a>
        <a href="/admin/ai">AI Settings</a>
        <a href="/demo" class="here">Website Demo</a>
        <a href="/logout">Logout</a>
      </div>
    </div>
  </div>
  <div class="wrap">
    <div class="hero">
      <div>
        <div class="eyebrow"><span class="dot"></span> Live client walkthrough</div>
        <h1>Website Demo</h1>
        <p class="sub">Show a prospect how GS AI greets customers on WhatsApp, answers from the business knowledge base, and captures leads — in the same flow they will go live with.</p>
      </div>
      <div class="badge">
        <strong id="heroProfile">Vilasa / GS AI</strong>
        <span>Active demo profile · switch instantly below</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>1. Choose the story</h2>
        <p class="hint">Pick a vertical, then activate the welcome menu the customer would see on WhatsApp.</p>
        <label for="profileSelect">Active profile</label>
        <select id="profileSelect"></select>
        <div class="profiles" id="profileRadios"></div>
        <div class="row">
          <button id="activateBtn" type="button">Activate &amp; preview welcome</button>
          <button id="reloadBtn" class="secondary" type="button">Reload</button>
        </div>
        <label for="waJid">Optional: send the same welcome to a WhatsApp number</label>
        <input id="waJid" placeholder="9198xxxxxxxx@s.whatsapp.net" />
        <div class="status" id="profileStatus"></div>
        <div class="meta" id="profileMeta"></div>
        <div class="preview" id="welcomePreview">Welcome preview will appear here…</div>
        <div class="chips" id="menuChips"></div>
      </div>

      <div class="card">
        <h2>2. Ask the assistant</h2>
        <p class="hint" id="chatMeta">Questions use the active demo knowledge — pricing, amenities, services.</p>
        <div class="phone">
          <div class="phone-bar"><span>GS AI WhatsApp</span><span>online</span></div>
          <div class="chat" id="chatLog"></div>
        </div>
        <label for="question">Try a client question</label>
        <textarea id="question" placeholder="e.g. What is the starting price? Do you offer WhatsApp marketing?"></textarea>
        <div class="row">
          <button id="askBtn" type="button">Ask demo AI</button>
          <button id="clearChatBtn" class="secondary" type="button">Clear chat</button>
        </div>
        <div class="status" id="chatStatus"></div>
      </div>

      <div class="card">
        <h2>3. Leads captured in the demo</h2>
        <p class="hint">Vilasa site-visit bookings (name, phone, preferred slot) appear here for the walkthrough.</p>
        <div class="row">
          <button id="leadsBtn" class="secondary" type="button">Refresh leads</button>
        </div>
        <div class="preview" id="leadsList" style="max-height:none;white-space:normal">No leads yet — complete a site-visit booking in WhatsApp.</div>
      </div>

      <div class="card">
        <h2>4. Optional website scrape</h2>
        <p class="hint">Pull public site copy into the knowledge base when a client wants answers from their own pages.</p>
        <label for="url">Website URL</label>
        <input id="url" placeholder="https://example.com" />
        <div class="row">
          <button id="scrapeBtn" type="button">Scrape &amp; store</button>
          <button id="refreshBtn" class="secondary" type="button">Refresh saved sites</button>
        </div>
        <div class="status" id="scrapeStatus"></div>
        <div class="meta" id="scrapeMeta"></div>
        <div class="preview" id="scrapePreview">Scraped preview will appear here…</div>
        <div class="preview" id="savedList" style="max-height:160px;margin-top:10px">Saved sites loading…</div>
      </div>
    </div>
    <p class="foot">GS AI Solutions · client demonstration only · switch profiles without restarting the bot</p>
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

      const label = preview.profile?.label || activeProfileId || 'Demo';
      document.getElementById('profileMeta').textContent = 'Active: ' + label;
      document.getElementById('heroProfile').textContent = label;
      document.getElementById('chatMeta').textContent =
        'Answers come from the ' + label + ' knowledge base — the same content WhatsApp uses.';

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
        '<div class="bubble system">Activated ' + escapeHtml(label) + '</div>' +
        '<div class="bubble ai">' + escapeHtml(preview.welcomeText || '') + '</div>';
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
          setStatus(profileStatus, 'Demo activated — WhatsApp welcome sent', 'ok');
        } else if (data.whatsapp?.skipped) {
          setStatus(
            profileStatus,
            'Demo is live on this page. Add a WhatsApp JID to push the same welcome to a phone.',
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
      setStatus(chatStatus, 'Thinking with the active demo knowledge…');
      chatLog.innerHTML += '<div class="bubble user">' + escapeHtml(question) + '</div>';
      try {
        const res = await fetch('/api/demo/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, profileId: activeProfileId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'AI request failed');
        chatLog.innerHTML += '<div class="bubble ai">' + escapeHtml(data.reply || '') + '</div>';
        chatLog.scrollTop = chatLog.scrollHeight;
        setStatus(
          chatStatus,
          'Answer ready · ' + (data.knowledgeSource || 'active profile') +
          (data.mode ? ' · ' + data.mode : ''),
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
        const box = document.getElementById('leadsList');
        if (!leads.length) {
          box.textContent = 'No leads yet — complete a site-visit booking in WhatsApp.';
          return;
        }
        box.innerHTML = '<table class="leads"><thead><tr><th>Guest</th><th>Phone</th><th>Slot</th></tr></thead><tbody>' +
          leads.map((l) =>
            '<tr><td>' + escapeHtml(l.name || 'Guest') + '</td><td>' +
            escapeHtml(l.phone || 'n/a') + '</td><td>' +
            escapeHtml((l.preferredDate || '') + (l.preferredTime ? ' · ' + l.preferredTime : '')) +
            '</td></tr>'
          ).join('') + '</tbody></table>';
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
