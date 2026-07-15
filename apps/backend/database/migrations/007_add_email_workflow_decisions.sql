CREATE TABLE IF NOT EXISTS email_workflow_decisions (
  id TEXT PRIMARY KEY,
  email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  inquiry_case_id TEXT NOT NULL REFERENCES inquiry_cases(id) ON DELETE CASCADE,
  ai_decision_id TEXT REFERENCES ai_decisions(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  response_expected BOOLEAN NOT NULL DEFAULT FALSE,
  suggested_status TEXT,
  confidence NUMERIC(5, 4),
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high')),
  reason TEXT,
  commercial_boundary_detected BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  decision_source TEXT NOT NULL CHECK (decision_source IN ('ai', 'system_rule')),
  model_name TEXT,
  prompt_version TEXT,
  raw_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    execution_status IN ('pending', 'dry_run', 'applied', 'rejected', 'conflict', 'no_change', 'historical_backfill', 'failed')
  ),
  execution_from_status TEXT,
  execution_to_status TEXT,
  execution_reason TEXT,
  executed_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_workflow_decisions_inquiry_created_idx
  ON email_workflow_decisions(inquiry_case_id, created_at);
CREATE INDEX IF NOT EXISTS email_workflow_decisions_email_idx
  ON email_workflow_decisions(email_message_id);
CREATE INDEX IF NOT EXISTS email_workflow_decisions_execution_status_idx
  ON email_workflow_decisions(execution_status);
