-- Multi-tenant SaaS schema (also auto-created by initDatabase)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
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

ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS billing_source TEXT;
ALTER TABLE baileys_auth ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS message_quota INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS messages_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS knowledge_text TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS knowledge_file_path TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alert_phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'deepseek';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_api_key TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_category TEXT;
ALTER TABLE tenants ALTER COLUMN email DROP NOT NULL;
UPDATE tenants
SET phone = COALESCE(
  NULLIF(phone, ''),
  NULLIF(regexp_replace(COALESCE(linked_whatsapp, ''), '\D', '', 'g'), ''),
  'pending-' || substring(id::text, 1, 8)
)
WHERE phone IS NULL OR phone = '';
UPDATE tenants
SET business_category = CASE
  WHEN business_type = 'real_estate' THEN 'real_estate'
  ELSE COALESCE(NULLIF(business_category, ''), 'general')
END
WHERE business_category IS NULL OR business_category = '';
ALTER TABLE tenants ALTER COLUMN phone SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_phone_uidx ON tenants (phone);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_uidx ON tenants (email) WHERE email IS NOT NULL AND email <> '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
UPDATE tenants SET plan_expires_at = NULL WHERE is_platform = TRUE;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tenant_leads (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_phone TEXT,
  customer_name TEXT,
  lead_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_leads_tenant_idx
  ON tenant_leads (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  jid TEXT,
  phone TEXT,
  direction TEXT NOT NULL DEFAULT 'turn',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
