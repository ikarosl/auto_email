import { z } from 'zod';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';

const dateTimeStringSchema = z.string().trim().min(1);
const cleanBodySchema = z.string().trim().min(1);

export const aiEmailThreadMessageContextSchema = z.object({
  direction: z.nativeEnum(EmailDirection),
  from: z.string().trim().min(1),
  to: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  receivedAt: dateTimeStringSchema,
  cleanBody: cleanBodySchema,
});

export const aiEmailCurrentMessageContextSchema = aiEmailThreadMessageContextSchema.extend({
  to: z.string().trim().min(1),
  subject: z.string().trim().min(1),
});

export const aiEmailRagReferenceContextSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  score: z.number().optional(),
});

export const aiEmailAnalysisContextPayloadSchema = z.object({
  inquiryState: z.object({
    status: z.nativeEnum(InquiryStatus),
    customerEmail: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    latestMessageAt: dateTimeStringSchema,
  }),
  recentThreadMessages: z.array(aiEmailThreadMessageContextSchema),
  ragReferences: z.array(aiEmailRagReferenceContextSchema),
  currentEmail: aiEmailCurrentMessageContextSchema,
  outputInstruction: z.object({
    format: z.literal('json_only'),
    schema: z.record(z.string(), z.string()),
  }),
});

export type AiEmailThreadMessageContext = z.infer<typeof aiEmailThreadMessageContextSchema>;
export type AiEmailCurrentMessageContext = z.infer<typeof aiEmailCurrentMessageContextSchema>;
export type AiEmailRagReferenceContext = z.infer<typeof aiEmailRagReferenceContextSchema>;
export type AiEmailAnalysisContextPayload = z.infer<typeof aiEmailAnalysisContextPayloadSchema>;
