ALTER TABLE ai_context_snapshots
  ADD COLUMN IF NOT EXISTS context_payload_json JSONB NOT NULL DEFAULT '{}'::JSONB;
