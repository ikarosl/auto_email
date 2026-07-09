import { z } from 'zod';

export const businessSubjectSchema = z.object({
  businessSubject: z.string().trim().min(1).max(200),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1),
});

export type BusinessSubjectOutput = z.infer<typeof businessSubjectSchema>;
