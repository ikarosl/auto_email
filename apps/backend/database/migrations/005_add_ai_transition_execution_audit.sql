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

CREATE INDEX IF NOT EXISTS ai_decisions_execution_status_idx
  ON ai_decisions(execution_status);
