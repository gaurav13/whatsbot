import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  admin: {
    username: 'admin',
    password: 'securepassword123',
  },
  sessionSecret: 'gs-ai-change-this-session-secret',
};

export function loadAppConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      return structuredClone(DEFAULT_CONFIG);
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      admin: {
        ...DEFAULT_CONFIG.admin,
        ...(raw.admin || {}),
      },
    };
  } catch (err) {
    console.error('Failed to read config.json:', err.message);
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function validateAdminCredentials(username, password) {
  const cfg = loadAppConfig();
  const expectedUser = String(cfg.admin?.username || '');
  const expectedPass = String(cfg.admin?.password || '');
  return (
    String(username || '') === expectedUser &&
    String(password || '') === expectedPass &&
    expectedUser.length > 0 &&
    expectedPass.length > 0
  );
}

export function getSessionSecret() {
  return process.env.SESSION_SECRET || loadAppConfig().sessionSecret || DEFAULT_CONFIG.sessionSecret;
}
