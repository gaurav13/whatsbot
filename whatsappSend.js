const lastInboundAt = new Map();
const RATE_MIN_MS = 3500;
const botOutboundIds = new Set();
const botSendDepth = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function typingDelayMs() {
  return 1500 + Math.floor(Math.random() * 501);
}

export function rememberBotMessage(sent) {
  const id = sent?.key?.id;
  if (!id) return;
  botOutboundIds.add(id);
  setTimeout(() => botOutboundIds.delete(id), 120_000);
}

export function beginBotSend(jid) {
  const key = String(jid || '');
  botSendDepth.set(key, (botSendDepth.get(key) || 0) + 1);
}

export function endBotSend(jid) {
  const key = String(jid || '');
  const next = (botSendDepth.get(key) || 1) - 1;
  if (next <= 0) botSendDepth.delete(key);
  else botSendDepth.set(key, next);
}

export function isBotOriginated(msg, jid) {
  if (msg?.key?.id && botOutboundIds.has(msg.key.id)) return true;
  return (botSendDepth.get(String(jid || msg?.key?.remoteJid || '')) || 0) > 0;
}

export function wrapSocketSend(sock) {
  if (sock.__botSendWrapped) return sock;
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async function sendMessageWrapped(jid, content, options) {
    beginBotSend(jid);
    try {
      const sent = await original(jid, content, options);
      rememberBotMessage(sent);
      return sent;
    } finally {
      endBotSend(jid);
    }
  };
  sock.__botSendWrapped = true;
  return sock;
}

export async function withComposing(sock, jid, sendFn) {
  try {
    await sock.presenceSubscribe(jid);
    await sock.sendPresenceUpdate('composing', jid);
  } catch {
    // presence is best-effort
  }

  await sleep(typingDelayMs());

  try {
    return await sendFn();
  } finally {
    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      // ignore
    }
  }
}

export async function sendWithTyping(sock, jid, text) {
  return withComposing(sock, jid, () => sock.sendMessage(jid, { text }));
}

/**
 * Drop inbound floods: at most one processed message per JID every ~3.5s.
 * Returns false when the message should be ignored.
 */
export function allowInboundMessage(jid) {
  const key = String(jid || '');
  if (!key) return false;
  const now = Date.now();
  const prev = lastInboundAt.get(key) || 0;
  if (now - prev < RATE_MIN_MS) return false;
  lastInboundAt.set(key, now);
  return true;
}

export function redactSecrets(input) {
  let text = '';
  if (input == null) return '';
  if (typeof input === 'string') text = input;
  else if (input instanceof Error) text = input.stack || input.message || String(input);
  else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }

  return text
    .replace(/AIza[0-9A-Za-z\-_]{8,}/g, 'AIza***')
    .replace(/\bsk-[A-Za-z0-9]{8,}/g, 'sk-***')
    .replace(/\bgsk_[A-Za-z0-9]{8,}/g, 'gsk-***')
    .replace(/\bxai-[A-Za-z0-9]{8,}/g, 'xai-***')
    .replace(/(api[_-]?key|authorization|bearer)(["'\s:=]+)[^\s"',]+/gi, '$1$2***');
}
