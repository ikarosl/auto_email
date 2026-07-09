ALTER TABLE inquiry_messages
  ADD COLUMN IF NOT EXISTS created_by_type TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS relation_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE inquiry_messages
  DROP CONSTRAINT IF EXISTS inquiry_messages_relation_type_check;

ALTER TABLE inquiry_messages
  ADD CONSTRAINT inquiry_messages_relation_type_check
  CHECK (relation_type IN ('original', 'reply', 'forward', 'related_context', 'manual_link', 'manual_import'));
