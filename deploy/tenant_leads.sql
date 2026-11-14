-- Lead capture (also auto-created by initDatabase)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alert_phone TEXT;

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
