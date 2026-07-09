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
  raw_source TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'imap',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_decisions_email_idx ON ai_decisions(email_message_id);
CREATE INDEX IF NOT EXISTS ai_decisions_inquiry_idx ON ai_decisions(inquiry_case_id);
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
      'engineer_review_notice',
      'quote_handoff_notice',
      'invalid_notice'
    )
  ),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'sent_manually', 'expired')
  ),
  subject TEXT,
  body_text TEXT NOT NULL,
  model_name TEXT,
  created_by_type TEXT NOT NULL DEFAULT 'ai' CHECK (created_by_type IN ('ai', 'human', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reply_drafts_inquiry_idx ON reply_drafts(inquiry_case_id);
CREATE INDEX IF NOT EXISTS reply_drafts_status_idx ON reply_drafts(status);
CREATE INDEX IF NOT EXISTS reply_drafts_source_email_idx ON reply_drafts(source_email_message_id);
CREATE INDEX IF NOT EXISTS reply_drafts_sent_email_idx ON reply_drafts(sent_email_message_id);

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
