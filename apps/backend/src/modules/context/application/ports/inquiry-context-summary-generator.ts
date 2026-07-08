import { AiEmailThreadMessageContext } from '../dto/ai-email-analysis-context.schema.js';
import { InquiryContextSummaryGenerationResult } from '../dto/inquiry-context-summary-generation.schema.js';
import { InquiryContextSummary } from '../../domain/entities/inquiry-context-summary.entity.js';

export interface GenerateInquiryContextSummaryInput {
  inquiryCaseId: string;
  existingSummary?: InquiryContextSummary;
  messagesToSummarize: AiEmailThreadMessageContext[];
}

export interface InquiryContextSummaryGenerator {
  generate(input: GenerateInquiryContextSummaryInput): Promise<InquiryContextSummaryGenerationResult>;
}
