import { z } from 'zod';

export const inquiryContextSummaryGenerationSchema = z.object({
  summaryText: z.string().trim().min(1),
  knownFacts: z.array(z.string().trim().min(1)),
  customerDecisions: z.array(z.string().trim().min(1)),
  ourCommitments: z.array(z.string().trim().min(1)),
  openQuestions: z.array(z.string().trim().min(1)),
});

export type InquiryContextSummaryGenerationResult = z.infer<
  typeof inquiryContextSummaryGenerationSchema
>;
