-- Run in Supabase SQL Editor (also auto-created by initDatabase)

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

CREATE INDEX IF NOT EXISTS token_usage_phone_idx
  ON token_usage (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS token_usage_jid_idx
  ON token_usage (jid, created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
  jid TEXT PRIMARY KEY,
  phone TEXT,
  tracked BOOLEAN NOT NULL DEFAULT FALSE,
  automation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vilasa_active BOOLEAN NOT NULL DEFAULT FALSE,
  lead_intake JSONB,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_until TIMESTAMPTZ,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS baileys_auth (
  id TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
