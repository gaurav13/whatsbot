import fs from 'fs';
import path from 'path';
import {
  initAuthCreds,
  BufferJSON,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import {
  getPool,
  baileysAuthRead,
  baileysAuthWrite,
  baileysAuthRemove,
  baileysAuthClearAll,
} from './db.js';

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize(value) {
  if (value == null) return null;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return JSON.parse(raw, BufferJSON.reviver);
}

/**
 * Store the bot's single WhatsApp device credentials in Postgres
 * instead of a folder of JSON files. Falls back to multi-file auth
 * when DATABASE_URL is not configured.
 */
export async function usePostgresAuthState(tenantId = null) {
  const pool = await getPool();
  if (!pool) return null;

  const writeData = async (data, id) => {
    await baileysAuthWrite(id, serialize(data), tenantId);
  };

  const readData = async (id) => {
    try {
      const value = await baileysAuthRead(id, tenantId);
      return deserialize(value);
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await baileysAuthRemove(id, tenantId);
    } catch {
      // ignore
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => writeData(creds, 'creds'),
    clearAuth: () => baileysAuthClearAll(tenantId),
    backend: 'postgres',
    tenantId,
  };
}

function bufferLen(value) {
  if (!value) return 0;
  if (Buffer.isBuffer(value)) return value.length;
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return value.data.length;
  if (typeof value === 'string') {
    try {
      return Buffer.from(value, 'base64').length;
    } catch {
      return value.length;
    }
  }
  return 0;
}

function credsKeysLookValid(creds) {
  if (!creds || typeof creds !== 'object') return false;
  const priv = creds.noiseKey?.private;
  if (priv == null) return true;
  const len = bufferLen(priv);
  return len === 32 || len === 64;
}

function credsLookRegistered(creds) {
  if (!creds || typeof creds !== 'object') return false;
  if (!credsKeysLookValid(creds)) return false;
  const me = creds.me || {};
  if (me.id || me.jid || me.user || me.lid) return true;
  if (creds.registered === true) return true;
  try {
    return /@s\.whatsapp\.net|@lid/.test(JSON.stringify(me));
  } catch {
    return false;
  }
}

function folderCredsLookRegistered(fileFolder) {
  try {
    const credsPath = path.join(fileFolder, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return credsLookRegistered(creds);
  } catch {
    return false;
  }
}

async function importFileAuthFolder(tenantId, folder) {
  if (!tenantId || !folder || !fs.existsSync(folder)) return 0;
  let imported = 0;
  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(folder, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
      const raw = JSON.parse(fs.readFileSync(full, 'utf8'), BufferJSON.reviver);
      await baileysAuthWrite(name.replace(/\.json$/i, ''), serialize(raw), tenantId);
      imported += 1;
    } catch {
      // skip unreadable keys
    }
  }
  return imported;
}

export async function tenantHasRegisteredAuth(tenantId, fileFolder = null) {
  try {
    const value = await baileysAuthRead('creds', tenantId);
    if (value) {
      const creds = deserialize(value);
      if (credsLookRegistered(creds)) return true;
    }
  } catch {
    // fall through to files
  }

  if (fileFolder) return folderCredsLookRegistered(fileFolder);
  return false;
}

export async function loadBaileysAuthState(
  fileFolder,
  tenantId = null,
  { silent = false, fallbackFolder = null } = {}
) {
  let pgState = null;
  try {
    pgState = await usePostgresAuthState(tenantId);
  } catch (err) {
    if (!silent) {
      console.warn('Postgres Baileys auth unavailable, using files:', err?.message || err);
    }
  }

  if (pgState && credsLookRegistered(pgState.state.creds)) {
    if (!silent) console.log(`🔐 Baileys auth: PostgreSQL tenant=${tenantId || 'legacy'}`);
    return pgState;
  }

  if (pgState && pgState.state?.creds && !credsKeysLookValid(pgState.state.creds)) {
    try {
      await baileysAuthClearAll(tenantId);
    } catch {
      // ignore
    }
    pgState = null;
  }

  const candidates = [...new Set([fileFolder, fallbackFolder].filter(Boolean))];
  for (const folder of candidates) {
    if (!folderCredsLookRegistered(folder)) continue;
    if (tenantId) {
      try {
        const imported = await importFileAuthFolder(tenantId, folder);
        const seeded = await usePostgresAuthState(tenantId);
        if (seeded && credsLookRegistered(seeded.state.creds)) {
          if (!silent) {
            console.log(
              `🔐 Baileys auth: imported ${imported} disk keys into PostgreSQL tenant=${tenantId}`
            );
          }
          return seeded;
        }
      } catch (err) {
        if (!silent) {
          console.warn('Auth import to Postgres skipped:', err?.message || err);
        }
      }
    }
    const fileState = await useMultiFileAuthState(folder);
    if (!silent) console.log(`🔐 Baileys auth: local folder ${folder}`);
    return { ...fileState, backend: 'files', clearAuth: null, tenantId };
  }

  if (pgState) {
    if (!silent) console.log(`🔐 Baileys auth: PostgreSQL tenant=${tenantId || 'legacy'} (new session)`);
    return pgState;
  }

  const fileState = await useMultiFileAuthState(fileFolder);
  if (!silent) console.log(`🔐 Baileys auth: local folder ${fileFolder}`);
  return { ...fileState, backend: 'files', clearAuth: null, tenantId };
}
