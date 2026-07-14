ALTER TABLE inquiry_cases DROP CONSTRAINT IF EXISTS inquiry_cases_status_check;
ALTER TABLE inquiry_cases ADD CONSTRAINT inquiry_cases_status_check CHECK (
  status IN ('new', 'invalid', 'need_clarification', 'need_engineer_review', 'waiting_customer', 'ready_for_quote', 'quoted', 'closed')
);

ALTER TABLE inquiry_status_logs DROP CONSTRAINT IF EXISTS inquiry_status_logs_to_status_check;
ALTER TABLE inquiry_status_logs ADD CONSTRAINT inquiry_status_logs_to_status_check CHECK (
  to_status IN ('new', 'invalid', 'need_clarification', 'need_engineer_review', 'waiting_customer', 'ready_for_quote', 'quoted', 'closed')
);

ALTER TABLE ai_decisions DROP CONSTRAINT IF EXISTS ai_decisions_suggested_status_check;
ALTER TABLE ai_decisions ADD CONSTRAINT ai_decisions_suggested_status_check CHECK (
  suggested_status IS NULL OR suggested_status IN ('new', 'invalid', 'need_clarification', 'need_engineer_review', 'waiting_customer', 'ready_for_quote', 'quoted', 'closed')
);

ALTER TABLE reply_drafts DROP CONSTRAINT IF EXISTS reply_drafts_status_check;
ALTER TABLE reply_drafts ADD CONSTRAINT reply_drafts_status_check CHECK (
  status IN ('pending_review', 'approved', 'rejected', 'sending', 'sent', 'simulated', 'send_failed', 'send_unknown', 'expired')
);

ALTER TABLE reply_drafts DROP CONSTRAINT IF EXISTS reply_drafts_draft_type_check;
ALTER TABLE reply_drafts ADD CONSTRAINT reply_drafts_draft_type_check CHECK (
  draft_type IN ('clarification_request', 'engineer_review_acknowledgement', 'quote_reply', 'general_reply')
);

ALTER TABLE reply_drafts DROP CONSTRAINT IF EXISTS reply_drafts_created_by_type_check;
ALTER TABLE reply_drafts ADD CONSTRAINT reply_drafts_created_by_type_check CHECK (
  created_by_type IN ('ai', 'human', 'system', 'human_ai_assisted')
);

ALTER TABLE reply_drafts
  ADD COLUMN IF NOT EXISTS context_snapshot_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_decision_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS original_subject TEXT,
  ADD COLUMN IF NOT EXISTS original_body_text TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS used_facts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unresolved_questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_commercial_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_send_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS reply_drafts_idempotency_key_key ON reply_drafts(idempotency_key);
CREATE INDEX IF NOT EXISTS reply_drafts_ai_decision_id_idx ON reply_drafts(ai_decision_id);
DO $$ BEGIN
  ALTER TABLE reply_drafts ADD CONSTRAINT reply_drafts_ai_decision_id_fkey
    FOREIGN KEY (ai_decision_id) REFERENCES ai_decisions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS reply_draft_attachments (
  reply_draft_id TEXT NOT NULL REFERENCES reply_drafts(id) ON DELETE CASCADE,
  email_attachment_id TEXT NOT NULL REFERENCES email_attachments(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reply_draft_id, email_attachment_id)
);
CREATE INDEX IF NOT EXISTS reply_draft_attachments_email_attachment_id_idx ON reply_draft_attachments(email_attachment_id);

CREATE TABLE IF NOT EXISTS email_send_attempts (
  id TEXT PRIMARY KEY DEFAULT ('send_attempt_' || gen_random_uuid()::TEXT),
  reply_draft_id TEXT NOT NULL REFERENCES reply_drafts(id) ON DELETE RESTRICT,
  inquiry_case_id TEXT NOT NULL REFERENCES inquiry_cases(id) ON DELETE RESTRICT,
  outbound_email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  operation_mode TEXT NOT NULL CHECK (operation_mode IN ('debug', 'production')),
  provider TEXT NOT NULL CHECK (provider IN ('simulated', 'smtp')),
  status TEXT NOT NULL CHECK (status IN ('simulated', 'accepted', 'rejected', 'failed', 'unknown')),
  idempotency_key TEXT NOT NULL UNIQUE,
  message_id TEXT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  provider_response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_send_attempts_reply_draft_id_idx ON email_send_attempts(reply_draft_id);
CREATE INDEX IF NOT EXISTS email_send_attempts_inquiry_case_id_idx ON email_send_attempts(inquiry_case_id);
CREATE INDEX IF NOT EXISTS email_send_attempts_status_idx ON email_send_attempts(status);
CREATE INDEX IF NOT EXISTS email_send_attempts_started_at_idx ON email_send_attempts(started_at);
