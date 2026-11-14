import dns from 'dns/promises';
import pg from 'pg';
import 'dotenv/config';

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

  console.log('✅ PostgreSQL ready (website_knowledge)');
  return true;
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
