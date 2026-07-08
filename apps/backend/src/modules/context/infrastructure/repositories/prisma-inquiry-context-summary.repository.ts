import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryContextSummaryRepository } from '../../application/ports/inquiry-context-summary.repository.js';
import { InquiryContextSummary } from '../../domain/entities/inquiry-context-summary.entity.js';

interface InquiryContextSummaryRecord {
  id: string;
  inquiry_case_id: string;
  summary_text: string;
  known_facts_json: unknown;
  customer_decisions_json: unknown;
  our_commitments_json: unknown;
  open_questions_json: unknown;
  covered_email_ids_json: unknown;
  covered_message_count: number;
  covered_from: Date | null;
  covered_to: Date | null;
  updated_at: Date;
}

export class PrismaInquiryContextSummaryRepository implements InquiryContextSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(summary: InquiryContextSummary): Promise<InquiryContextSummary> {
    const rows = await this.prisma.$queryRaw<InquiryContextSummaryRecord[]>`
      INSERT INTO inquiry_context_summaries (
        inquiry_case_id,
        summary_text,
        known_facts_json,
        customer_decisions_json,
        our_commitments_json,
        open_questions_json,
        covered_email_ids_json,
        covered_message_count,
        covered_from,
        covered_to,
        updated_at
      )
      VALUES (
        ${summary.inquiryCaseId},
        ${summary.summaryText},
        CAST(${JSON.stringify(summary.knownFacts)} AS JSONB),
        CAST(${JSON.stringify(summary.customerDecisions)} AS JSONB),
        CAST(${JSON.stringify(summary.ourCommitments)} AS JSONB),
        CAST(${JSON.stringify(summary.openQuestions)} AS JSONB),
        CAST(${JSON.stringify(summary.coveredMessageIds)} AS JSONB),
        ${summary.coveredMessageCount},
        ${summary.coveredFrom ?? null},
        ${summary.coveredTo ?? null},
        ${summary.updatedAt}
      )
      ON CONFLICT (inquiry_case_id)
      DO UPDATE SET
        summary_text = EXCLUDED.summary_text,
        known_facts_json = EXCLUDED.known_facts_json,
        customer_decisions_json = EXCLUDED.customer_decisions_json,
        our_commitments_json = EXCLUDED.our_commitments_json,
        open_questions_json = EXCLUDED.open_questions_json,
        covered_email_ids_json = EXCLUDED.covered_email_ids_json,
        covered_message_count = EXCLUDED.covered_message_count,
        covered_from = EXCLUDED.covered_from,
        covered_to = EXCLUDED.covered_to,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;

    return toDomain(rows[0]);
  }

  async findByInquiryCaseId(inquiryCaseId: string): Promise<InquiryContextSummary | undefined> {
    const rows = await this.prisma.$queryRaw<InquiryContextSummaryRecord[]>`
      SELECT *
      FROM inquiry_context_summaries
      WHERE inquiry_case_id = ${inquiryCaseId}
      LIMIT 1
    `;

    return rows[0] ? toDomain(rows[0]) : undefined;
  }
}

function toDomain(record: InquiryContextSummaryRecord | undefined): InquiryContextSummary {
  if (!record) {
    throw new Error('Inquiry context summary record is missing.');
  }

  return {
    id: record.id,
    inquiryCaseId: record.inquiry_case_id,
    summaryText: record.summary_text,
    knownFacts: asStringArray(record.known_facts_json),
    customerDecisions: asStringArray(record.customer_decisions_json),
    ourCommitments: asStringArray(record.our_commitments_json),
    openQuestions: asStringArray(record.open_questions_json),
    coveredMessageIds: asStringArray(record.covered_email_ids_json),
    coveredMessageCount: record.covered_message_count,
    coveredFrom: record.covered_from ?? undefined,
    coveredTo: record.covered_to ?? undefined,
    updatedAt: record.updated_at,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
