export function loginPageHtml(errorMessage = '') {
  const errorBlock = errorMessage
    ? `<div class="error">${escapeHtml(errorMessage)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Login — GS AI Solutions</title>
  <style>
    :root {
      --bg: #0f1720;
      --card: #17212b;
      --text: #e8eef4;
      --muted: #93a4b5;
      --line: #2a3b4c;
      --accent: #2563eb;
      --danger: #ff8e9a;
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
      width: min(420px, 100%);
      background: color-mix(in srgb, var(--card) 92%, black);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 28px 24px 22px;
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    h1 { margin: 0 0 6px; font-size: 1.35rem; }
    p { margin: 0 0 18px; color: var(--muted); line-height: 1.45; }
    label { display: block; font-size: .85rem; color: var(--muted); margin: 12px 0 6px; }
    input {
      width: 100%;
      border: 1px solid var(--line);
      background: #0e1620;
      color: var(--text);
      border-radius: 10px;
      padding: 11px 12px;
      font: inherit;
    }
    button {
      width: 100%;
      margin-top: 18px;
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 11px 14px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(180deg, #3b82f6, var(--accent));
    }
    .error {
      background: rgba(227, 93, 106, .12);
      border: 1px solid rgba(227, 93, 106, .35);
      color: var(--danger);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: .92rem;
    }
    .hint { margin-top: 14px; font-size: .82rem; color: var(--muted); }
    .hint a {
      color: #7dd3fc;
      font-weight: 650;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .hint a:hover { color: #bae6fd; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Admin Login</h1>
    <p>Sign in to manage WhatsApp QR, knowledge, and AI settings.</p>
    ${errorBlock}
    <form method="POST" action="/operator">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Login</button>
    </form>
    <p class="hint">Operator credentials are stored in <code>config.json</code>.<br/>Business clients should use <a href="/login">client login</a>.</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
