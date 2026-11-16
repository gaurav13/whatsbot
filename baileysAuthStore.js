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

function credsLookRegistered(creds) {
  return Boolean(creds?.me?.id || creds?.me?.jid || creds?.registered);
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

  if (fileFolder) {
    try {
      const credsPath = path.join(fileFolder, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        return credsLookRegistered(creds);
      }
    } catch {
      return false;
    }
  }
  return false;
}

export async function loadBaileysAuthState(fileFolder, tenantId = null, { silent = false } = {}) {
  try {
    const pgState = await usePostgresAuthState(tenantId);
    if (pgState) {
      if (!silent) console.log(`🔐 Baileys auth: PostgreSQL tenant=${tenantId || 'legacy'}`);
      return pgState;
    }
  } catch (err) {
    if (!silent) {
      console.warn('Postgres Baileys auth unavailable, using files:', err?.message || err);
    }
  }

  const fileState = await useMultiFileAuthState(fileFolder);
  if (!silent) console.log(`🔐 Baileys auth: local folder ${fileFolder}`);
  return { ...fileState, backend: 'files', clearAuth: null, tenantId };
}
