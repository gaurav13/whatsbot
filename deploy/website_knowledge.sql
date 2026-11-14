-- Run this in Supabase SQL Editor (optional if auto-init is enabled)

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

CREATE INDEX IF NOT EXISTS website_knowledge_updated_at_idx
  ON website_knowledge (updated_at DESC);
