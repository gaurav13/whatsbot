import { getTenantById, setTenantLinkedWhatsapp } from '../db.js';
import { handleMessagesUpsert } from '../whatsappHandler.js';
import {
  isEvolutionEnabled,
  instanceNameForTenant,
  tenantIdFromInstanceName,
  getEvolutionSock,
  applyEvolutionQr,
  applyEvolutionConnection,
} from '../services/evolutionGateway.js';

const seenMessageIds = new Map();
const DEDUPE_TTL_MS = 5 * 60 * 1000;

function webhookSecret() {
  return String(process.env.EVOLUTION_WEBHOOK_KEY || '').trim();
}

function eventName(body) {
  return String(body?.event || body?.type || '').toLowerCase().replace(/_/g, '.');
}

function instanceFromPayload(body) {
  return String(
    body?.instance || body?.instanceName || body?.data?.instance || body?.data?.instanceName || ''
  ).trim();
}

function rememberMessage(id) {
  if (!id) return false;
  const now = Date.now();
  const prev = seenMessageIds.get(id);
  if (prev && now - prev < DEDUPE_TTL_MS) return true;
  seenMessageIds.set(id, now);
  if (seenMessageIds.size > 3000) {
    for (const [key, at] of seenMessageIds) {
      if (now - at > DEDUPE_TTL_MS) seenMessageIds.delete(key);
    }
  }
  return false;
}

function normalizeMessages(data) {
  if (!data) return [];
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data)) return data;
  if (data.key || data.message) return [data];
  return [];
}

function isStatusOrGroup(jid) {
  const remote = String(jid || '');
  return !remote || remote === 'status@broadcast' || remote.endsWith('@g.us') || remote === 'status@broadcast';
}

async function handleEvolutionEvent(body) {
  const event = eventName(body);
  const instance = instanceFromPayload(body);
  const tenantId = tenantIdFromInstanceName(instance);
  if (!tenantId) {
    return { handled: 'ignored', reason: 'unknown-instance', instance, event };
  }

  if (event.includes('qrcode')) {
    await applyEvolutionQr(tenantId, body?.data || body);
    return { handled: 'qrcode', tenantId };
  }

  if (event.includes('connection') || event.includes('logout')) {
    const inst = await applyEvolutionConnection(tenantId, body?.data || body);
    if (inst.connectionStatus === 'connected' && inst.linkedJid) {
      setTenantLinkedWhatsapp(tenantId, inst.linkedJid).catch(() => {});
    }
    if (event.includes('logout')) {
      await applyEvolutionConnection(tenantId, { state: 'close' });
    }
    return { handled: event.includes('logout') ? 'logout' : 'connection', tenantId };
  }

  if (!event.includes('messages.upsert') && !event.includes('messagesupsert')) {
    return { handled: 'ignored', event, tenantId };
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant) return { handled: 'ignored', reason: 'unknown-tenant', tenantId };

  const sock = getEvolutionSock(tenantId);
  const messages = normalizeMessages(body.data);
  let processed = 0;
  for (const msg of messages) {
    const key = msg?.key || {};
    const remoteJid = key.remoteJid || msg.remoteJid;
    if (key.fromMe || msg.fromMe) continue;
    if (isStatusOrGroup(remoteJid)) continue;
    if (!msg.message && !msg.conversation) continue;
    const id = key.id || msg.id || msg.messageId;
    if (rememberMessage(id)) continue;
    const baileysMsg = {
      key: {
        remoteJid,
        fromMe: false,
        id,
        participant: key.participant,
      },
      message:
        msg.message ||
        (msg.conversation ? { conversation: msg.conversation } : null),
      pushName: msg.pushName,
    };
    if (!baileysMsg.message) continue;
    await handleMessagesUpsert(
      sock,
      { messages: [baileysMsg], type: 'notify' },
      {
        tenant,
        getTenant: () => getTenantById(tenantId),
      }
    );
    processed += 1;
  }
  return { handled: 'message', tenantId, processed };
}

export function registerEvolutionWebhook(app) {
  app.post('/webhooks/evolution', (req, res) => {
    try {
      const expected = webhookSecret();
      const provided = String(
        req.headers.apikey || req.headers['x-api-key'] || req.query.apikey || ''
      );
      if (expected && provided !== expected) {
        return res.status(401).json({ ok: false, error: 'Invalid webhook apikey' });
      }
      if (!isEvolutionEnabled()) {
        return res.status(200).json({ ok: true, ignored: 'baileys-mode' });
      }

      res.status(200).json({ ok: true, received: true });
      setImmediate(() => {
        Promise.resolve()
          .then(() => handleEvolutionEvent(req.body || {}))
          .catch((err) => console.error('Evolution webhook handler:', err?.message || err));
      });
    } catch (err) {
      console.error('Evolution webhook route:', err?.message || err);
      if (!res.headersSent) {
        return res.status(200).json({ ok: false, error: 'webhook_accepted_with_error' });
      }
    }
  });

  app.get('/webhooks/evolution/health', (_req, res) => {
    res.json({
      ok: true,
      provider: isEvolutionEnabled() ? 'evolution' : 'baileys',
      path: '/webhooks/evolution',
      instanceNameExample: instanceNameForTenant('00000000-0000-0000-0000-000000000000'),
    });
  });
}
