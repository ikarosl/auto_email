import { z } from 'zod';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';

export const outboundEmailEventTypeSchema = z.enum([
  'customer_response_requested',
  'engineer_review_acknowledgement',
  'technical_solution_sent',
  'commercial_terms_sent',
  'formal_quote_sent',
  'contract_sent',
  'general_correspondence',
  'unrelated_internal',
]);

export const outboundEmailEventAnalysisSchema = z.object({
  eventType: outboundEmailEventTypeSchema,
  responseExpected: z.boolean(),
  suggestedStatus: z.nativeEnum(InquiryStatus).nullable(),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  commercialBoundaryDetected: z.boolean(),
  humanReviewRequired: z.boolean(),
  reason: z.string().trim().min(1),
});

export const OUTBOUND_EMAIL_EVENT_OUTPUT_SCHEMA: Record<string, string> = {
  eventType: 'customer_response_requested | engineer_review_acknowledgement | technical_solution_sent | commercial_terms_sent | formal_quote_sent | contract_sent | general_correspondence | unrelated_internal',
  responseExpected: 'boolean',
  suggestedStatus: 'new | need_clarification | waiting_customer | need_engineer_review | ready_for_quote | quoted | closed | invalid | null',
  confidence: 'number between 0 and 1',
  riskLevel: 'low | medium | high',
  commercialBoundaryDetected: 'boolean',
  humanReviewRequired: 'boolean',
  reason: 'string',
};

export type OutboundEmailEventAnalysis = z.infer<typeof outboundEmailEventAnalysisSchema>;
export type OutboundEmailEventType = z.infer<typeof outboundEmailEventTypeSchema>;
