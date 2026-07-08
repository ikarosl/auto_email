import { InquiryContextSummaryRepository } from '../../application/ports/inquiry-context-summary.repository.js';
import { InquiryContextSummary } from '../../domain/entities/inquiry-context-summary.entity.js';

export class InMemoryInquiryContextSummaryRepository implements InquiryContextSummaryRepository {
  private readonly summaries = new Map<string, InquiryContextSummary>();

  async save(summary: InquiryContextSummary): Promise<InquiryContextSummary> {
    this.summaries.set(summary.inquiryCaseId, summary);
    return summary;
  }

  async findByInquiryCaseId(inquiryCaseId: string): Promise<InquiryContextSummary | undefined> {
    return this.summaries.get(inquiryCaseId);
  }
}
