import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { loadBaileysAuthState } from './baileysAuthStore.js';
import {
  getTenantById,
  baileysAuthClearAll,
  setTenantLinkedWhatsapp,
  isTenantPlanActive,
} from './db.js';
import { attachWhatsAppHandler, pushTenantWelcome } from './whatsappHandler.js';
import { setQr, clearQr, setConnectionStatus } from './qrState.js';
import { redactSecrets } from './whatsappSend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baileysLogger = pino({ level: 'silent' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @type {Map<string, { sock: any, tenantId: string, qrDataUrl: string|null, connectionStatus: string, reconnectTimer: any, bootPromise: any, lastUpdated: string, loggingOut: boolean }>} */
const instances = new Map();

function authFolder(tenantId) {
  return path.join(__dirname, 'baileys_auth_info', String(tenantId || 'legacy'));
}

function blankInstance(tenantId) {
  return {
    sock: null,
    tenantId,
    qrDataUrl: null,
    connectionStatus: 'starting',
    reconnectTimer: null,
    bootPromise: null,
    lastUpdated: new Date().toISOString(),
    loggingOut: false,
    reconnectAttempt: 0,
  };
}

function reconnectDelayMs(attempt) {
  return Math.min(60_000, 2_000 * 2 ** Math.min(Number(attempt) || 0, 5));
}

function disconnectLabel(statusCode) {
  const map = {
    [DisconnectReason.loggedOut]: 'logged out',
    [DisconnectReason.connectionClosed]: 'connection closed',
    [DisconnectReason.connectionLost]: 'connection lost',
    [DisconnectReason.timedOut]: 'timed out',
    [DisconnectReason.restartRequired]: 'restart required',
    [DisconnectReason.unavailableService]: 'service unavailable',
    [DisconnectReason.connectionReplaced]: 'connection replaced',
    [DisconnectReason.badSession]: 'bad session',
    [DisconnectReason.multideviceMismatch]: 'multidevice mismatch',
  };
  return map[statusCode] || `code ${statusCode ?? 'n/a'}`;
}

export function listWhatsAppInstances() {
  return [...instances.values()].map((inst) => ({
    tenantId: inst.tenantId,
    connectionStatus: inst.connectionStatus,
    hasQr: Boolean(inst.qrDataUrl),
    linkedJid: inst.linkedJid || inst.sock?.user?.id || null,
    lastUpdated: inst.lastUpdated,
  }));
}

export function getTenantQrState(tenantId) {
  const inst = instances.get(String(tenantId));
  if (!inst) {
    return {
      connectionStatus: 'stopped',
      hasQr: false,
      qrDataUrl: null,
      lastUpdated: null,
    };
  }
  return {
    connectionStatus: inst.connectionStatus,
    hasQr: Boolean(inst.qrDataUrl),
    qrDataUrl: inst.qrDataUrl,
    lastUpdated: inst.lastUpdated,
  };
}

export function getSock(tenantId) {
  return instances.get(String(tenantId))?.sock || null;
}

export async function startTenantSession(tenantId, { syncGlobalQr = false } = {}) {
  const id = String(tenantId);
  let inst = instances.get(id);
  if (!inst) {
    inst = blankInstance(id);
    instances.set(id, inst);
  }
  if (inst.bootPromise) return inst.bootPromise;

  inst.bootPromise = (async () => {
    try {
    if (inst.sock) {
      try {
        inst.sock.ev?.removeAllListeners?.();
        inst.sock.end?.(undefined);
      } catch {
        // ignore
      }
      inst.sock = null;
      await sleep(400);
    }

    const tenant = await getTenantById(id);
    if (tenant && !isTenantPlanActive(tenant)) {
      inst.connectionStatus = 'disabled';
      inst.sock = null;
      return inst;
    }
    const folder = authFolder(id);
    fs.mkdirSync(folder, { recursive: true });
    const auth = await loadBaileysAuthState(folder, id);

    const sock = makeWASocket({
      auth: auth.state,
      logger: baileysLogger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 30_000,
      retryRequestDelayMs: 500,
    });
    inst.sock = sock;
    inst.connectionStatus = 'connecting';
    inst.lastUpdated = new Date().toISOString();
    if (syncGlobalQr) setConnectionStatus('connecting');

    sock.ev.on('creds.update', auth.saveCreds);

    sock.ev.on('connection.update', async (update) => {
      try {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.log(`\n📷 Tenant ${id} — scan WhatsApp QR at /dashboard\n`);
        if (syncGlobalQr) qrcodeTerminal.generate(qr, { small: true });
        try {
          inst.qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
          });
          inst.connectionStatus = 'waiting_for_scan';
          inst.lastUpdated = new Date().toISOString();
          if (syncGlobalQr) setQr(qr, inst.qrDataUrl);
        } catch (err) {
          console.error('QR render failed:', err?.message || err);
        }
      }

      if (connection === 'connecting') {
        inst.connectionStatus = 'connecting';
        if (syncGlobalQr) setConnectionStatus('connecting');
      }

      if (connection === 'close') {
        if (inst.loggingOut) {
          inst.connectionStatus = 'logging_out';
          inst.qrDataUrl = null;
          return;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const replaced = statusCode === DisconnectReason.connectionReplaced;
        inst.connectionStatus = loggedOut ? 'logged_out' : 'reconnecting';
        inst.qrDataUrl = null;
        inst.lastUpdated = new Date().toISOString();
        if (syncGlobalQr) clearQr(inst.connectionStatus);
        if (inst.sock === sock) inst.sock = null;
        console.warn(
          `🔌 Tenant ${id} disconnected (${disconnectLabel(statusCode)})` +
            (lastDisconnect?.error?.message
              ? ` — ${redactSecrets(lastDisconnect.error.message)}`
              : '')
        );

        if (loggedOut) {
          try {
            await baileysAuthClearAll(id);
            fs.rmSync(authFolder(id), { recursive: true, force: true });
          } catch {
            // ignore
          }
        }

        if (inst.reconnectTimer) clearTimeout(inst.reconnectTimer);
        const delay = replaced
          ? 15_000
          : reconnectDelayMs(inst.reconnectAttempt++);
        inst.reconnectTimer = setTimeout(async () => {
          inst.reconnectTimer = null;
          try {
            const live = await getTenantById(id);
            if (live && !isTenantPlanActive(live)) {
              inst.connectionStatus = 'disabled';
              return;
            }
            await startTenantSession(id, { syncGlobalQr });
          } catch (err) {
            console.error(`Reconnect failed for tenant ${id}:`, redactSecrets(err));
            inst.reconnectTimer = setTimeout(
              () => startTenantSession(id, { syncGlobalQr }).catch(() => {}),
              reconnectDelayMs(inst.reconnectAttempt++)
            );
          }
        }, delay);
      } else if (connection === 'open') {
        inst.reconnectAttempt = 0;
        inst.qrDataUrl = null;
        inst.connectionStatus = 'connected';
        inst.lastUpdated = new Date().toISOString();
        inst.linkedJid = sock.user?.id || sock.user?.jid || null;
        if (inst.linkedJid) {
          setTenantLinkedWhatsapp(id, inst.linkedJid).catch(() => {});
        }
        if (syncGlobalQr) clearQr('connected');
        console.log(`✅ WhatsApp connected for tenant ${id} (${tenant?.business_name || 'n/a'})`);
      }
      } catch (err) {
        console.warn(`connection.update error tenant ${id}:`, redactSecrets(err));
      }
    });

    attachWhatsAppHandler(sock, {
      tenant,
      getTenant: () => getTenantById(id),
    });
    } catch (err) {
      inst.sock = null;
      inst.connectionStatus = 'reconnecting';
      console.error(`startTenantSession failed ${id}:`, redactSecrets(err));
      const delay = reconnectDelayMs(inst.reconnectAttempt++);
      if (inst.reconnectTimer) clearTimeout(inst.reconnectTimer);
      inst.reconnectTimer = setTimeout(() => {
        inst.reconnectTimer = null;
        startTenantSession(id, { syncGlobalQr }).catch((e) =>
          console.error(`Reconnect failed for tenant ${id}:`, redactSecrets(e))
        );
      }, delay);
    }
  })();

  try {
    await inst.bootPromise;
  } finally {
    inst.bootPromise = null;
  }

  return inst;
}

export async function stopTenantSession(
  tenantId,
  { logout = false, restart = false, syncGlobalQr = false } = {}
) {
  const id = String(tenantId);
  const inst = instances.get(id);
  if (!inst) return { ok: true, message: 'No session running' };

  inst.loggingOut = Boolean(logout);
  if (inst.reconnectTimer) {
    clearTimeout(inst.reconnectTimer);
    inst.reconnectTimer = null;
  }

  const sock = inst.sock;
  if (sock) {
    try {
      if (logout) await sock.logout();
    } catch (err) {
      console.warn(`tenant ${id} logout failed:`, err?.message || err);
    }
    try {
      sock.end?.(undefined);
    } catch {
      // ignore
    }
    inst.sock = null;
  }

  if (logout) {
    try {
      await baileysAuthClearAll(id);
      fs.rmSync(authFolder(id), { recursive: true, force: true });
    } catch (err) {
      console.warn(`tenant ${id} auth clear skipped:`, err?.message || err);
    }
    inst.connectionStatus = 'logged_out';
    inst.qrDataUrl = null;
  } else {
    inst.connectionStatus = 'stopped';
  }

  inst.loggingOut = false;
  if (restart) {
    await sleep(400);
    await startTenantSession(id);
  }
  return { ok: true, message: logout ? 'Logged out. Scan a new QR to reconnect.' : 'Stopped' };
}

export async function sendTenantDemo(tenantId, jid) {
  const sock = getSock(tenantId);
  if (!sock) return { ok: false, error: 'WhatsApp is not connected yet' };
  const tenant = await getTenantById(tenantId);
  const cleanJid = String(jid || '').trim();
  if (!cleanJid.includes('@')) return { ok: false, error: 'Invalid WhatsApp JID' };
  const result = await pushTenantWelcome(sock, cleanJid, tenant);
  return { ok: true, ...result, jid: cleanJid };
}
