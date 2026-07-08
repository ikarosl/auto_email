import { InquiryContextSummary } from '../../domain/entities/inquiry-context-summary.entity.js';

export interface InquiryContextSummaryRepository {
  save(summary: InquiryContextSummary): Promise<InquiryContextSummary>;
  findByInquiryCaseId(inquiryCaseId: string): Promise<InquiryContextSummary | undefined>;
}
