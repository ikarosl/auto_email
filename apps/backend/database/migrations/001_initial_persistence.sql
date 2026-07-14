CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mailbox_accounts (
  id TEXT PRIMARY KEY DEFAULT ('mailbox_' || gen_random_uuid()::TEXT),
  email_address TEXT NOT NULL UNIQUE,
  provider TEXT,
  imap_host TEXT,
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_secure BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mailbox_sync_states (
  id TEXT PRIMARY KEY DEFAULT ('mailbox_sync_' || gen_random_uuid()::TEXT),
  mailbox_account_id TEXT NOT NULL REFERENCES mailbox_accounts(id) ON DELETE CASCADE,
  mailbox_name TEXT NOT NULL DEFAULT 'INBOX',
  uid_validity BIGINT,
  last_seen_uid BIGINT,
  last_processed_uid BIGINT,
  bootstrap_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mailbox_account_id, mailbox_name)
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY DEFAULT ('org_' || gen_random_uuid()::TEXT),
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'merged')),
  source TEXT NOT NULL DEFAULT 'email_domain',
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS organizations_domain_idx ON organizations(domain);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations(status);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT ('customer_' || gen_random_uuid()::TEXT),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  domain TEXT,
  company_name TEXT,
  country TEXT,
  source TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'active', 'invalid')),
  invalid_reason TEXT,
  status_updated_at TIMESTAMPTZ,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customers_status_idx ON customers(status);
CREATE INDEX IF NOT EXISTS customers_domain_idx ON customers(domain);
CREATE INDEX IF NOT EXISTS customers_organization_idx ON customers(organization_id);

CREATE TABLE IF NOT EXISTS email_threads (
  id TEXT PRIMARY KEY DEFAULT ('thread_' || gen_random_uuid()::TEXT),
  mailbox_account_id TEXT NOT NULL REFERENCES mailbox_accounts(id) ON DELETE CASCADE,
  thread_key TEXT NOT NULL,
  external_thread_id TEXT,
  subject_normalized TEXT,
  customer_email TEXT,
  latest_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mailbox_account_id, thread_key)
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY DEFAULT ('email_' || gen_random_uuid()::TEXT),
  mailbox_account_id TEXT REFERENCES mailbox_accounts(id) ON DELETE SET NULL,
  email_thread_id TEXT REFERENCES email_threads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  mailbox_name TEXT NOT NULL DEFAULT 'INBOX',
  uid_validity BIGINT,
  uid BIGINT,
  message_id TEXT,
  in_reply_to TEXT,
  references_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails JSONB NOT NULL DEFAULT '[]'::JSONB,
  cc_emails JSONB NOT NULL DEFAULT '[]'::JSONB,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  raw_source TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'imap',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attachment_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_mailbox_uid_unique
  ON email_messages (mailbox_account_id, mailbox_name, uid_validity, uid)
  WHERE mailbox_account_id IS NOT NULL AND uid_validity IS NOT NULL AND uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_message_id_unique
  ON email_messages (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON email_messages(email_thread_id);
CREATE INDEX IF NOT EXISTS email_messages_from_email_idx ON email_messages(from_email);
CREATE INDEX IF NOT EXISTS email_messages_received_at_idx ON email_messages(received_at);
CREATE INDEX IF NOT EXISTS email_messages_direction_idx ON email_messages(direction);

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
  parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'parsed', 'skipped', 'failed')),
  parse_strategy TEXT,
  parsed_text TEXT,
  parsed_text_preview TEXT,
  parsed_text_length INTEGER NOT NULL DEFAULT 0,
  parse_error_code TEXT,
  parse_error_message TEXT,
  parsed_at TIMESTAMPTZ,
  ocr_status TEXT NOT NULL DEFAULT 'skipped' CHECK (ocr_status IN ('pending', 'skipped', 'parsed', 'failed')),
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

CREATE INDEX IF NOT EXISTS email_attachments_email_idx ON email_attachments(email_message_id);
CREATE INDEX IF NOT EXISTS email_attachments_inquiry_idx ON email_attachments(inquiry_case_id);
CREATE INDEX IF NOT EXISTS email_attachments_parse_status_idx ON email_attachments(parse_status);
CREATE INDEX IF NOT EXISTS email_attachments_content_hash_idx ON email_attachments(content_hash);

CREATE TABLE IF NOT EXISTS inquiry_cases (
  id TEXT PRIMARY KEY DEFAULT ('inquiry_' || gen_random_uuid()::TEXT),
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  primary_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN (
      'new',
      'invalid',
      'need_clarification',
      'need_engineer_review',
      'waiting_customer',
      'ready_for_quote',
      'quoted',
      'closed'
    )
  ),
  subject TEXT,
  raw_subject TEXT,
  business_subject TEXT,
  business_subject_source TEXT NOT NULL DEFAULT 'raw_email' CHECK (
    business_subject_source IN ('raw_email', 'ai_generated', 'human')
  ),
  business_subject_locked BOOLEAN NOT NULL DEFAULT FALSE,
  business_subject_updated_at TIMESTAMPTZ,
  product_type TEXT,
  latest_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE inquiry_cases
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_subject TEXT,
  ADD COLUMN IF NOT EXISTS business_subject TEXT,
  ADD COLUMN IF NOT EXISTS business_subject_source TEXT NOT NULL DEFAULT 'raw_email',
  ADD COLUMN IF NOT EXISTS business_subject_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS business_subject_updated_at TIMESTAMPTZ;

ALTER TABLE inquiry_cases
  DROP CONSTRAINT IF EXISTS inquiry_cases_business_subject_source_check;

ALTER TABLE inquiry_cases
  ADD CONSTRAINT inquiry_cases_business_subject_source_check
  CHECK (business_subject_source IN ('raw_email', 'ai_generated', 'human'));

CREATE INDEX IF NOT EXISTS inquiry_cases_customer_idx ON inquiry_cases(customer_id);
CREATE INDEX IF NOT EXISTS inquiry_cases_organization_idx ON inquiry_cases(organization_id);
CREATE INDEX IF NOT EXISTS inquiry_cases_primary_customer_idx ON inquiry_cases(primary_customer_id);
CREATE INDEX IF NOT EXISTS inquiry_cases_status_idx ON inquiry_cases(status);
CREATE INDEX IF NOT EXISTS inquiry_cases_latest_message_at_idx ON inquiry_cases(latest_message_at);

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

CREATE TABLE IF NOT EXISTS inquiry_messages (
  id TEXT PRIMARY KEY DEFAULT ('inquiry_message_' || gen_random_uuid()::TEXT),
  inquiry_case_id TEXT NOT NULL REFERENCES inquiry_cases(id) ON DELETE CASCADE,
  email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'reply' CHECK (
    relation_type IN ('original', 'reply', 'forward', 'related_context', 'manual_link', 'manual_import')
  ),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  created_by_type TEXT NOT NULL DEFAULT 'system',
  created_by TEXT,
  relation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inquiry_case_id, email_message_id)
);

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

CREATE INDEX IF NOT EXISTS inquiry_messages_inquiry_idx ON inquiry_messages(inquiry_case_id);
CREATE INDEX IF NOT EXISTS inquiry_messages_email_idx ON inquiry_messages(email_message_id);

CREATE TABLE IF NOT EXISTS processed_emails (
  id TEXT PRIMARY KEY DEFAULT ('processed_email_' || gen_random_uuid()::TEXT),
  mailbox_account_id TEXT NOT NULL REFERENCES mailbox_accounts(id) ON DELETE CASCADE,
  mailbox_name TEXT NOT NULL DEFAULT 'INBOX',
  uid_validity BIGINT NOT NULL,
  uid BIGINT NOT NULL,
  message_id TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mailbox_account_id, mailbox_name, uid_validity, uid)
);

CREATE INDEX IF NOT EXISTS processed_emails_message_id_idx ON processed_emails(message_id);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id TEXT PRIMARY KEY DEFAULT ('ai_decision_' || gen_random_uuid()::TEXT),
  email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  inquiry_case_id TEXT REFERENCES inquiry_cases(id) ON DELETE SET NULL,
  classification TEXT CHECK (
    classification IN ('valid_inquiry', 'invalid', 'unrelated_product', 'commercial', 'unknown')
  ),
  suggested_status TEXT CHECK (
    suggested_status IN (
      'new',
      'invalid',
      'need_clarification',
      'need_engineer_review',
      'waiting_customer',
      'ready_for_quote',
      'quoted',
      'closed'
    )
  ),
  confidence NUMERIC(5,4),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  reason TEXT,
  missing_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  extracted_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  quote_boundary_detected BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  next_action TEXT,
  raw_result JSONB NOT NULL DEFAULT '{}'::JSONB,
  model_name TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_code TEXT,
  error_message TEXT,
  execution_status TEXT NOT NULL DEFAULT 'not_evaluated' CHECK (
    execution_status IN ('not_evaluated', 'disabled', 'rejected', 'dry_run', 'applied', 'conflict')
  ),
  execution_from_status TEXT,
  execution_to_status TEXT,
  execution_reason TEXT,
  execution_policy_version TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_decisions
  ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'not_evaluated',
  ADD COLUMN IF NOT EXISTS execution_from_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_to_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_reason TEXT,
  ADD COLUMN IF NOT EXISTS execution_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

ALTER TABLE ai_decisions
  DROP CONSTRAINT IF EXISTS ai_decisions_execution_status_check;

ALTER TABLE ai_decisions
  ADD CONSTRAINT ai_decisions_execution_status_check
  CHECK (execution_status IN ('not_evaluated', 'disabled', 'rejected', 'dry_run', 'applied', 'conflict'));

CREATE INDEX IF NOT EXISTS ai_decisions_email_idx ON ai_decisions(email_message_id);
CREATE INDEX IF NOT EXISTS ai_decisions_inquiry_idx ON ai_decisions(inquiry_case_id);
CREATE INDEX IF NOT EXISTS ai_decisions_execution_status_idx ON ai_decisions(execution_status);
CREATE INDEX IF NOT EXISTS ai_decisions_created_at_idx ON ai_decisions(created_at);

CREATE TABLE IF NOT EXISTS inquiry_structured_facts (
  id TEXT PRIMARY KEY DEFAULT ('facts_' || gen_random_uuid()::TEXT),
  inquiry_case_id TEXT NOT NULL UNIQUE REFERENCES inquiry_cases(id) ON DELETE CASCADE,
  product_type TEXT,
  structure_type TEXT,
  frequency_range TEXT,
  power TEXT,
  insertion_loss TEXT,
  isolation TEXT,
  vswr TEXT,
  connector TEXT,
  size_requirement TEXT,
  quantity TEXT,
  application TEXT,
  delivery_requirement TEXT,
  special_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  missing_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  confirmed_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  uncertain_fields JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_email_message_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  confidence NUMERIC(5,4),
  last_updated_by TEXT NOT NULL DEFAULT 'system' CHECK (last_updated_by IN ('ai', 'human', 'system')),
  updated_from_email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_structured_facts_product_idx ON inquiry_structured_facts(product_type);

CREATE TABLE IF NOT EXISTS reply_drafts (
  id TEXT PRIMARY KEY DEFAULT ('draft_' || gen_random_uuid()::TEXT),
  inquiry_case_id TEXT NOT NULL REFERENCES inquiry_cases(id) ON DELETE CASCADE,
  source_email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  sent_email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL CHECK (
    draft_type IN (
      'clarification_request',
      'engineer_review_acknowledgement',
      'quote_reply',
      'general_reply'
    )
  ),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'sending', 'sent', 'simulated', 'send_failed', 'send_unknown', 'expired')
  ),
  subject TEXT,
  body_text TEXT NOT NULL,
  context_snapshot_id TEXT,
  ai_decision_id TEXT REFERENCES ai_decisions(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  original_subject TEXT,
  original_body_text TEXT,
  language TEXT,
  used_facts_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  unresolved_questions_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  warnings_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  requires_commercial_review BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_version TEXT,
  model_name TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_type TEXT NOT NULL DEFAULT 'ai' CHECK (created_by_type IN ('ai', 'human', 'system', 'human_ai_assisted')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  sent_at TIMESTAMPTZ,
  last_send_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reply_drafts_inquiry_idx ON reply_drafts(inquiry_case_id);
CREATE INDEX IF NOT EXISTS reply_drafts_status_idx ON reply_drafts(status);
CREATE INDEX IF NOT EXISTS reply_drafts_source_email_idx ON reply_drafts(source_email_message_id);
CREATE INDEX IF NOT EXISTS reply_drafts_sent_email_idx ON reply_drafts(sent_email_message_id);
CREATE INDEX IF NOT EXISTS reply_drafts_ai_decision_id_idx ON reply_drafts(ai_decision_id);

CREATE TABLE IF NOT EXISTS reply_draft_attachments (
  reply_draft_id TEXT NOT NULL REFERENCES reply_drafts(id) ON DELETE CASCADE,
  email_attachment_id TEXT NOT NULL REFERENCES email_attachments(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reply_draft_id, email_attachment_id)
);

CREATE INDEX IF NOT EXISTS reply_draft_attachments_email_attachment_id_idx
  ON reply_draft_attachments(email_attachment_id);

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
  provider_response_json JSONB NOT NULL DEFAULT '{}'::JSONB,
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

CREATE TABLE IF NOT EXISTS ai_context_snapshots (
  id TEXT PRIMARY KEY DEFAULT ('context_snapshot_' || gen_random_uuid()::TEXT),
  inquiry_case_id TEXT REFERENCES inquiry_cases(id) ON DELETE SET NULL,
  email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL,
  context_payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  messages_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_references JSONB NOT NULL DEFAULT '[]'::JSONB,
  estimated_tokens INTEGER,
  model_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_context_snapshots_inquiry_idx ON ai_context_snapshots(inquiry_case_id);
CREATE INDEX IF NOT EXISTS ai_context_snapshots_email_idx ON ai_context_snapshots(email_message_id);
CREATE INDEX IF NOT EXISTS ai_context_snapshots_created_at_idx ON ai_context_snapshots(created_at);

CREATE TABLE IF NOT EXISTS inquiry_context_summaries (
  id TEXT PRIMARY KEY DEFAULT ('context_summary_' || gen_random_uuid()::TEXT),
  inquiry_case_id TEXT NOT NULL UNIQUE REFERENCES inquiry_cases(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  known_facts_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  customer_decisions_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  our_commitments_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  open_questions_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  covered_email_ids_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  covered_message_count INTEGER NOT NULL DEFAULT 0,
  covered_from TIMESTAMPTZ,
  covered_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_context_summaries_updated_at_idx ON inquiry_context_summaries(updated_at);

CREATE TABLE IF NOT EXISTS inquiry_status_logs (
  id TEXT PRIMARY KEY DEFAULT ('status_log_' || gen_random_uuid()::TEXT),
  inquiry_case_id TEXT NOT NULL REFERENCES inquiry_cases(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (
    to_status IN (
      'new',
      'invalid',
      'need_clarification',
      'need_engineer_review',
      'waiting_customer',
      'ready_for_quote',
      'quoted',
      'closed'
    )
  ),
  reason TEXT,
  changed_by TEXT,
  changed_by_type TEXT NOT NULL CHECK (changed_by_type IN ('human', 'ai', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_status_logs_inquiry_idx ON inquiry_status_logs(inquiry_case_id);
CREATE INDEX IF NOT EXISTS inquiry_status_logs_created_at_idx ON inquiry_status_logs(created_at);
