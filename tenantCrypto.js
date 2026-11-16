import crypto from 'crypto';
import { getSessionSecret } from './authConfig.js';

const SCRYPT_KEYLEN = 32;

function keyMaterial() {
  return crypto.scryptSync(getSessionSecret(), 'wbot-tenant-keys', SCRYPT_KEYLEN);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  const prev = Buffer.from(hash, 'hex');
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(next, prev);
}

export function encryptSecret(plain) {
  const value = String(plain || '').trim();
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload) {
  const raw = String(payload || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('v1:')) return raw;
  const [, ivHex, tagHex, dataHex] = raw.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyMaterial(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const out = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return out.toString('utf8');
}

export { redactSecrets } from './whatsappSend.js';

export function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '********';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

/** True when the client sent a blank/masked placeholder instead of a new key. */
export function isUnchangedSecret(value, currentMasked = '') {
  const v = String(value ?? '').trim();
  if (!v) return true;
  if (/^[•\u2022\u25CF*·∙.…]{6,}$/u.test(v)) return true;
  if (/…/.test(v) || /\.{3}/.test(v)) return true;
  const masked = String(currentMasked || '').trim();
  if (masked && v === masked) return true;
  return false;
}
