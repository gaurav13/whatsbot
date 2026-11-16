import dns from 'dns/promises';
import pg from 'pg';
import 'dotenv/config';
import {
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  maskSecret,
  isUnchangedSecret,
} from './tenantCrypto.js';
import {
  normalizeBusinessCategory,
  businessTypeFromCategory,
  assertValidPhone,
  normalizeOptionalEmail,
} from './tenantCatalog.js';

const { Pool } = pg;

function buildDatabaseUrl() {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) return '';

  try {
    // eslint-disable-next-line no-new
    new URL(raw);
    return raw;
  } catch {
    const match = raw.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@([^/]+)(\/.*)?$/);
    if (!match) return raw;
    const [, protocol, user, password, host, pathPart = '/postgres'] = match;
    return `${protocol}${user}:${encodeURIComponent(password)}@${host}${pathPart}`;
  }
}

const connectionString = buildDatabaseUrl();
let poolPromise = null;

async function createPool() {
  if (!connectionString) return null;

  const parsed = new URL(connectionString);
  let host = parsed.hostname;

  try {
    const lookup = await dns.lookup(host, { family: 4 });
    host = lookup.address;
    console.log(`🗄️  Supabase host resolved to IPv4 ${host}`);
  } catch (err) {
    console.warn('IPv4 DNS lookup failed, using hostname as-is:', err.message);
  }

  return new Pool({
    host,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent((parsed.pathname || '/postgres').replace(/^\//, '')) || 'postgres',
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
}

export async function getPool() {
  if (!connectionString) return null;
  if (!poolPromise) poolPromise = createPool();
  return poolPromise;
}

export async function initDatabase() {
  const pool = await getPool();
  if (!pool) {
    console.warn('⚠️  DATABASE_URL not set — website scrape demo DB features disabled');
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_knowledge (
      id BIGSERIAL PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      content TEXT NOT NULL,
      content_length INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS website_knowledge_updated_at_idx
    ON website_knowledge (updated_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id BIGSERIAL PRIMARY KEY,
      jid TEXT,
      phone TEXT,
      provider TEXT,
      model TEXT,
      prompt_token_count INTEGER DEFAULT 0,
      candidates_token_count INTEGER DEFAULT 0,
      total_token_count INTEGER DEFAULT 0,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS token_usage_phone_idx
    ON token_usage (phone, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS token_usage_jid_idx
    ON token_usage (jid, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      jid TEXT PRIMARY KEY,
      phone TEXT,
      tracked BOOLEAN NOT NULL DEFAULT FALSE,
      automation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      vilasa_active BOOLEAN NOT NULL DEFAULT FALSE,
      lead_intake JSONB,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS baileys_auth (
      id TEXT NOT NULL,
      value JSONB NOT NULL,
      tenant_id UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      business_name TEXT NOT NULL,
      business_type TEXT NOT NULL DEFAULT 'it_services',
      gemini_api_key TEXT,
      groq_api_key TEXT,
      token_quota INTEGER NOT NULL DEFAULT 50000,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      is_platform BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
  await pool.query(`ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS billing_source TEXT;`);
  await pool.query(`ALTER TABLE baileys_auth ADD COLUMN IF NOT EXISTS tenant_id UUID;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`
  );
  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');`
  );
  await pool.query(
    `UPDATE tenants SET quota_reset_at = COALESCE(quota_reset_at, created_at, NOW()) WHERE quota_reset_at IS NULL;`
  );
  await pool.query(
    `UPDATE tenants SET plan_expires_at = NULL WHERE is_platform = TRUE;`
  );
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS linked_whatsapp TEXT;`);
  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS message_quota INTEGER NOT NULL DEFAULT 1000;`
  );
  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS messages_used INTEGER NOT NULL DEFAULT 0;`
  );
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_description TEXT;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS knowledge_text TEXT;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS knowledge_file_path TEXT;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alert_phone TEXT;`);
  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'deepseek';`
  );
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_model TEXT;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_api_key TEXT;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_category TEXT;`);
  await pool.query(`ALTER TABLE tenants ALTER COLUMN email DROP NOT NULL;`);
  await pool.query(`
    UPDATE tenants
    SET phone = COALESCE(
      NULLIF(phone, ''),
      NULLIF(regexp_replace(COALESCE(linked_whatsapp, ''), '\\D', '', 'g'), ''),
      'pending-' || substring(id::text, 1, 8)
    )
    WHERE phone IS NULL OR phone = '';
  `);
  await pool.query(`
    UPDATE tenants
    SET business_category = CASE
      WHEN business_type = 'real_estate' THEN 'real_estate'
      ELSE COALESCE(NULLIF(business_category, ''), 'general')
    END
    WHERE business_category IS NULL OR business_category = '';
  `);
  await pool.query(`ALTER TABLE tenants ALTER COLUMN phone SET NOT NULL;`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS tenants_phone_uidx ON tenants (phone);`
  );
  await pool.query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_email_key;`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_uidx ON tenants (email) WHERE email IS NOT NULL AND email <> '';`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_leads (
      id BIGSERIAL PRIMARY KEY,
      tenant_id UUID NOT NULL,
      customer_phone TEXT,
      customer_name TEXT,
      lead_details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS tenant_leads_tenant_idx
    ON tenant_leads (tenant_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id BIGSERIAL PRIMARY KEY,
      tenant_id UUID,
      jid TEXT,
      phone TEXT,
      direction TEXT NOT NULL DEFAULT 'out',
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS message_logs_tenant_idx
    ON message_logs (tenant_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS token_usage_tenant_idx
    ON token_usage (tenant_id, created_at DESC);
  `);

  await migrateBaileysAuthPrimaryKey(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_instance_locks (
      tenant_id UUID PRIMARY KEY,
      instance_id TEXT NOT NULL,
      heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('✅ PostgreSQL ready (tenants, tenant_leads, token_usage, user_sessions, baileys_auth)');
  await ensurePlatformTenant();
  return true;
}

async function migrateBaileysAuthPrimaryKey(pool) {
  await pool.query(`
    DO $$
    DECLARE
      pk_name TEXT;
    BEGIN
      SELECT c.conname INTO pk_name
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'baileys_auth' AND c.contype = 'p'
      LIMIT 1;
      IF pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE baileys_auth DROP CONSTRAINT %I', pk_name);
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS baileys_auth_tenant_key_uidx
    ON baileys_auth (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), id);
  `);
}

export async function upsertWebsiteKnowledge({ url, title, content }) {
  const pool = await getPool();
  if (!pool) throw new Error('Database is not configured (DATABASE_URL missing)');

  const cleaned = String(content || '').trim();
  if (!cleaned) throw new Error('No readable content extracted from URL');

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const contentLength = cleaned.length;

  const result = await pool.query(
    `
    INSERT INTO website_knowledge (url, title, content, content_length, word_count, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (url)
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      content_length = EXCLUDED.content_length,
      word_count = EXCLUDED.word_count,
      updated_at = NOW()
    RETURNING id, url, title, content_length, word_count, created_at, updated_at;
    `,
    [url, title || null, cleaned, contentLength, wordCount]
  );

  return result.rows[0];
}

export async function listWebsiteKnowledge(limit = 20) {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(
    `
    SELECT id, url, title, content_length, word_count, created_at, updated_at,
           LEFT(content, 280) AS preview
    FROM website_knowledge
    ORDER BY updated_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

export async function getLatestWebsiteKnowledge(limit = 3) {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(
    `
    SELECT id, url, title, content, content_length, word_count, updated_at
    FROM website_knowledge
    ORDER BY updated_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

export async function getWebsiteKnowledgeByUrl(url) {
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id, url, title, content, content_length, word_count, updated_at
     FROM website_knowledge WHERE url = $1 LIMIT 1`,
    [url]
  );
  return result.rows[0] || null;
}

export async function buildWebsiteKnowledgeContext(maxChars = 12000) {
  const rows = await getLatestWebsiteKnowledge(5);
  if (!rows.length) return '';

  let used = 0;
  const blocks = [];

  for (const row of rows) {
    const header = `Source: ${row.title || 'Untitled'} (${row.url})`;
    const remaining = maxChars - used - header.length - 20;
    if (remaining <= 200) break;
    const body = String(row.content || '').slice(0, remaining);
    blocks.push(`${header}\n${body}`);
    used += header.length + body.length;
  }

  return blocks.join('\n\n-----\n\n');
}

export function phoneFromJid(jid) {
  const raw = String(jid || '');
  const user = raw.split('@')[0] || '';
  return user.replace(/:\d+$/, '') || null;
}

export async function logTokenUsage({
  jid = null,
  phone = null,
  provider = null,
  model = null,
  promptTokenCount = 0,
  candidatesTokenCount = 0,
  totalTokenCount = 0,
  source = 'whatsapp',
  tenantId = null,
  billingSource = null,
} = {}) {
  const pool = await getPool();
  if (!pool) return null;

  const resolvedPhone = phone || phoneFromJid(jid);
  const result = await pool.query(
    `
    INSERT INTO token_usage
      (jid, phone, provider, model, prompt_token_count, candidates_token_count, total_token_count, source, tenant_id, billing_source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, created_at;
    `,
    [
      jid,
      resolvedPhone,
      provider,
      model,
      Number(promptTokenCount) || 0,
      Number(candidatesTokenCount) || 0,
      Number(totalTokenCount) || 0,
      source,
      tenantId,
      billingSource,
    ]
  );
  return result.rows[0];
}

export async function getTokenUsageSummary({ jid = null, phone = null, tenantId = null } = {}) {
  const pool = await getPool();
  if (!pool) return null;

  const resolvedPhone = phone || phoneFromJid(jid);
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS calls,
      COALESCE(SUM(prompt_token_count), 0)::int AS prompt_tokens,
      COALESCE(SUM(candidates_token_count), 0)::int AS reply_tokens,
      COALESCE(SUM(total_token_count), 0)::int AS total_tokens,
      MAX(created_at) AS last_used_at
    FROM token_usage
    WHERE
      ($3::uuid IS NOT NULL AND tenant_id = $3)
      OR ($3::uuid IS NULL AND (
        ($1::text IS NOT NULL AND jid = $1)
        OR ($2::text IS NOT NULL AND phone = $2)
      ));
    `,
    [jid || null, resolvedPhone || null, tenantId || null]
  );

  return {
    jid: jid || null,
    phone: resolvedPhone || null,
    ...(result.rows[0] || {
      calls: 0,
      prompt_tokens: 0,
      reply_tokens: 0,
      total_tokens: 0,
      last_used_at: null,
    }),
  };
}

export async function upsertUserSession(session) {
  const pool = await getPool();
  if (!pool || !session?.jid) return null;

  await pool.query(
    `
    INSERT INTO user_sessions
      (jid, phone, tracked, automation_enabled, vilasa_active, lead_intake, is_paused, paused_until, last_seen, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW(), NOW())
    ON CONFLICT (jid)
    DO UPDATE SET
      phone = EXCLUDED.phone,
      tracked = EXCLUDED.tracked,
      automation_enabled = EXCLUDED.automation_enabled,
      vilasa_active = EXCLUDED.vilasa_active,
      lead_intake = EXCLUDED.lead_intake,
      is_paused = EXCLUDED.is_paused,
      paused_until = EXCLUDED.paused_until,
      last_seen = NOW(),
      updated_at = NOW();
    `,
    [
      session.jid,
      session.phone || phoneFromJid(session.jid),
      Boolean(session.tracked),
      session.automationEnabled !== false,
      Boolean(session.vilasaActive),
      JSON.stringify(session.leadIntake || null),
      Boolean(session.isPaused),
      session.pausedUntil
        ? new Date(session.pausedUntil).toISOString()
        : null,
    ]
  );
  return true;
}

export async function loadUserSession(jid) {
  const pool = await getPool();
  if (!pool || !jid) return null;
  const result = await pool.query(`SELECT * FROM user_sessions WHERE jid = $1 LIMIT 1`, [jid]);
  return result.rows[0] || null;
}

export async function listTenantIdsWithBaileysCreds() {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(`
    SELECT t.id::text AS tenant_id
    FROM tenants t
    WHERE COALESCE(t.is_active, TRUE) = TRUE
      AND (
        NULLIF(t.linked_whatsapp, '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM baileys_auth a
          WHERE a.tenant_id = t.id AND a.id = 'creds'
        )
      )
  `);
  return result.rows.map((row) => row.tenant_id).filter(Boolean);
}

export async function baileysAuthRead(id, tenantId = null) {
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT value FROM baileys_auth WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2::uuid LIMIT 1`,
    [id, tenantId]
  );
  return result.rows[0]?.value ?? null;
}

export async function baileysAuthWrite(id, value, tenantId = null) {
  const pool = await getPool();
  if (!pool) return false;
  const payload = JSON.stringify(value);
  const updated = await pool.query(
    `UPDATE baileys_auth
     SET value = $2::jsonb, updated_at = NOW()
     WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $3::uuid`,
    [id, payload, tenantId]
  );
  if (updated.rowCount) return true;
  try {
    await pool.query(
      `
      INSERT INTO baileys_auth (id, value, tenant_id, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW());
      `,
      [id, payload, tenantId]
    );
  } catch (err) {
    if (err?.code !== '23505') throw err;
    await pool.query(
      `UPDATE baileys_auth
       SET value = $2::jsonb, updated_at = NOW()
       WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $3::uuid`,
      [id, payload, tenantId]
    );
  }
  return true;
}

export async function tryAcquireWhatsAppLock(tenantId, instanceId, { steal = false } = {}) {
  const pool = await getPool();
  if (!pool || !tenantId || !instanceId) return true;
  if (steal) {
    await pool.query(
      `
      INSERT INTO whatsapp_instance_locks (tenant_id, instance_id, heartbeat_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (tenant_id) DO UPDATE
        SET instance_id = EXCLUDED.instance_id, heartbeat_at = NOW()
      `,
      [tenantId, instanceId]
    );
    return true;
  }
  const result = await pool.query(
    `
    INSERT INTO whatsapp_instance_locks (tenant_id, instance_id, heartbeat_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (tenant_id) DO UPDATE
      SET instance_id = EXCLUDED.instance_id, heartbeat_at = NOW()
      WHERE whatsapp_instance_locks.instance_id = EXCLUDED.instance_id
         OR whatsapp_instance_locks.heartbeat_at < NOW() - INTERVAL '45 seconds'
    RETURNING instance_id
    `,
    [tenantId, instanceId]
  );
  return result.rows[0]?.instance_id === instanceId;
}

export async function heartbeatWhatsAppLock(tenantId, instanceId) {
  const pool = await getPool();
  if (!pool || !tenantId || !instanceId) return;
  await pool.query(
    `UPDATE whatsapp_instance_locks SET heartbeat_at = NOW()
     WHERE tenant_id = $1 AND instance_id = $2`,
    [tenantId, instanceId]
  );
}

export async function releaseWhatsAppLock(tenantId, instanceId) {
  const pool = await getPool();
  if (!pool || !tenantId || !instanceId) return;
  await pool.query(
    `DELETE FROM whatsapp_instance_locks WHERE tenant_id = $1 AND instance_id = $2`,
    [tenantId, instanceId]
  );
}

export async function baileysAuthRemove(id, tenantId = null) {
  const pool = await getPool();
  if (!pool) return false;
  await pool.query(`DELETE FROM baileys_auth WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2::uuid`, [
    id,
    tenantId,
  ]);
  return true;
}

export async function baileysAuthClearAll(tenantId = null) {
  const pool = await getPool();
  if (!pool) return false;
  if (tenantId) {
    await pool.query(`DELETE FROM baileys_auth WHERE tenant_id = $1`, [tenantId]);
  } else {
    await pool.query(`DELETE FROM baileys_auth`);
  }
  return true;
}

function publicTenant(row) {
  if (!row) return null;
  const gemini = decryptSecret(row.gemini_api_key);
  const groq = decryptSecret(row.groq_api_key);
  return {
    id: row.id,
    email: row.email || '',
    phone: row.phone || '',
    business_name: row.business_name,
    business_type: row.business_type,
    business_category: row.business_category || 'general',
    token_quota: row.token_quota,
    tokens_used: row.tokens_used,
    message_quota: Number(row.message_quota) || 1000,
    messages_used: Number(row.messages_used) || 0,
    is_platform: row.is_platform,
    is_active: row.is_active !== false,
    quota_reset_at: row.quota_reset_at || null,
    plan_expires_at: row.plan_expires_at || null,
    linked_whatsapp: row.linked_whatsapp || null,
    created_at: row.created_at,
    business_description: row.business_description || '',
    knowledge_text: row.knowledge_text || '',
    knowledge_file_path: row.knowledge_file_path || null,
    alert_phone: row.alert_phone || '',
    ai_provider: row.ai_provider || 'deepseek',
    ai_model: row.ai_model || '',
    has_gemini_key: Boolean(gemini),
    has_groq_key: Boolean(groq),
    has_custom_api_key: Boolean(decryptSecret(row.custom_api_key)),
    gemini_api_key_masked: maskSecret(gemini),
    groq_api_key_masked: maskSecret(groq),
    custom_api_key_masked: maskSecret(decryptSecret(row.custom_api_key)),
  };
}

export function getTenantSecrets(row) {
  if (!row) {
    return {
      geminiApiKey: null,
      groqApiKey: null,
      customApiKey: null,
    };
  }
  return {
    geminiApiKey: decryptSecret(row.gemini_api_key),
    groqApiKey: decryptSecret(row.groq_api_key),
    customApiKey: decryptSecret(row.custom_api_key),
  };
}

export async function createTenant({
  email,
  phone,
  password,
  businessName,
  businessType = 'it_services',
  businessCategory = null,
  geminiApiKey = null,
  groqApiKey = null,
  tokenQuota = 50000,
  isPlatform = false,
}) {
  const pool = await getPool();
  if (!pool) throw new Error('Database is not configured');

  const name = String(businessName || '').trim();
  if (!name) throw new Error('Business name is required.');
  if (!String(password || '') || String(password).length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const phoneNorm = assertValidPhone(phone);
  const emailNorm = normalizeOptionalEmail(email);
  const category = normalizeBusinessCategory(
    businessCategory || (businessType === 'real_estate' ? 'real_estate' : 'general')
  );
  const type = businessTypeFromCategory(category);

  const result = await pool.query(
    `
    INSERT INTO tenants
      (email, phone, password_hash, business_name, business_type, business_category, gemini_api_key, groq_api_key, token_quota, is_platform, is_active, quota_reset_at, plan_expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, NOW(), $11)
    RETURNING *;
    `,
    [
      emailNorm,
      phoneNorm,
      hashPassword(password),
      name,
      type,
      category,
      encryptSecret(geminiApiKey),
      encryptSecret(groqApiKey),
      Number(tokenQuota) || 50000,
      Boolean(isPlatform),
      Boolean(isPlatform) ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );
  return publicTenant(result.rows[0]);
}

export async function authenticateTenant(identifier, password) {
  const pool = await getPool();
  if (!pool) return null;
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const email = raw.toLowerCase();
  const phone = raw.replace(/\D/g, '');
  const result = await pool.query(
    `
    SELECT * FROM tenants
    WHERE (email IS NOT NULL AND email <> '' AND lower(email) = $1)
       OR ($2 <> '' AND (phone = $2 OR right(regexp_replace(phone, '\\D', '', 'g'), 10) = right($2, 10)))
    LIMIT 1
    `,
    [email, phone]
  );
  const row = result.rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  if (row.is_active === false) return null;
  return { public: publicTenant(row), row };
}

export async function getTenantById(id) {
  const pool = await getPool();
  if (!pool || !id) return null;
  const result = await pool.query(`SELECT * FROM tenants WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

export async function getPublicTenantById(id) {
  return publicTenant(await getTenantById(id));
}

export async function updateTenantSettings(id, patch = {}) {
  const current = await getTenantById(id);
  if (!current) throw new Error('Tenant not found');

  const category =
    patch.business_category !== undefined || patch.businessCategory !== undefined
      ? normalizeBusinessCategory(patch.business_category ?? patch.businessCategory)
      : normalizeBusinessCategory(
          current.business_category ||
            (current.business_type === 'real_estate' ? 'real_estate' : 'general')
        );
  const businessType = businessTypeFromCategory(category);

  const phone =
    patch.phone !== undefined
      ? assertValidPhone(patch.phone)
      : current.phone;
  const email =
    patch.email !== undefined ? normalizeOptionalEmail(patch.email) : current.email;

  const geminiIncoming = patch.geminiApiKey ?? patch.gemini_api_key;
  const groqIncoming = patch.groqApiKey ?? patch.groq_api_key;
  const gemini =
    geminiIncoming === undefined ||
    isUnchangedSecret(geminiIncoming, maskSecret(decryptSecret(current.gemini_api_key)))
      ? current.gemini_api_key
      : encryptSecret(geminiIncoming);
  const groq =
    groqIncoming === undefined ||
    isUnchangedSecret(groqIncoming, maskSecret(decryptSecret(current.groq_api_key)))
      ? current.groq_api_key
      : encryptSecret(groqIncoming);

  const businessName =
    patch.businessName || patch.business_name || current.business_name;

  const alertPhone =
    patch.alertPhone !== undefined || patch.alert_phone !== undefined
      ? String(patch.alertPhone ?? patch.alert_phone ?? '').trim()
      : current.alert_phone;

  const aiProvider =
    patch.ai_provider !== undefined || patch.aiProvider !== undefined
      ? String(patch.ai_provider ?? patch.aiProvider ?? 'deepseek').toLowerCase()
      : current.ai_provider || 'deepseek';
  const aiModel =
    patch.ai_model !== undefined || patch.aiModel !== undefined
      ? String(patch.ai_model ?? patch.aiModel ?? '').trim() || null
      : current.ai_model;

  let customKey = current.custom_api_key;
  if (patch.custom_api_key !== undefined || patch.customApiKey !== undefined) {
    const next = patch.custom_api_key ?? patch.customApiKey;
    const masked = maskSecret(decryptSecret(current.custom_api_key));
    if (!isUnchangedSecret(next, masked)) customKey = encryptSecret(next);
  }

  const pool = await getPool();
  const result = await pool.query(
    `
    UPDATE tenants
    SET business_name = $2,
        business_type = $3,
        business_category = $4,
        phone = $5,
        email = $6,
        gemini_api_key = $7,
        groq_api_key = $8,
        alert_phone = $9,
        ai_provider = $10,
        ai_model = $11,
        custom_api_key = $12
    WHERE id = $1
    RETURNING *;
    `,
    [
      id,
      businessName,
      businessType,
      category,
      phone,
      email,
      gemini,
      groq,
      alertPhone || null,
      aiProvider || 'deepseek',
      aiModel,
      customKey,
    ]
  );
  return publicTenant(result.rows[0]);
}

const MAX_KNOWLEDGE_CHARS = 80_000;

export async function updateTenantKnowledge(id, patch = {}) {
  const current = await getTenantById(id);
  if (!current) throw new Error('Tenant not found');

  const businessDescription =
    patch.businessDescription !== undefined || patch.business_description !== undefined
      ? String(patch.businessDescription ?? patch.business_description ?? '').slice(0, 20_000)
      : current.business_description;

  let knowledgeText = current.knowledge_text;
  if (patch.knowledgeText !== undefined || patch.knowledge_text !== undefined) {
    knowledgeText = String(patch.knowledgeText ?? patch.knowledge_text ?? '').slice(
      0,
      MAX_KNOWLEDGE_CHARS
    );
  }

  const knowledgeFilePath =
    patch.knowledgeFilePath !== undefined || patch.knowledge_file_path !== undefined
      ? patch.knowledgeFilePath ?? patch.knowledge_file_path ?? null
      : current.knowledge_file_path;

  const pool = await getPool();
  const result = await pool.query(
    `
    UPDATE tenants
    SET business_description = $2,
        knowledge_text = $3,
        knowledge_file_path = $4
    WHERE id = $1
    RETURNING *;
    `,
    [id, businessDescription || null, knowledgeText || null, knowledgeFilePath || null]
  );
  return publicTenant(result.rows[0]);
}

export async function setTenantLinkedWhatsapp(tenantId, jid) {
  const pool = await getPool();
  if (!pool || !tenantId) return null;
  await pool.query(`UPDATE tenants SET linked_whatsapp = $2 WHERE id = $1`, [
    tenantId,
    jid || null,
  ]);
}

export async function listTenantsAdmin() {
  const pool = await getPool();
  if (!pool) return [];
  let result;
  try {
    result = await pool.query(`
    SELECT
      t.*,
      COALESCE(u.prompt_tokens, 0)::int AS prompt_tokens,
      COALESCE(u.reply_tokens, 0)::int AS reply_tokens,
      COALESCE(u.total_tokens, 0)::int AS usage_total_tokens,
      COALESCE(u.calls, 0)::int AS usage_calls,
      u.last_used_at
    FROM tenants t
    LEFT JOIN (
      SELECT
        tenant_id,
        SUM(prompt_token_count)::int AS prompt_tokens,
        SUM(candidates_token_count)::int AS reply_tokens,
        SUM(total_token_count)::int AS total_tokens,
        COUNT(*)::int AS calls,
        MAX(created_at) AS last_used_at
      FROM token_usage
      GROUP BY tenant_id
    ) u ON u.tenant_id = t.id
    ORDER BY t.created_at DESC
  `);
  } catch (err) {
    console.error('listTenantsAdmin query failed:', err);
    throw err;
  }

  return result.rows.map((row) => {
    let gemini = null;
    let groq = null;
    let custom = null;
    try {
      gemini = decryptSecret(row.gemini_api_key);
    } catch {
      gemini = null;
    }
    try {
      groq = decryptSecret(row.groq_api_key);
    } catch {
      groq = null;
    }
    try {
      custom = decryptSecret(row.custom_api_key);
    } catch {
      custom = null;
    }
    const quota = Number(row.token_quota) || 0;
    const usedCounter = Number(row.tokens_used) || 0;
    const burned = Number(row.usage_total_tokens) || 0;
    return {
      id: row.id,
      email: row.email,
      phone: row.phone || '',
      business_name: row.business_name,
      business_type: row.business_type,
      business_category: row.business_category || 'general',
      is_platform: row.is_platform,
      is_active: row.is_active !== false,
      quota_reset_at: row.quota_reset_at || null,
      plan_expires_at: row.plan_expires_at || null,
      linked_whatsapp: row.linked_whatsapp || null,
      created_at: row.created_at,
      token_quota: quota,
      tokens_used: usedCounter,
      remaining: Math.max(0, quota - usedCounter),
      message_quota: Number(row.message_quota) || 1000,
      messages_used: Number(row.messages_used) || 0,
      messages_remaining: Math.max(
        0,
        (Number(row.message_quota) || 1000) - (Number(row.messages_used) || 0)
      ),
      api_key_type: gemini || groq || custom ? 'BYOK' : 'MASTER',
      has_gemini_key: Boolean(gemini),
      has_groq_key: Boolean(groq),
      has_custom_api_key: Boolean(custom),
      custom_api_key_masked: maskSecret(custom),
      ai_provider: row.ai_provider || 'deepseek',
      ai_model: row.ai_model || '',
      prompt_tokens: row.prompt_tokens || 0,
      reply_tokens: row.reply_tokens || 0,
      total_tokens: burned,
      usage_calls: row.usage_calls || 0,
      last_used_at: row.last_used_at,
    };
  });
}

function parseTimestamp(value) {
  if (value === null || value === '') return null;
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  return date.toISOString();
}

export function isTenantPlanActive(tenant) {
  if (!tenant) return false;
  if (tenant.is_active === false) return false;
  if (!tenant.plan_expires_at) return true;
  const expires = new Date(tenant.plan_expires_at).getTime();
  if (!Number.isFinite(expires)) return true;
  return Date.now() <= expires;
}

export async function adminUpdateTenant(id, patch = {}) {
  const current = await getTenantById(id);
  if (!current) throw new Error('Tenant not found');
  const pool = await getPool();

  const quota =
    patch.token_quota !== undefined && patch.token_quota !== null && patch.token_quota !== ''
      ? Math.max(0, Number(patch.token_quota))
      : current.token_quota;
  const used =
    patch.tokens_used !== undefined && patch.tokens_used !== null && patch.tokens_used !== ''
      ? Math.max(0, Number(patch.tokens_used))
      : current.tokens_used;
  let isActive =
    patch.is_active === undefined ? current.is_active !== false : Boolean(patch.is_active);
  const messageQuota =
    patch.message_quota !== undefined && patch.message_quota !== null && patch.message_quota !== ''
      ? Math.max(0, Number(patch.message_quota))
      : current.message_quota ?? 1000;
  const messagesUsed =
    patch.messages_used !== undefined && patch.messages_used !== null && patch.messages_used !== ''
      ? Math.max(0, Number(patch.messages_used))
      : current.messages_used ?? 0;

  let planExpiresAt = current.plan_expires_at
    ? new Date(current.plan_expires_at).toISOString()
    : null;
  if (patch.plan_expires_at !== undefined) {
    planExpiresAt = parseTimestamp(patch.plan_expires_at);
  }
  const renewDays = Number(patch.renew_days);
  if (Number.isFinite(renewDays) && renewDays > 0) {
    const base = Math.max(Date.now(), new Date(planExpiresAt || 0).getTime() || 0);
    planExpiresAt = new Date(base + renewDays * 24 * 60 * 60 * 1000).toISOString();
    isActive = true;
  }

  let quotaResetAt = current.quota_reset_at
    ? new Date(current.quota_reset_at).toISOString()
    : new Date().toISOString();
  if (patch.quota_reset_at !== undefined) {
    quotaResetAt = parseTimestamp(patch.quota_reset_at) || new Date().toISOString();
  }

  const aiProvider =
    patch.ai_provider !== undefined
      ? String(patch.ai_provider || 'deepseek').toLowerCase()
      : current.ai_provider || 'deepseek';
  const aiModel =
    patch.ai_model !== undefined ? String(patch.ai_model || '').trim() || null : current.ai_model;
  let customKey = current.custom_api_key;
  if (patch.custom_api_key !== undefined) {
    const masked = maskSecret(decryptSecret(current.custom_api_key));
    if (!isUnchangedSecret(patch.custom_api_key, masked)) {
      customKey = encryptSecret(patch.custom_api_key);
    }
  }

  const result = await pool.query(
    `
    UPDATE tenants
    SET token_quota = $2,
        tokens_used = $3,
        is_active = $4,
        message_quota = $5,
        messages_used = $6,
        plan_expires_at = $7,
        quota_reset_at = $8,
        ai_provider = $9,
        ai_model = $10,
        custom_api_key = $11
    WHERE id = $1
    RETURNING *;
    `,
    [
      id,
      quota,
      used,
      isActive,
      messageQuota,
      messagesUsed,
      planExpiresAt,
      quotaResetAt,
      aiProvider,
      aiModel,
      customKey,
    ]
  );
  return publicTenant(result.rows[0]);
}

export async function deleteTenant(id) {
  const current = await getTenantById(id);
  if (!current) throw new Error('Tenant not found');
  if (current.is_platform) {
    throw new Error('The platform tenant cannot be deleted.');
  }

  const pool = await getPool();
  if (!pool) throw new Error('Database is not configured');

  for (const sql of [
    `DELETE FROM tenant_leads WHERE tenant_id = $1`,
    `DELETE FROM message_logs WHERE tenant_id = $1`,
    `DELETE FROM token_usage WHERE tenant_id = $1`,
    `DELETE FROM baileys_auth WHERE tenant_id = $1`,
  ]) {
    try {
      await pool.query(sql, [id]);
    } catch (err) {
      console.warn('deleteTenant related cleanup skipped:', err?.message || err);
    }
  }
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);

  return { ok: true, id, business_name: current.business_name };
}

export async function expireOverduePlans() {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(`
    UPDATE tenants
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND COALESCE(is_platform, FALSE) = FALSE
      AND plan_expires_at IS NOT NULL
      AND plan_expires_at < NOW()
    RETURNING id, email, business_name, plan_expires_at
  `);
  return result.rows;
}

export async function resetDueMonthlyQuotas() {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(`
    UPDATE tenants
    SET messages_used = 0,
        tokens_used = 0,
        quota_reset_at = NOW()
    WHERE is_active = TRUE
      AND COALESCE(quota_reset_at, created_at, NOW()) <= NOW() - INTERVAL '30 days'
      AND (plan_expires_at IS NULL OR plan_expires_at > NOW())
    RETURNING id, email, business_name, quota_reset_at
  `);
  return result.rows;
}

export class MessageQuotaExceededError extends Error {
  constructor(quota, used) {
    super(
      'Your monthly message quota has been exhausted. Please contact support to upgrade your plan.'
    );
    this.name = 'MessageQuotaExceededError';
    this.quota = quota;
    this.used = used;
  }
}

export function isMessageQuotaExceeded(tenant) {
  if (!tenant?.id) return false;
  const used = Number(tenant.messages_used) || 0;
  const quota = Number(tenant.message_quota);
  if (!Number.isFinite(quota)) return false;
  return used >= quota;
}

export async function recordTenantMessage({
  tenantId,
  jid = null,
  source = 'whatsapp',
} = {}) {
  const pool = await getPool();
  if (!pool || !tenantId) return null;

  await pool.query(
    `
    INSERT INTO message_logs (tenant_id, jid, phone, direction, source)
    VALUES ($1, $2, $3, 'turn', $4)
    `,
    [tenantId, jid, phoneFromJid(jid), source]
  );

  const result = await pool.query(
    `
    UPDATE tenants
    SET messages_used = COALESCE(messages_used, 0) + 1
    WHERE id = $1
    RETURNING messages_used, message_quota;
    `,
    [tenantId]
  );
  return result.rows[0] || null;
}

export async function incrementTenantTokens(tenantId, amount) {
  const pool = await getPool();
  if (!pool || !tenantId) return null;
  const add = Math.max(0, Number(amount) || 0);
  const result = await pool.query(
    `
    UPDATE tenants
    SET tokens_used = tokens_used + $2
    WHERE id = $1
    RETURNING tokens_used, token_quota;
    `,
    [tenantId, add]
  );
  return result.rows[0] || null;
}

export async function insertTenantLead({
  tenantId,
  customerPhone = null,
  customerName = null,
  leadDetails = null,
}) {
  const pool = await getPool();
  if (!pool || !tenantId) return null;
  const result = await pool.query(
    `
    INSERT INTO tenant_leads (tenant_id, customer_phone, customer_name, lead_details)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING *;
    `,
    [
      tenantId,
      customerPhone ? String(customerPhone).trim() : null,
      customerName ? String(customerName).trim() : null,
      JSON.stringify(leadDetails || {}),
    ]
  );
  return result.rows[0] || null;
}

export async function listTenantLeads(tenantId, { limit = 200 } = {}) {
  const pool = await getPool();
  if (!pool || !tenantId) return [];
  const result = await pool.query(
    `
    SELECT id, tenant_id, customer_phone, customer_name, lead_details, created_at
    FROM tenant_leads
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [tenantId, Math.min(Number(limit) || 200, 2000)]
  );
  return result.rows;
}

export async function findRecentTenantLead({ tenantId, customerPhone, withinHours = 6 }) {
  const pool = await getPool();
  if (!pool || !tenantId || !customerPhone) return null;
  const result = await pool.query(
    `
    SELECT * FROM tenant_leads
    WHERE tenant_id = $1
      AND customer_phone = $2
      AND created_at > NOW() - ($3::int * INTERVAL '1 hour')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [tenantId, String(customerPhone).trim(), Number(withinHours) || 6]
  );
  return result.rows[0] || null;
}

export async function syncPlatformTenantDemoMode(profileId) {
  const pool = await getPool();
  if (!pool) return null;
  const vilasa = String(profileId || '') === 'vilasa';
  const result = await pool.query(
    `
    UPDATE tenants
    SET business_type = $1,
        business_category = $2
    WHERE is_platform = TRUE
    RETURNING id, business_name, business_type, business_category
    `,
    [vilasa ? 'real_estate' : 'it_services', vilasa ? 'real_estate' : 'it_software']
  );
  return result.rows[0] || null;
}

export async function ensurePlatformTenant() {
  const pool = await getPool();
  if (!pool) return null;
  const existing = await pool.query(
    `SELECT * FROM tenants WHERE is_platform = TRUE ORDER BY created_at ASC LIMIT 1`
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE baileys_auth SET tenant_id = $1 WHERE tenant_id IS NULL`,
      [existing.rows[0].id]
    );
    return publicTenant(existing.rows[0]);
  }

  const email = (process.env.PLATFORM_TENANT_EMAIL || 'platform@gsaisolutions.online').toLowerCase();
  const password = process.env.PLATFORM_TENANT_PASSWORD || 'change-me-platform';
  const created = await createTenant({
    email,
    phone: process.env.PLATFORM_TENANT_PHONE || '910000000000',
    password,
    businessName: process.env.PLATFORM_BUSINESS_NAME || 'GS AI Platform',
    businessType: 'it_services',
    businessCategory: 'it_software',
    tokenQuota: Number(process.env.PLATFORM_TOKEN_QUOTA) || 1000000,
    isPlatform: true,
  });
  console.log(`🏢 Platform tenant ready: ${created.email}`);
  return created;
}

export class QuotaExceededError extends Error {
  constructor(quota, used) {
    super(`Platform token quota reached (${used}/${quota}). Add your own Gemini API key to continue.`);
    this.name = 'QuotaExceededError';
    this.quota = quota;
    this.used = used;
  }
}

