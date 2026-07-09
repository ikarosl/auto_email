CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attachment_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY DEFAULT ('attachment_' || gen_random_uuid()::TEXT),
  email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  inquiry_case_id TEXT,
  original_file_name TEXT,
  safe_file_name TEXT NOT NULL,
  content_id TEXT,
  content_disposition TEXT,
  mime_type TEXT NOT NULL,
  file_extension TEXT,
  file_size BIGINT NOT NULL,
  content_hash TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_strategy TEXT,
  parsed_text TEXT,
  parsed_text_preview TEXT,
  parsed_text_length INTEGER NOT NULL DEFAULT 0,
  parse_error_code TEXT,
  parse_error_message TEXT,
  parsed_at TIMESTAMPTZ,
  ocr_status TEXT NOT NULL DEFAULT 'skipped',
  ocr_provider TEXT,
  ocr_text TEXT,
  ocr_text_preview TEXT,
  ocr_result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  ocr_error_code TEXT,
  ocr_at TIMESTAMPTZ,
  is_inline BOOLEAN NOT NULL DEFAULT FALSE,
  is_context_candidate BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_attachments
  ADD COLUMN IF NOT EXISTS inquiry_case_id TEXT,
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'skipped',
  ADD COLUMN IF NOT EXISTS ocr_provider TEXT,
  ADD COLUMN IF NOT EXISTS ocr_text TEXT,
  ADD COLUMN IF NOT EXISTS ocr_text_preview TEXT,
  ADD COLUMN IF NOT EXISTS ocr_result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS ocr_error_code TEXT,
  ADD COLUMN IF NOT EXISTS ocr_at TIMESTAMPTZ;

ALTER TABLE email_attachments
  DROP CONSTRAINT IF EXISTS email_attachments_parse_status_check,
  DROP CONSTRAINT IF EXISTS email_attachments_ocr_status_check;

ALTER TABLE email_attachments
  ADD CONSTRAINT email_attachments_parse_status_check
  CHECK (parse_status IN ('pending', 'parsed', 'skipped', 'failed')),
  ADD CONSTRAINT email_attachments_ocr_status_check
  CHECK (ocr_status IN ('pending', 'skipped', 'parsed', 'failed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_attachments_inquiry_case_id_fkey'
  ) THEN
    ALTER TABLE email_attachments
      ADD CONSTRAINT email_attachments_inquiry_case_id_fkey
      FOREIGN KEY (inquiry_case_id) REFERENCES inquiry_cases(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_attachments_email_idx ON email_attachments(email_message_id);
CREATE INDEX IF NOT EXISTS email_attachments_inquiry_idx ON email_attachments(inquiry_case_id);
CREATE INDEX IF NOT EXISTS email_attachments_parse_status_idx ON email_attachments(parse_status);
CREATE INDEX IF NOT EXISTS email_attachments_content_hash_idx ON email_attachments(content_hash);
