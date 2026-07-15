-- Development reset baseline. This intentionally removes all application data.
DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- CreateEnum
CREATE TYPE "InquiryBusinessStage" AS ENUM ('intake', 'technical_review', 'commercial', 'contract');

-- CreateEnum
CREATE TYPE "InquiryActionOwner" AS ENUM ('us', 'customer', 'none');

-- CreateEnum
CREATE TYPE "InquiryLifecycleStatus" AS ENUM ('active', 'won', 'lost', 'invalid');

-- CreateEnum
CREATE TYPE "InquiryProcessingMode" AS ENUM ('automatic', 'manual');

-- CreateTable
CREATE TABLE "mailbox_accounts" (
    "id" TEXT NOT NULL DEFAULT 'mailbox_' || gen_random_uuid()::TEXT,
    "email_address" TEXT NOT NULL,
    "provider" TEXT,
    "imap_host" TEXT,
    "imap_port" INTEGER NOT NULL DEFAULT 993,
    "imap_secure" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_sync_states" (
    "id" TEXT NOT NULL DEFAULT 'mailbox_sync_' || gen_random_uuid()::TEXT,
    "mailbox_account_id" TEXT NOT NULL,
    "mailbox_name" TEXT NOT NULL DEFAULT 'INBOX',
    "uid_validity" BIGINT,
    "last_seen_uid" BIGINT,
    "last_processed_uid" BIGINT,
    "bootstrap_completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL DEFAULT 'customer_' || gen_random_uuid()::TEXT,
    "organization_id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "domain" TEXT,
    "company_name" TEXT,
    "country" TEXT,
    "source" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "invalid_reason" TEXT,
    "status_updated_at" TIMESTAMPTZ(6),
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL DEFAULT 'org_' || gen_random_uuid()::TEXT,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'email_domain',
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL DEFAULT 'thread_' || gen_random_uuid()::TEXT,
    "mailbox_account_id" TEXT NOT NULL,
    "thread_key" TEXT NOT NULL,
    "external_thread_id" TEXT,
    "subject_normalized" TEXT,
    "customer_email" TEXT,
    "latest_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL DEFAULT 'email_' || gen_random_uuid()::TEXT,
    "mailbox_account_id" TEXT,
    "email_thread_id" TEXT,
    "direction" TEXT NOT NULL,
    "mailbox_name" TEXT NOT NULL DEFAULT 'INBOX',
    "uid_validity" BIGINT,
    "uid" BIGINT,
    "message_id" TEXT,
    "in_reply_to" TEXT,
    "references_json" JSONB NOT NULL DEFAULT '[]',
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "to_emails" JSONB NOT NULL DEFAULT '[]',
    "cc_emails" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "raw_source" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'imap',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL DEFAULT 'attachment_' || gen_random_uuid()::TEXT,
    "email_message_id" TEXT NOT NULL,
    "inquiry_case_id" TEXT,
    "original_file_name" TEXT,
    "safe_file_name" TEXT NOT NULL,
    "content_id" TEXT,
    "content_disposition" TEXT,
    "mime_type" TEXT NOT NULL,
    "file_extension" TEXT,
    "file_size" BIGINT NOT NULL,
    "content_hash" TEXT,
    "storage_provider" TEXT NOT NULL DEFAULT 'local',
    "storage_path" TEXT,
    "parse_status" TEXT NOT NULL DEFAULT 'pending',
    "parse_strategy" TEXT,
    "parsed_text" TEXT,
    "parsed_text_preview" TEXT,
    "parsed_text_length" INTEGER NOT NULL DEFAULT 0,
    "parse_error_code" TEXT,
    "parse_error_message" TEXT,
    "parsed_at" TIMESTAMPTZ(6),
    "ocr_status" TEXT NOT NULL DEFAULT 'skipped',
    "ocr_provider" TEXT,
    "ocr_text" TEXT,
    "ocr_text_preview" TEXT,
    "ocr_result_json" JSONB NOT NULL DEFAULT '{}',
    "ocr_error_code" TEXT,
    "ocr_at" TIMESTAMPTZ(6),
    "is_inline" BOOLEAN NOT NULL DEFAULT false,
    "is_context_candidate" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_cases" (
    "id" TEXT NOT NULL DEFAULT 'inquiry_' || gen_random_uuid()::TEXT,
    "customer_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "primary_customer_id" TEXT,
    "business_stage" "InquiryBusinessStage" NOT NULL DEFAULT 'intake',
    "action_owner" "InquiryActionOwner" NOT NULL DEFAULT 'us',
    "lifecycle_status" "InquiryLifecycleStatus" NOT NULL DEFAULT 'active',
    "state_version" INTEGER NOT NULL DEFAULT 0,
    "processing_mode" "InquiryProcessingMode" NOT NULL DEFAULT 'automatic',
    "processing_mode_reason" TEXT,
    "processing_mode_changed_at" TIMESTAMPTZ(6),
    "processing_mode_changed_by" TEXT,
    "subject" TEXT,
    "raw_subject" TEXT,
    "business_subject" TEXT,
    "business_subject_source" TEXT NOT NULL DEFAULT 'raw_email',
    "business_subject_locked" BOOLEAN NOT NULL DEFAULT false,
    "business_subject_updated_at" TIMESTAMPTZ(6),
    "product_type" TEXT,
    "latest_message_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "inquiry_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_messages" (
    "id" TEXT NOT NULL DEFAULT 'inquiry_message_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "email_message_id" TEXT NOT NULL,
    "relation_type" TEXT NOT NULL DEFAULT 'reply',
    "direction" TEXT NOT NULL,
    "created_by_type" TEXT NOT NULL DEFAULT 'system',
    "created_by" TEXT,
    "relation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_emails" (
    "id" TEXT NOT NULL DEFAULT 'processed_email_' || gen_random_uuid()::TEXT,
    "mailbox_account_id" TEXT NOT NULL,
    "mailbox_name" TEXT NOT NULL DEFAULT 'INBOX',
    "uid_validity" BIGINT NOT NULL,
    "uid" BIGINT NOT NULL,
    "message_id" TEXT,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_analysis_decisions" (
    "id" TEXT NOT NULL DEFAULT 'email_analysis_' || gen_random_uuid()::TEXT,
    "email_message_id" TEXT NOT NULL,
    "inquiry_case_id" TEXT NOT NULL,
    "context_snapshot_id" TEXT,
    "direction" TEXT NOT NULL,
    "message_classification" TEXT,
    "is_inquiry" BOOLEAN,
    "inquiry_scope" TEXT,
    "scope_relationship" TEXT,
    "inquiry_scope_confidence" DECIMAL(5,4),
    "detected_products" JSONB NOT NULL DEFAULT '[]',
    "replay_run_id" TEXT,
    "is_effective" BOOLEAN NOT NULL DEFAULT true,
    "suggested_business_stage" "InquiryBusinessStage",
    "suggested_action_owner" "InquiryActionOwner",
    "suggested_lifecycle_status" "InquiryLifecycleStatus",
    "confidence" DECIMAL(5,4),
    "risk_level" TEXT,
    "reason" TEXT,
    "missing_fields" JSONB NOT NULL DEFAULT '[]',
    "extracted_requirements" JSONB NOT NULL DEFAULT '{}',
    "quote_boundary_detected" BOOLEAN NOT NULL DEFAULT false,
    "human_review_required" BOOLEAN NOT NULL DEFAULT false,
    "next_action" TEXT,
    "raw_result" JSONB NOT NULL DEFAULT '{}',
    "raw_output" TEXT,
    "model_name" TEXT,
    "prompt_version" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_code" TEXT,
    "error_message" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_analysis_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_processing_mode_transitions" (
    "id" TEXT NOT NULL DEFAULT 'processing_mode_transition_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "from_mode" "InquiryProcessingMode" NOT NULL,
    "to_mode" "InquiryProcessingMode" NOT NULL,
    "reason" TEXT NOT NULL,
    "source_email_message_id" TEXT,
    "analysis_decision_id" TEXT,
    "inquiry_scope" TEXT,
    "scope_relationship" TEXT,
    "scope_confidence" DECIMAL(5,4),
    "detected_products" JSONB NOT NULL DEFAULT '[]',
    "before_state_json" JSONB NOT NULL DEFAULT '{}',
    "changed_by" TEXT NOT NULL,
    "changed_by_type" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_processing_mode_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_replay_runs" (
    "id" TEXT NOT NULL DEFAULT 'inquiry_replay_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "from_time" TIMESTAMPTZ(6) NOT NULL,
    "through_time" TIMESTAMPTZ(6) NOT NULL,
    "expected_state_version" INTEGER NOT NULL,
    "baseline_state_json" JSONB NOT NULL DEFAULT '{}',
    "final_state_json" JSONB NOT NULL DEFAULT '{}',
    "timeline_json" JSONB NOT NULL DEFAULT '[]',
    "error_message" TEXT,
    "initiated_by" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "inquiry_replay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_business_events" (
    "id" TEXT NOT NULL DEFAULT 'business_event_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "email_message_id" TEXT,
    "analysis_decision_id" TEXT,
    "corrected_event_id" TEXT,
    "event_type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "sequence_in_email" INTEGER NOT NULL DEFAULT 0,
    "confidence" DECIMAL(5,4),
    "evidence" TEXT,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "source_type" TEXT NOT NULL DEFAULT 'ai',
    "replay_run_id" TEXT,
    "is_effective" BOOLEAN NOT NULL DEFAULT true,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_business_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_state_decisions" (
    "id" TEXT NOT NULL DEFAULT 'state_decision_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "email_message_id" TEXT,
    "analysis_decision_id" TEXT,
    "replay_run_id" TEXT,
    "is_effective" BOOLEAN NOT NULL DEFAULT true,
    "before_business_stage" "InquiryBusinessStage" NOT NULL,
    "before_action_owner" "InquiryActionOwner" NOT NULL,
    "before_lifecycle_status" "InquiryLifecycleStatus" NOT NULL,
    "before_state_version" INTEGER NOT NULL,
    "suggested_business_stage" "InquiryBusinessStage" NOT NULL,
    "suggested_action_owner" "InquiryActionOwner" NOT NULL,
    "suggested_lifecycle_status" "InquiryLifecycleStatus" NOT NULL,
    "applied_business_stage" "InquiryBusinessStage",
    "applied_action_owner" "InquiryActionOwner",
    "applied_lifecycle_status" "InquiryLifecycleStatus",
    "confidence" DECIMAL(5,4),
    "risk_level" TEXT,
    "event_validation_passed" BOOLEAN NOT NULL DEFAULT false,
    "human_review_advisory" BOOLEAN NOT NULL DEFAULT false,
    "baseline_incomplete" BOOLEAN NOT NULL DEFAULT false,
    "execution_status" TEXT NOT NULL DEFAULT 'pending',
    "execution_reason" TEXT,
    "policy_version" TEXT NOT NULL,
    "decision_source" TEXT NOT NULL DEFAULT 'ai',
    "event_occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_state_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_state_transitions" (
    "id" TEXT NOT NULL DEFAULT 'state_transition_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "state_decision_id" TEXT NOT NULL,
    "replay_run_id" TEXT,
    "is_effective" BOOLEAN NOT NULL DEFAULT true,
    "from_business_stage" "InquiryBusinessStage" NOT NULL,
    "from_action_owner" "InquiryActionOwner" NOT NULL,
    "from_lifecycle_status" "InquiryLifecycleStatus" NOT NULL,
    "to_business_stage" "InquiryBusinessStage" NOT NULL,
    "to_action_owner" "InquiryActionOwner" NOT NULL,
    "to_lifecycle_status" "InquiryLifecycleStatus" NOT NULL,
    "changed_dimensions_json" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "changed_by" TEXT,
    "changed_by_type" TEXT NOT NULL,
    "event_occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_recovery_records" (
    "id" TEXT NOT NULL DEFAULT 'recovery_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT,
    "trigger_email_id" TEXT NOT NULL,
    "recovered_email_id" TEXT NOT NULL,
    "expected_message_id" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "evidence_json" JSONB NOT NULL DEFAULT '{}',
    "recovery_status" TEXT NOT NULL DEFAULT 'context_only',
    "replay_run_id" TEXT,
    "baseline_incomplete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_recovery_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_structured_facts" (
    "id" TEXT NOT NULL DEFAULT 'facts_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "product_type" TEXT,
    "structure_type" TEXT,
    "frequency_range" TEXT,
    "power" TEXT,
    "insertion_loss" TEXT,
    "isolation" TEXT,
    "vswr" TEXT,
    "connector" TEXT,
    "size_requirement" TEXT,
    "quantity" TEXT,
    "application" TEXT,
    "delivery_requirement" TEXT,
    "special_requirements" JSONB NOT NULL DEFAULT '{}',
    "missing_fields" JSONB NOT NULL DEFAULT '[]',
    "confirmed_fields" JSONB NOT NULL DEFAULT '[]',
    "uncertain_fields" JSONB NOT NULL DEFAULT '{}',
    "source_email_message_ids" JSONB NOT NULL DEFAULT '[]',
    "confidence" DECIMAL(5,4),
    "last_updated_by" TEXT NOT NULL DEFAULT 'system',
    "updated_from_email_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_structured_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_drafts" (
    "id" TEXT NOT NULL DEFAULT 'draft_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "source_email_message_id" TEXT,
    "sent_email_message_id" TEXT,
    "context_snapshot_id" TEXT,
    "email_analysis_decision_id" TEXT,
    "idempotency_key" TEXT,
    "draft_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "subject" TEXT,
    "body_text" TEXT NOT NULL,
    "original_subject" TEXT,
    "original_body_text" TEXT,
    "language" TEXT,
    "used_facts_json" JSONB NOT NULL DEFAULT '[]',
    "unresolved_questions_json" JSONB NOT NULL DEFAULT '[]',
    "warnings_json" JSONB NOT NULL DEFAULT '[]',
    "requires_commercial_review" BOOLEAN NOT NULL DEFAULT false,
    "prompt_version" TEXT,
    "model_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_type" TEXT NOT NULL DEFAULT 'ai',
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "last_send_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_draft_attachments" (
    "reply_draft_id" TEXT NOT NULL,
    "email_attachment_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_draft_attachments_pkey" PRIMARY KEY ("reply_draft_id","email_attachment_id")
);

-- CreateTable
CREATE TABLE "email_send_attempts" (
    "id" TEXT NOT NULL DEFAULT 'send_attempt_' || gen_random_uuid()::TEXT,
    "reply_draft_id" TEXT NOT NULL,
    "inquiry_case_id" TEXT NOT NULL,
    "outbound_email_message_id" TEXT,
    "operation_mode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "message_id" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "provider_response_json" JSONB NOT NULL DEFAULT '{}',
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_send_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_context_snapshots" (
    "id" TEXT NOT NULL DEFAULT 'context_snapshot_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT,
    "email_message_id" TEXT,
    "purpose" TEXT NOT NULL,
    "context_payload_json" JSONB NOT NULL DEFAULT '{}',
    "messages_json" JSONB NOT NULL DEFAULT '[]',
    "source_references" JSONB NOT NULL DEFAULT '[]',
    "estimated_tokens" INTEGER,
    "model_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_context_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_context_summaries" (
    "id" TEXT NOT NULL DEFAULT 'context_summary_' || gen_random_uuid()::TEXT,
    "inquiry_case_id" TEXT NOT NULL,
    "summary_text" TEXT NOT NULL,
    "known_facts_json" JSONB NOT NULL DEFAULT '[]',
    "customer_decisions_json" JSONB NOT NULL DEFAULT '[]',
    "our_commitments_json" JSONB NOT NULL DEFAULT '[]',
    "open_questions_json" JSONB NOT NULL DEFAULT '[]',
    "covered_email_ids_json" JSONB NOT NULL DEFAULT '[]',
    "covered_message_count" INTEGER NOT NULL DEFAULT 0,
    "covered_from" TIMESTAMPTZ(6),
    "covered_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_context_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_accounts_email_address_key" ON "mailbox_accounts"("email_address");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_sync_states_mailbox_account_id_mailbox_name_key" ON "mailbox_sync_states"("mailbox_account_id", "mailbox_name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_domain_idx" ON "customers"("domain");

-- CreateIndex
CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_domain_key" ON "organizations"("domain");

-- CreateIndex
CREATE INDEX "organizations_domain_idx" ON "organizations"("domain");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_mailbox_account_id_thread_key_key" ON "email_threads"("mailbox_account_id", "thread_key");

-- CreateIndex
CREATE INDEX "email_messages_email_thread_id_idx" ON "email_messages"("email_thread_id");

-- CreateIndex
CREATE INDEX "email_messages_from_email_idx" ON "email_messages"("from_email");

-- CreateIndex
CREATE INDEX "email_messages_received_at_idx" ON "email_messages"("received_at");

-- CreateIndex
CREATE INDEX "email_messages_direction_idx" ON "email_messages"("direction");

-- CreateIndex
CREATE INDEX "email_attachments_email_message_id_idx" ON "email_attachments"("email_message_id");

-- CreateIndex
CREATE INDEX "email_attachments_inquiry_case_id_idx" ON "email_attachments"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "email_attachments_parse_status_idx" ON "email_attachments"("parse_status");

-- CreateIndex
CREATE INDEX "email_attachments_content_hash_idx" ON "email_attachments"("content_hash");

-- CreateIndex
CREATE INDEX "inquiry_cases_customer_id_idx" ON "inquiry_cases"("customer_id");

-- CreateIndex
CREATE INDEX "inquiry_cases_organization_id_idx" ON "inquiry_cases"("organization_id");

-- CreateIndex
CREATE INDEX "inquiry_cases_primary_customer_id_idx" ON "inquiry_cases"("primary_customer_id");

-- CreateIndex
CREATE INDEX "inquiry_cases_business_stage_idx" ON "inquiry_cases"("business_stage");

-- CreateIndex
CREATE INDEX "inquiry_cases_action_owner_idx" ON "inquiry_cases"("action_owner");

-- CreateIndex
CREATE INDEX "inquiry_cases_lifecycle_status_idx" ON "inquiry_cases"("lifecycle_status");

-- CreateIndex
CREATE INDEX "inquiry_cases_processing_mode_idx" ON "inquiry_cases"("processing_mode");

-- CreateIndex
CREATE INDEX "inquiry_cases_latest_message_at_idx" ON "inquiry_cases"("latest_message_at");

-- CreateIndex
CREATE INDEX "inquiry_messages_inquiry_case_id_idx" ON "inquiry_messages"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "inquiry_messages_email_message_id_idx" ON "inquiry_messages"("email_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_messages_inquiry_case_id_email_message_id_key" ON "inquiry_messages"("inquiry_case_id", "email_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_messages_email_message_id_key" ON "inquiry_messages"("email_message_id");

-- CreateIndex
CREATE INDEX "processed_emails_message_id_idx" ON "processed_emails"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_emails_mailbox_account_id_mailbox_name_uid_validi_key" ON "processed_emails"("mailbox_account_id", "mailbox_name", "uid_validity", "uid");

-- CreateIndex
CREATE UNIQUE INDEX "email_analysis_decisions_idempotency_key_key" ON "email_analysis_decisions"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_analysis_decisions_email_message_id_idx" ON "email_analysis_decisions"("email_message_id");

-- CreateIndex
CREATE INDEX "email_analysis_decisions_inquiry_case_id_created_at_idx" ON "email_analysis_decisions"("inquiry_case_id", "created_at");

-- CreateIndex
CREATE INDEX "email_analysis_decisions_message_classification_idx" ON "email_analysis_decisions"("message_classification");

-- CreateIndex
CREATE INDEX "email_analysis_decisions_replay_run_id_idx" ON "email_analysis_decisions"("replay_run_id");

-- CreateIndex
CREATE INDEX "inquiry_processing_mode_transitions_inquiry_case_id_changed_idx" ON "inquiry_processing_mode_transitions"("inquiry_case_id", "changed_at");

-- CreateIndex
CREATE INDEX "inquiry_processing_mode_transitions_source_email_message_id_idx" ON "inquiry_processing_mode_transitions"("source_email_message_id");

-- CreateIndex
CREATE INDEX "inquiry_replay_runs_inquiry_case_id_started_at_idx" ON "inquiry_replay_runs"("inquiry_case_id", "started_at");

-- CreateIndex
CREATE INDEX "inquiry_replay_runs_status_idx" ON "inquiry_replay_runs"("status");

-- CreateIndex
CREATE INDEX "inquiry_business_events_inquiry_case_id_occurred_at_idx" ON "inquiry_business_events"("inquiry_case_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inquiry_business_events_email_message_id_idx" ON "inquiry_business_events"("email_message_id");

-- CreateIndex
CREATE INDEX "inquiry_business_events_analysis_decision_id_idx" ON "inquiry_business_events"("analysis_decision_id");

-- CreateIndex
CREATE INDEX "inquiry_business_events_event_type_idx" ON "inquiry_business_events"("event_type");

-- CreateIndex
CREATE INDEX "inquiry_business_events_replay_run_id_idx" ON "inquiry_business_events"("replay_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_state_decisions_analysis_decision_id_key" ON "inquiry_state_decisions"("analysis_decision_id");

-- CreateIndex
CREATE INDEX "inquiry_state_decisions_inquiry_case_id_event_occurred_at_idx" ON "inquiry_state_decisions"("inquiry_case_id", "event_occurred_at");

-- CreateIndex
CREATE INDEX "inquiry_state_decisions_execution_status_idx" ON "inquiry_state_decisions"("execution_status");

-- CreateIndex
CREATE INDEX "inquiry_state_decisions_replay_run_id_idx" ON "inquiry_state_decisions"("replay_run_id");

-- CreateIndex
CREATE INDEX "inquiry_state_transitions_inquiry_case_id_event_occurred_at_idx" ON "inquiry_state_transitions"("inquiry_case_id", "event_occurred_at");

-- CreateIndex
CREATE INDEX "inquiry_state_transitions_replay_run_id_idx" ON "inquiry_state_transitions"("replay_run_id");

-- CreateIndex
CREATE INDEX "inquiry_state_transitions_state_decision_id_idx" ON "inquiry_state_transitions"("state_decision_id");

-- CreateIndex
CREATE INDEX "email_recovery_records_inquiry_case_id_idx" ON "email_recovery_records"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "email_recovery_records_recovery_status_idx" ON "email_recovery_records"("recovery_status");

-- CreateIndex
CREATE UNIQUE INDEX "email_recovery_records_trigger_email_id_recovered_email_id_key" ON "email_recovery_records"("trigger_email_id", "recovered_email_id");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_structured_facts_inquiry_case_id_key" ON "inquiry_structured_facts"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "inquiry_structured_facts_product_type_idx" ON "inquiry_structured_facts"("product_type");

-- CreateIndex
CREATE UNIQUE INDEX "reply_drafts_idempotency_key_key" ON "reply_drafts"("idempotency_key");

-- CreateIndex
CREATE INDEX "reply_drafts_inquiry_case_id_idx" ON "reply_drafts"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "reply_drafts_status_idx" ON "reply_drafts"("status");

-- CreateIndex
CREATE INDEX "reply_drafts_source_email_message_id_idx" ON "reply_drafts"("source_email_message_id");

-- CreateIndex
CREATE INDEX "reply_drafts_sent_email_message_id_idx" ON "reply_drafts"("sent_email_message_id");

-- CreateIndex
CREATE INDEX "reply_drafts_email_analysis_decision_id_idx" ON "reply_drafts"("email_analysis_decision_id");

-- CreateIndex
CREATE INDEX "reply_draft_attachments_email_attachment_id_idx" ON "reply_draft_attachments"("email_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_send_attempts_idempotency_key_key" ON "email_send_attempts"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_send_attempts_reply_draft_id_idx" ON "email_send_attempts"("reply_draft_id");

-- CreateIndex
CREATE INDEX "email_send_attempts_inquiry_case_id_idx" ON "email_send_attempts"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "email_send_attempts_status_idx" ON "email_send_attempts"("status");

-- CreateIndex
CREATE INDEX "email_send_attempts_started_at_idx" ON "email_send_attempts"("started_at");

-- CreateIndex
CREATE INDEX "ai_context_snapshots_inquiry_case_id_idx" ON "ai_context_snapshots"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "ai_context_snapshots_email_message_id_idx" ON "ai_context_snapshots"("email_message_id");

-- CreateIndex
CREATE INDEX "ai_context_snapshots_created_at_idx" ON "ai_context_snapshots"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_context_summaries_inquiry_case_id_key" ON "inquiry_context_summaries"("inquiry_case_id");

-- CreateIndex
CREATE INDEX "inquiry_context_summaries_updated_at_idx" ON "inquiry_context_summaries"("updated_at");

-- AddForeignKey
ALTER TABLE "mailbox_sync_states" ADD CONSTRAINT "mailbox_sync_states_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_email_thread_id_fkey" FOREIGN KEY ("email_thread_id") REFERENCES "email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_cases" ADD CONSTRAINT "inquiry_cases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_cases" ADD CONSTRAINT "inquiry_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_cases" ADD CONSTRAINT "inquiry_cases_primary_customer_id_fkey" FOREIGN KEY ("primary_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_analysis_decisions" ADD CONSTRAINT "email_analysis_decisions_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_analysis_decisions" ADD CONSTRAINT "email_analysis_decisions_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_processing_mode_transitions" ADD CONSTRAINT "inquiry_processing_mode_transitions_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replay_runs" ADD CONSTRAINT "inquiry_replay_runs_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_business_events" ADD CONSTRAINT "inquiry_business_events_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_business_events" ADD CONSTRAINT "inquiry_business_events_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_business_events" ADD CONSTRAINT "inquiry_business_events_analysis_decision_id_fkey" FOREIGN KEY ("analysis_decision_id") REFERENCES "email_analysis_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_business_events" ADD CONSTRAINT "inquiry_business_events_corrected_event_id_fkey" FOREIGN KEY ("corrected_event_id") REFERENCES "inquiry_business_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_state_decisions" ADD CONSTRAINT "inquiry_state_decisions_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_state_decisions" ADD CONSTRAINT "inquiry_state_decisions_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_state_decisions" ADD CONSTRAINT "inquiry_state_decisions_analysis_decision_id_fkey" FOREIGN KEY ("analysis_decision_id") REFERENCES "email_analysis_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_state_transitions" ADD CONSTRAINT "inquiry_state_transitions_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_state_transitions" ADD CONSTRAINT "inquiry_state_transitions_state_decision_id_fkey" FOREIGN KEY ("state_decision_id") REFERENCES "inquiry_state_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recovery_records" ADD CONSTRAINT "email_recovery_records_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recovery_records" ADD CONSTRAINT "email_recovery_records_trigger_email_id_fkey" FOREIGN KEY ("trigger_email_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recovery_records" ADD CONSTRAINT "email_recovery_records_recovered_email_id_fkey" FOREIGN KEY ("recovered_email_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_structured_facts" ADD CONSTRAINT "inquiry_structured_facts_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_structured_facts" ADD CONSTRAINT "inquiry_structured_facts_updated_from_email_message_id_fkey" FOREIGN KEY ("updated_from_email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_source_email_message_id_fkey" FOREIGN KEY ("source_email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_sent_email_message_id_fkey" FOREIGN KEY ("sent_email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_email_analysis_decision_id_fkey" FOREIGN KEY ("email_analysis_decision_id") REFERENCES "email_analysis_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_draft_attachments" ADD CONSTRAINT "reply_draft_attachments_reply_draft_id_fkey" FOREIGN KEY ("reply_draft_id") REFERENCES "reply_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_draft_attachments" ADD CONSTRAINT "reply_draft_attachments_email_attachment_id_fkey" FOREIGN KEY ("email_attachment_id") REFERENCES "email_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_attempts" ADD CONSTRAINT "email_send_attempts_reply_draft_id_fkey" FOREIGN KEY ("reply_draft_id") REFERENCES "reply_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_attempts" ADD CONSTRAINT "email_send_attempts_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_attempts" ADD CONSTRAINT "email_send_attempts_outbound_email_message_id_fkey" FOREIGN KEY ("outbound_email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_snapshots" ADD CONSTRAINT "ai_context_snapshots_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_snapshots" ADD CONSTRAINT "ai_context_snapshots_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_context_summaries" ADD CONSTRAINT "inquiry_context_summaries_inquiry_case_id_fkey" FOREIGN KEY ("inquiry_case_id") REFERENCES "inquiry_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
