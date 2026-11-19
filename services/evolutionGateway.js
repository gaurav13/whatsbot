import fs from 'fs';
import axios from 'axios';
import QRCode from 'qrcode';
import { setQr, clearQr, setConnectionStatus } from '../qrState.js';

/**
 * Evolution API v2 client + per-tenant QR/session cache.
 * Native Baileys stays in sessionManager.js when WHATSAPP_PROVIDER is not evolution.
 */

const sessions = new Map();
const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
  'LOGOUT_INSTANCE',
];

export function isEvolutionEnabled() {
  return String(process.env.WHATSAPP_PROVIDER || '').toLowerCase() === 'evolution';
}

export function evolutionConfig() {
  const baseURL = String(process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080').replace(
    /\/$/,
    ''
  );
  const apiKey = process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || '';
  return { baseURL, apiKey };
}

/** Deterministic instance name: t_<uuid-without-dashes> */
export function instanceNameForTenant(tenantId) {
  const compact = String(tenantId || '').replace(/-/g, '').toLowerCase();
  return `t_${compact}`.slice(0, 50);
}

export function tenantIdFromInstanceName(instanceName) {
  const raw = String(instanceName || '').trim();
  const compact = raw.replace(/^t_/i, '').replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }
  return null;
}

function webhookUrl() {
  return (
    process.env.EVOLUTION_WEBHOOK_URL ||
    'http://host.docker.internal:3000/webhooks/evolution'
  );
}

function blankSession(tenantId) {
  return {
    tenantId: String(tenantId),
    instanceName: instanceNameForTenant(tenantId),
    connectionStatus: 'stopped',
    qrDataUrl: null,
    linkedJid: null,
    lastUpdated: new Date().toISOString(),
    syncGlobalQr: false,
  };
}

export function getEvolutionSession(tenantId) {
  const id = String(tenantId || '');
  if (!id) return blankSession('');
  if (!sessions.has(id)) sessions.set(id, blankSession(id));
  return sessions.get(id);
}

function touch(inst, patch = {}) {
  Object.assign(inst, patch, { lastUpdated: new Date().toISOString() });
  if (inst.syncGlobalQr) {
    if (inst.qrDataUrl) setQr('evolution', inst.qrDataUrl);
    else if (inst.connectionStatus === 'connected') clearQr('connected');
    else setConnectionStatus(inst.connectionStatus);
  }
  return inst;
}

function client() {
  const { baseURL, apiKey } = evolutionConfig();
  if (!apiKey) {
    throw new Error('EVOLUTION_API_KEY (or AUTHENTICATION_API_KEY) is not set');
  }
  return axios.create({
    baseURL,
    timeout: 30_000,
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
  });
}

async function request(method, url, data, params) {
  try {
    const res = await client().request({ method, url, data, params });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const detail =
      (Array.isArray(body?.response?.message) && body.response.message.join('; ')) ||
      body?.message ||
      body?.error ||
      err.message;
    const wrapped = new Error(
      `Evolution ${method.toUpperCase()} ${url} failed (${status || 'n/a'}): ${detail}`
    );
    wrapped.status = status;
    wrapped.body = body;
    throw wrapped;
  }
}

export function jidToNumber(jid) {
  const raw = String(jid || '').trim();
  if (!raw) return '';
  const user = raw.split('@')[0] || raw;
  return user.split(':')[0].replace(/\D/g, '');
}

function extractConnectionState(data) {
  return String(
    data?.instance?.state ||
      data?.state ||
      data?.status ||
      data?.instance?.status ||
      ''
  ).toLowerCase();
}

function extractQrPayload(data) {
  const node = data?.qrcode || data?.data?.qrcode || data;
  return {
    base64: node?.base64 || data?.base64 || data?.qrcode?.base64 || null,
    code: node?.code || data?.code || data?.qrcode?.code || null,
  };
}

async function qrDataUrlFromPayload(data) {
  const { base64, code } = extractQrPayload(data);
  if (typeof base64 === 'string' && base64.startsWith('data:image')) return base64;
  if (typeof base64 === 'string' && base64.length > 80) {
    return `data:image/png;base64,${base64.replace(/^data:image\/png;base64,/, '')}`;
  }
  if (code) {
    return QRCode.toDataURL(String(code), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });
  }
  return null;
}

export async function fetchInstances() {
  const data = await request('get', '/instance/fetchInstances');
  return Array.isArray(data) ? data : [];
}

export async function setInstanceWebhook(instanceName, url = webhookUrl()) {
  return request('post', `/webhook/set/${encodeURIComponent(instanceName)}`, {
    webhook: {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: false,
      events: WEBHOOK_EVENTS,
    },
  });
}

export async function createTenantInstance(tenantId) {
  const instanceName = instanceNameForTenant(tenantId);
  const payload = {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      url: webhookUrl(),
      byEvents: false,
      base64: false,
      events: WEBHOOK_EVENTS,
    },
  };
  try {
    return { instanceName, created: await request('post', '/instance/create', payload) };
  } catch (err) {
    if (err.status === 403 || err.status === 409 || /already/i.test(err.message)) {
      return { instanceName, created: null, existed: true };
    }
    throw err;
  }
}

export async function connectInstance(instanceName) {
  return request('get', `/instance/connect/${encodeURIComponent(instanceName)}`);
}

export async function connectionState(instanceName) {
  return request('get', `/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export async function logoutInstance(instanceName) {
  return request('delete', `/instance/logout/${encodeURIComponent(instanceName)}`);
}

export async function deleteInstance(instanceName) {
  return request('delete', `/instance/delete/${encodeURIComponent(instanceName)}`);
}

export async function sendText(instanceName, number, text) {
  return request('post', `/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: String(number).replace(/\D/g, ''),
    text: String(text || ''),
  });
}

export async function sendPresence(instanceName, number, presence = 'composing') {
  return request('post', `/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
    number: String(number).replace(/\D/g, ''),
    delay: 0,
    presence,
  });
}

function mediaFromContentPart(part) {
  if (!part) return null;
  if (Buffer.isBuffer(part)) return part.toString('base64');
  if (part instanceof Uint8Array) return Buffer.from(part).toString('base64');
  if (typeof part === 'string') {
    if (part.startsWith('/') && fs.existsSync(part)) return fs.readFileSync(part).toString('base64');
    return part;
  }
  if (part.url) {
    if (typeof part.url === 'string' && !/^https?:/i.test(part.url) && fs.existsSync(part.url)) {
      return fs.readFileSync(part.url).toString('base64');
    }
    return part.url;
  }
  if (Buffer.isBuffer(part.data)) return part.data.toString('base64');
  return null;
}

export async function sendMedia(instanceName, number, { mediatype, media, mimetype, caption, fileName }) {
  return request('post', `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    number: String(number).replace(/\D/g, ''),
    mediatype,
    mimetype: mimetype || undefined,
    caption: caption || undefined,
    media,
    fileName: fileName || undefined,
  });
}

export async function sendWhatsAppContent(tenantId, jid, content = {}) {
  const instanceName = instanceNameForTenant(tenantId);
  const number = jidToNumber(jid);
  if (!number) throw new Error('Invalid WhatsApp number');

  if (content.image) {
    return sendMedia(instanceName, number, {
      mediatype: 'image',
      media: mediaFromContentPart(content.image),
      mimetype: content.mimetype,
      caption: content.caption,
      fileName: content.fileName,
    });
  }
  if (content.video) {
    return sendMedia(instanceName, number, {
      mediatype: 'video',
      media: mediaFromContentPart(content.video),
      mimetype: content.mimetype,
      caption: content.caption,
      fileName: content.fileName,
    });
  }
  if (content.audio) {
    return sendMedia(instanceName, number, {
      mediatype: 'audio',
      media: mediaFromContentPart(content.audio),
      mimetype: content.mimetype,
      fileName: content.fileName,
    });
  }
  if (content.document) {
    return sendMedia(instanceName, number, {
      mediatype: 'document',
      media: mediaFromContentPart(content.document),
      mimetype: content.mimetype,
      caption: content.caption,
      fileName: content.fileName,
    });
  }
  const text = content.text || content.caption || '';
  return sendText(instanceName, number, text);
}

function sentKey(result) {
  return (
    result?.key?.id ||
    result?.keyId ||
    result?.messageId ||
    result?.id ||
    result?.key?.remoteJid
  );
}

export function getEvolutionSock(tenantId) {
  const id = String(tenantId || '');
  const inst = getEvolutionSession(id);
  const sock = {
    __evolution: true,
    tenantId: id,
    user: { id: inst.linkedJid || null },
    ev: { on() {}, off() {}, emit() {} },
    ws: { once() {} },
    end() {},
    async presenceSubscribe() {},
    async sendPresenceUpdate(type, jid) {
      const presence = type === 'composing' ? 'composing' : 'paused';
      try {
        await sendPresence(instanceNameForTenant(id), jidToNumber(jid), presence);
      } catch {
        // presence is best-effort
      }
    },
    async sendMessage(jid, content) {
      const result = await sendWhatsAppContent(id, jid, content);
      return {
        key: {
          id: sentKey(result) || `evo-${Date.now()}`,
          remoteJid: jid,
          fromMe: true,
        },
        result,
      };
    },
    async relayMessage() {
      throw new Error('Evolution sock does not support Baileys relayMessage');
    },
  };
  return sock;
}

export async function applyEvolutionQr(tenantId, payload) {
  const inst = getEvolutionSession(tenantId);
  const qrDataUrl = await qrDataUrlFromPayload(payload);
  if (!qrDataUrl) return inst;
  return touch(inst, {
    qrDataUrl,
    connectionStatus: 'waiting_for_scan',
  });
}

export async function applyEvolutionConnection(tenantId, payload, { linkedJid } = {}) {
  const inst = getEvolutionSession(tenantId);
  const state = extractConnectionState(payload);
  if (state === 'open') {
    let owner = linkedJid || inst.linkedJid;
    if (!owner) {
      try {
        owner = await findInstanceOwner(inst.instanceName);
      } catch {
        // ignore
      }
    }
    return touch(inst, {
      connectionStatus: 'connected',
      qrDataUrl: null,
      linkedJid: owner || inst.linkedJid,
    });
  }
  if (state === 'connecting') {
    return touch(inst, { connectionStatus: 'connecting' });
  }
  return touch(inst, {
    connectionStatus: state === 'close' || state === 'closed' ? 'needs_scan' : state || 'disconnected',
    qrDataUrl: state === 'open' ? null : inst.qrDataUrl,
  });
}

async function findInstanceOwner(instanceName) {
  const list = await fetchInstances();
  const row = list.find((item) => {
    const name = item?.instance?.instanceName || item?.name || item?.instanceName;
    return name === instanceName;
  });
  return (
    row?.instance?.owner ||
    row?.instance?.ownerJid ||
    row?.ownerJid ||
    row?.owner ||
    null
  );
}

async function instanceExists(instanceName) {
  try {
    await connectionState(instanceName);
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

export async function ensureEvolutionSessionForUi(
  tenantId,
  { forceQr = false, syncGlobalQr = false } = {}
) {
  const id = String(tenantId || '');
  if (!id) return blankSession('');
  const inst = getEvolutionSession(id);
  inst.syncGlobalQr = Boolean(syncGlobalQr);
  if (forceQr) {
    await resetEvolutionSession(id, { restart: true, syncGlobalQr });
    return getEvolutionSession(id);
  }
  if (inst.connectionStatus === 'connected' || inst.qrDataUrl) {
    return inst;
  }

  touch(inst, { connectionStatus: inst.connectionStatus === 'connected' ? 'connected' : 'connecting' });
  const name = inst.instanceName;
  if (!(await instanceExists(name))) {
    await createTenantInstance(id);
  }
  try {
    await setInstanceWebhook(name);
  } catch (err) {
    console.warn(`Evolution webhook subscribe skipped for ${name}:`, err.message);
  }

  let state;
  try {
    state = await connectionState(name);
  } catch (err) {
    console.warn(`Evolution connectionState ${name}:`, err.message);
    state = null;
  }
  if (extractConnectionState(state) === 'open') {
    await applyEvolutionConnection(id, state);
    return getEvolutionSession(id);
  }

  try {
    const connected = await connectInstance(name);
    const qrDataUrl = await qrDataUrlFromPayload(connected);
    if (qrDataUrl) {
      touch(inst, { qrDataUrl, connectionStatus: 'waiting_for_scan' });
    } else if (extractConnectionState(connected) === 'open') {
      await applyEvolutionConnection(id, connected);
    } else {
      touch(inst, { connectionStatus: 'connecting' });
    }
  } catch (err) {
    console.warn(`Evolution connect ${name}:`, err.message);
    touch(inst, { connectionStatus: 'needs_scan' });
  }
  return getEvolutionSession(id);
}

export async function logoutEvolutionSession(tenantId, { restart = false, syncGlobalQr = false } = {}) {
  const inst = getEvolutionSession(tenantId);
  inst.syncGlobalQr = Boolean(syncGlobalQr);
  try {
    await logoutInstance(inst.instanceName);
  } catch (err) {
    if (err.status !== 404) console.warn('Evolution logout:', err.message);
  }
  touch(inst, { connectionStatus: 'logged_out', qrDataUrl: null, linkedJid: null });
  if (restart) {
    await ensureEvolutionSessionForUi(tenantId, { syncGlobalQr });
  }
  return { ok: true, message: 'Logged out. Scan a new QR to reconnect.', ...inst };
}

export async function resetEvolutionSession(tenantId, { restart = true, syncGlobalQr = false } = {}) {
  const inst = getEvolutionSession(tenantId);
  inst.syncGlobalQr = Boolean(syncGlobalQr);
  try {
    await logoutInstance(inst.instanceName);
  } catch {
    // ignore
  }
  try {
    await deleteInstance(inst.instanceName);
  } catch (err) {
    if (err.status !== 404) console.warn('Evolution delete:', err.message);
  }
  touch(inst, { connectionStatus: 'logged_out', qrDataUrl: null, linkedJid: null });
  if (restart) {
    await createTenantInstance(tenantId);
    return ensureEvolutionSessionForUi(tenantId, { syncGlobalQr });
  }
  return inst;
}

export function listEvolutionInstances() {
  return [...sessions.values()].map((inst) => ({
    tenantId: inst.tenantId,
    connectionStatus: inst.connectionStatus,
    hasQr: Boolean(inst.qrDataUrl),
    linkedJid: inst.linkedJid,
    lastUpdated: inst.lastUpdated,
  }));
}

export function isEvolutionConnected(tenantId) {
  return getEvolutionSession(tenantId).connectionStatus === 'connected';
}
