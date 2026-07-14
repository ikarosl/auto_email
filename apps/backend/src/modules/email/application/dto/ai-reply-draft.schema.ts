import { z } from 'zod';

export const aiReplyDraftSchema = z.object({
  draftType: z.enum([
    'clarification_request',
    'engineer_review_acknowledgement',
    'quote_reply',
    'general_reply',
  ]),
  subject: z.string().trim().min(1),
  bodyText: z.string().trim().min(1),
  language: z.string().trim().min(1),
  usedFacts: z.array(z.string().trim().min(1)),
  unresolvedQuestions: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
  requiresCommercialReview: z.boolean(),
  humanReviewRequired: z.literal(true),
});

export type AiReplyDraftOutput = z.infer<typeof aiReplyDraftSchema>;

export const AI_REPLY_DRAFT_OUTPUT_SCHEMA: Record<string, string> = {
  draftType: 'clarification_request | engineer_review_acknowledgement | quote_reply | general_reply',
  subject: 'string',
  bodyText: 'string',
  language: 'string',
  usedFacts: 'string[]',
  unresolvedQuestions: 'string[]',
  warnings: 'string[]',
  requiresCommercialReview: 'boolean',
  humanReviewRequired: 'true',
};
