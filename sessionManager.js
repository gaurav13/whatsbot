import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { loadBaileysAuthState, tenantHasRegisteredAuth } from './baileysAuthStore.js';
import {
  getTenantById,
  baileysAuthClearAll,
  setTenantLinkedWhatsapp,
  isTenantPlanActive,
  listTenantIdsWithBaileysCreds,
  ensurePlatformTenant,
  tryAcquireWhatsAppLock,
  heartbeatWhatsAppLock,
  releaseWhatsAppLock,
  clearStaleWhatsAppLocks,
  claimHostRuntime,
  heartbeatHostRuntime,
} from './db.js';
import { attachWhatsAppHandler, pushTenantWelcome } from './whatsappHandler.js';
import { setQr, clearQr, setConnectionStatus } from './qrState.js';
import { redactSecrets } from './whatsappSend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baileysLogger = pino({ level: 'silent' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const WA_HOSTNAME = os.hostname();
/** Stable across PM2 restarts of the same app (no random suffix, no pid). */
export const WA_INSTANCE_ID =
  process.env.WA_INSTANCE_ID ||
  `${WA_HOSTNAME}:pm2-${process.env.pm_id || process.env.NODE_APP_INSTANCE || '0'}`;

let hostHeartbeatTimer = null;
let ownsHostRuntime = false;

function stopHeartbeat(inst) {
  if (inst?.heartbeatTimer) {
    clearInterval(inst.heartbeatTimer);
    inst.heartbeatTimer = null;
  }
}

/** @type {Map<string, object>} */
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
    generation: 0,
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

async function disposeSocket(sock) {
  if (!sock) return;
  try {
    sock.ev?.removeAllListeners?.();
  } catch {
    // ignore
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1200);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      sock.ws?.once?.('close', done);
      sock.end?.(undefined);
    } catch {
      done();
    }
  });
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
    return publicQrPayload({
      connectionStatus: 'stopped',
      hasQr: false,
      qrDataUrl: null,
      lastUpdated: null,
    });
  }
  return publicQrPayload({
    connectionStatus: inst.connectionStatus,
    hasQr: Boolean(inst.qrDataUrl),
    qrDataUrl: inst.qrDataUrl,
    lastUpdated: inst.lastUpdated,
    linkedJid: inst.linkedJid || inst.sock?.user?.id || null,
  });
}

export function publicQrPayload(state = {}) {
  const connectionStatus = state.connectionStatus || 'stopped';
  const hasQr = Boolean(state.qrDataUrl);
  const connected = connectionStatus === 'connected';
  const scanning =
    hasQr || connectionStatus === 'waiting_for_scan' || connectionStatus === 'needs_scan';
  const connecting = ['connecting', 'starting', 'reconnecting'].includes(connectionStatus);
  let displayStatus = connectionStatus;
  if (connected) displayStatus = 'Connected';
  else if (scanning) displayStatus = 'Scanning QR';
  else if (connectionStatus === 'logging_out') displayStatus = 'Disconnecting…';
  else if (connecting) displayStatus = 'Connecting…';
  else if (['logged_out', 'stopped'].includes(connectionStatus)) displayStatus = 'Disconnected';
  else if (connectionStatus === 'disabled') displayStatus = 'Disabled';
  else if (connectionStatus === 'conflict')
    displayStatus = 'Session conflict — Reset & re-link this number';
  return {
    ...state,
    connectionStatus,
    hasQr,
    connected,
    scanning,
    displayStatus,
  };
}

export function ensureTenantSessionForUi(
  tenantId,
  { syncGlobalQr = false, forceQr = false, stealLock = false } = {}
) {
  const id = String(tenantId || '');
  if (!id) return publicQrPayload({ connectionStatus: 'stopped' });

  let inst = instances.get(id);
  if (!inst) {
    inst = blankInstance(id);
    instances.set(id, inst);
  }
  inst.allowQr = true;
  inst.silent = false;
  if (syncGlobalQr) inst.syncGlobalQr = true;

  if (forceQr) {
    resetTenantWhatsAppSession(id, { syncGlobalQr: Boolean(inst.syncGlobalQr) }).catch((err) =>
      console.warn('QR relink failed:', redactSecrets(err))
    );
    return getTenantQrState(id);
  }

  if (inst.connectionStatus === 'conflict' && !stealLock) {
    return getTenantQrState(id);
  }

  if (inst.connectionStatus === 'connected' && inst.sock) {
    inst.qrDataUrl = null;
    if (inst.syncGlobalQr) clearQr('connected');
    return getTenantQrState(id);
  }

  if (inst.qrDataUrl) {
    if (inst.syncGlobalQr) setQr('ui', inst.qrDataUrl);
    return getTenantQrState(id);
  }

  if (inst.bootPromise) return getTenantQrState(id);

  const shouldStart = !inst.reconnectTimer && !inst.sock;

  if (shouldStart) {
    startTenantSession(id, {
      allowQr: true,
      silent: false,
      syncGlobalQr: Boolean(inst.syncGlobalQr),
      stealLock: Boolean(stealLock),
    }).catch((err) => console.warn('QR session start failed:', redactSecrets(err)));
  }

  return getTenantQrState(id);
}

export function getSock(tenantId) {
  return instances.get(String(tenantId))?.sock || null;
}

export async function startTenantSession(
  tenantId,
  { syncGlobalQr = false, allowQr = true, silent = false, stealLock = false } = {}
) {
  const id = String(tenantId);
  let inst = instances.get(id);
  if (!inst) {
    inst = blankInstance(id);
    instances.set(id, inst);
  }
  inst.syncGlobalQr = Boolean(syncGlobalQr);
  inst.allowQr = allowQr !== false;
  inst.silent = Boolean(silent);
  if (inst.bootPromise) return inst.bootPromise;

  inst.bootPromise = (async () => {
    const generation = (inst.generation || 0) + 1;
    inst.generation = generation;
    let settle;
    const settled = new Promise((resolve) => {
      settle = () => resolve(inst);
    });

    try {
      if (inst.reconnectTimer) {
        clearTimeout(inst.reconnectTimer);
        inst.reconnectTimer = null;
      }
      stopHeartbeat(inst);
      const previous = inst.sock;
      inst.sock = null;
      await disposeSocket(previous);

      const tenant = await getTenantById(id);
      if (tenant && !isTenantPlanActive(tenant)) {
        inst.connectionStatus = 'disabled';
        settle();
        return inst;
      }
      const gotLock = await tryAcquireWhatsAppLock(id, WA_INSTANCE_ID, {
        steal: stealLock || ownsHostRuntime,
      });
      if (!gotLock) {
        inst.connectionStatus = 'conflict';
        console.warn(
          `⏸️ Tenant ${id} WhatsApp lock is held by another live process — not connecting here`
        );
        settle();
        return inst;
      }
      const folder = authFolder(id);
      fs.mkdirSync(folder, { recursive: true });
      const legacyRoot = path.join(__dirname, 'baileys_auth_info');
      const auth = await loadBaileysAuthState(folder, id, {
        silent: inst.silent,
        fallbackFolder: tenant?.is_platform ? legacyRoot : null,
      });

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
      if (inst.syncGlobalQr) setConnectionStatus('connecting');

      const isCurrent = () => inst.generation === generation && inst.sock === sock;

      sock.ev.on('creds.update', auth.saveCreds);

      sock.ev.on('connection.update', async (update) => {
        if (!isCurrent()) return;
        try {
          const { connection, lastDisconnect, qr } = update;
          if (qr) {
            if (!inst.allowQr) {
              inst.skipReconnect = true;
              inst.qrDataUrl = null;
              inst.connectionStatus = 'needs_scan';
              inst.lastUpdated = new Date().toISOString();
              console.log(
                `♻️ Tenant ${id} is not linked anymore — open /dashboard and click Start to scan a new QR`
              );
              await disposeSocket(sock);
              if (isCurrent()) inst.sock = null;
              settle();
              return;
            }
            if (!inst.silent) {
              console.log(`📷 Tenant ${id} — scan WhatsApp QR at /dashboard`);
            }
            if (inst.syncGlobalQr && !inst.silent) {
              qrcodeTerminal.generate(qr, { small: true });
            }
            try {
              inst.qrDataUrl = await QRCode.toDataURL(qr, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 320,
              });
              inst.connectionStatus = 'waiting_for_scan';
              inst.lastUpdated = new Date().toISOString();
              if (inst.syncGlobalQr) setQr(qr, inst.qrDataUrl);
            } catch (err) {
              console.error('QR render failed:', err?.message || err);
            }
            settle();
          }

          if (connection === 'connecting' && isCurrent()) {
            inst.connectionStatus = 'connecting';
            if (inst.syncGlobalQr) setConnectionStatus('connecting');
          }

          if (connection === 'close') {
            if (inst.loggingOut) {
              inst.connectionStatus = 'logging_out';
              inst.qrDataUrl = null;
              settle();
              return;
            }
            if (inst.skipReconnect) {
              inst.skipReconnect = false;
              inst.connectionStatus = 'needs_scan';
              inst.qrDataUrl = null;
              if (isCurrent()) inst.sock = null;
              settle();
              return;
            }
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errMsg = String(lastDisconnect?.error?.message || '');
            const loggedOut = statusCode === DisconnectReason.loggedOut;
            const replaced =
              statusCode === DisconnectReason.connectionReplaced || /conflict|replaced/i.test(errMsg);
            const badSession =
              statusCode === DisconnectReason.badSession ||
              /bad session|Stream Errored \(ack\)/i.test(errMsg);
            const corruptAuth = /Incorrect private key length|not-authorized/i.test(errMsg);
            inst.qrDataUrl = null;
            inst.lastUpdated = new Date().toISOString();
            if (inst.syncGlobalQr) clearQr(inst.connectionStatus);
            stopHeartbeat(inst);
            if (isCurrent()) inst.sock = null;
            console.warn(
              `🔌 Tenant ${id} disconnected (${disconnectLabel(statusCode)})` +
                (lastDisconnect?.error?.message
                  ? ` — ${redactSecrets(lastDisconnect.error.message)}`
                  : '')
            );

            if (loggedOut || corruptAuth || badSession) {
              try {
                await baileysAuthClearAll(id);
                fs.rmSync(authFolder(id), { recursive: true, force: true });
                await setTenantLinkedWhatsapp(id, null);
              } catch {
                // ignore
              }
              inst.connectionStatus = 'logged_out';
              inst.allowQr = true;
              inst.silent = false;
              console.warn(`🔐 Tenant ${id} session cleared — scan a fresh QR to re-link`);
              if (!loggedOut) {
                inst.reconnectTimer = setTimeout(() => {
                  inst.reconnectTimer = null;
                  startTenantSession(id, {
                    syncGlobalQr: inst.syncGlobalQr,
                    allowQr: true,
                    silent: false,
                    stealLock: true,
                  }).catch((err) =>
                    console.error(`QR restart failed for tenant ${id}:`, redactSecrets(err))
                  );
                }, 800);
              }
              settle();
              return;
            }

            if (replaced) {
              if (ownsHostRuntime) {
                inst.selfReplaceCount = (inst.selfReplaceCount || 0) + 1;
                if (inst.selfReplaceCount >= 3) {
                  console.warn(
                    `🧹 Tenant ${id}: repeated self-replace — wiping keys so a fresh QR can be scanned`
                  );
                  settle();
                  resetTenantWhatsAppSession(id, { syncGlobalQr: inst.syncGlobalQr }).catch(() => {});
                  return;
                }
                inst.connectionStatus = 'reconnecting';
                console.warn(
                  `⚠️ Tenant ${id}: WhatsApp replaced this socket (often a second makeWASocket in this process). Reconnecting after a pause.`
                );
                inst.reconnectTimer = setTimeout(() => {
                  inst.reconnectTimer = null;
                  startTenantSession(id, {
                    syncGlobalQr: inst.syncGlobalQr,
                    allowQr: inst.allowQr,
                    silent: inst.silent,
                    stealLock: true,
                  }).catch(() => {});
                }, 4000);
              } else {
                inst.connectionStatus = 'conflict';
                releaseWhatsAppLock(id, WA_INSTANCE_ID).catch(() => {});
                console.warn(
                  `⚠️ Tenant ${id}: another live process owns this number. Use Reset Session on Super Admin if this host should take over.`
                );
              }
              settle();
              return;
            }

            inst.connectionStatus = 'reconnecting';
            if (inst.reconnectTimer) clearTimeout(inst.reconnectTimer);
            const delay = reconnectDelayMs(inst.reconnectAttempt++);
            inst.reconnectTimer = setTimeout(async () => {
              inst.reconnectTimer = null;
              try {
                const live = await getTenantById(id);
                if (live && !isTenantPlanActive(live)) {
                  inst.connectionStatus = 'disabled';
                  return;
                }
                await startTenantSession(id, {
                  syncGlobalQr: inst.syncGlobalQr,
                  allowQr: inst.allowQr,
                  silent: inst.silent,
                  stealLock: true,
                });
              } catch (err) {
                console.error(`Reconnect failed for tenant ${id}:`, redactSecrets(err));
              }
            }, delay);
            settle();
          } else if (connection === 'open') {
            inst.reconnectAttempt = 0;
            inst.selfReplaceCount = 0;
            inst.qrDataUrl = null;
            inst.connectionStatus = 'connected';
            stopHeartbeat(inst);
            inst.heartbeatTimer = setInterval(() => {
              heartbeatWhatsAppLock(id, WA_INSTANCE_ID).catch(() => {});
            }, 10_000);
            inst.lastUpdated = new Date().toISOString();
            inst.linkedJid = sock.user?.id || sock.user?.jid || null;
            if (inst.linkedJid) {
              setTenantLinkedWhatsapp(id, inst.linkedJid).catch(() => {});
            }
            if (inst.syncGlobalQr) clearQr('connected');
            console.log(`✅ WhatsApp connected for tenant ${id} (${tenant?.business_name || 'n/a'})`);
            settle();
          }
        } catch (err) {
          console.warn(`connection.update error tenant ${id}:`, redactSecrets(err));
          settle();
        }
      });

      attachWhatsAppHandler(sock, {
        tenant,
        getTenant: () => getTenantById(id),
      });

      await Promise.race([settled, sleep(35_000)]);
    } catch (err) {
      inst.sock = null;
      inst.connectionStatus = 'reconnecting';
      console.error(`startTenantSession failed ${id}:`, redactSecrets(err));
      try {
        settle();
      } catch {
        // ignore
      }
      const delay = reconnectDelayMs(inst.reconnectAttempt++);
      if (inst.reconnectTimer) clearTimeout(inst.reconnectTimer);
      inst.reconnectTimer = setTimeout(() => {
        inst.reconnectTimer = null;
        startTenantSession(id, {
          syncGlobalQr: inst.syncGlobalQr,
          allowQr: inst.allowQr,
          silent: inst.silent,
          stealLock: true,
        }).catch((e) => console.error(`Reconnect failed for tenant ${id}:`, redactSecrets(e)));
      }, delay);
    }
    return inst;
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

  inst.generation = (inst.generation || 0) + 1;
  inst.loggingOut = Boolean(logout);
  stopHeartbeat(inst);
  if (inst.reconnectTimer) {
    clearTimeout(inst.reconnectTimer);
    inst.reconnectTimer = null;
  }
  if (!restart) {
    await releaseWhatsAppLock(id, WA_INSTANCE_ID).catch(() => {});
  }

  const sock = inst.sock;
  inst.sock = null;
  await disposeSocket(sock);

  if (logout) {
    try {
      await baileysAuthClearAll(id);
      fs.rmSync(authFolder(id), { recursive: true, force: true });
      await setTenantLinkedWhatsapp(id, null);
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
    await startTenantSession(id, {
      allowQr: true,
      silent: false,
      syncGlobalQr: Boolean(syncGlobalQr),
      stealLock: true,
    });
  }
  return { ok: true, message: logout ? 'Logged out. Scan a new QR to reconnect.' : 'Stopped' };
}

/** Wipe corrupt Baileys keys and show a fresh QR for this tenant only. */
export async function resetTenantWhatsAppSession(tenantId, { syncGlobalQr = false } = {}) {
  const id = String(tenantId);
  console.log(`🧹 Reset WhatsApp session for tenant ${id}`);
  await stopTenantSession(id, { logout: true, restart: false, syncGlobalQr });
  await tryAcquireWhatsAppLock(id, WA_INSTANCE_ID, { steal: true });
  return startTenantSession(id, {
    allowQr: true,
    silent: false,
    syncGlobalQr,
    stealLock: true,
  });
}

export async function restoreAuthenticatedSessions() {
  if (process.env.NODE_APP_INSTANCE && String(process.env.NODE_APP_INSTANCE) !== '0') {
    console.warn('⏸️ Cluster worker is not instance 0 — skipping WhatsApp sockets');
    return { restored: 0 };
  }

  await clearStaleWhatsAppLocks({ hostname: WA_HOSTNAME, maxAgeSeconds: 20 }).catch(() => {});
  ownsHostRuntime = await claimHostRuntime(WA_HOSTNAME, WA_INSTANCE_ID, process.pid).catch(
    () => true
  );
  if (!ownsHostRuntime) {
    return { restored: 0 };
  }
  if (hostHeartbeatTimer) clearInterval(hostHeartbeatTimer);
  hostHeartbeatTimer = setInterval(() => {
    heartbeatHostRuntime(WA_HOSTNAME, WA_INSTANCE_ID).catch(() => {});
  }, 10_000);

  const fromDb = await listTenantIdsWithBaileysCreds().catch(() => []);
  const fromDisk = [];
  const root = path.join(__dirname, 'baileys_auth_info');
  try {
    if (fs.existsSync(root)) {
      for (const name of fs.readdirSync(root)) {
        const folder = path.join(root, name);
        if (fs.statSync(folder).isDirectory()) fromDisk.push(name);
      }
    }
  } catch {
    // ignore
  }

  const platform = await ensurePlatformTenant().catch(() => null);
  const ids = [...new Set([...fromDb, ...fromDisk, platform?.id].filter(Boolean))];
  const restore = [];
  for (const id of ids) {
    const tenant = await getTenantById(id).catch(() => null);
    const ok =
      (await tenantHasRegisteredAuth(id, authFolder(id))) ||
      (tenant?.is_platform &&
        (await tenantHasRegisteredAuth(id, path.join(__dirname, 'baileys_auth_info'))));
    if (ok || tenant?.linked_whatsapp) restore.push(id);
    else console.log(`♻️ Skip restore ${id} (no registered WhatsApp creds yet)`);
  }

  if (!restore.length) {
    console.log(
      '♻️ No linked WhatsApp sessions found. Click Start / refresh QR on /dashboard to connect a number.'
    );
    return { restored: 0 };
  }

  console.log(`♻️ Restoring ${restore.length} saved WhatsApp session(s) in the background…`);
  for (const id of restore) {
    startTenantSession(id, { allowQr: false, silent: true, stealLock: true }).catch((err) =>
      console.warn(`Silent restore skipped for ${id}:`, redactSecrets(err))
    );
    await sleep(1500);
  }
  return { restored: restore.length };
}

export async function destroyTenantRuntime(tenantId) {
  const id = String(tenantId);
  try {
    await stopTenantSession(id, { logout: true, restart: false });
  } catch (err) {
    console.warn(`destroyTenantRuntime stop skipped:`, err?.message || err);
  }
  instances.delete(id);
  try {
    fs.rmSync(authFolder(id), { recursive: true, force: true });
  } catch {
    // ignore
  }
  return { ok: true };
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
