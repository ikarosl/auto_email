import { z } from 'zod';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '../../../inquiry/domain/enums/inquiry-state.enum.js';

const dateTimeStringSchema = z.string().trim().min(1);
const cleanBodySchema = z.string().trim().min(1);
const nonEmptyStringArraySchema = z.array(z.string().trim().min(1));

export const aiEmailAttachmentContextSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  fileSize: z.number().nonnegative(),
  parseStatus: z.enum(['parsed', 'skipped', 'failed']),
  textSource: z.enum(['pdf_text', 'plain_text', 'ocr', 'none']).optional(),
  parsedTextPreview: z.string().trim().optional(),
  parsedText: z.string().trim().optional(),
  parseErrorCode: z.string().trim().optional(),
  ocrStatus: z.enum(['pending', 'skipped', 'parsed', 'failed']).optional(),
  ocrTextPreview: z.string().trim().optional(),
  ocrText: z.string().trim().optional(),
  ocrErrorCode: z.string().trim().optional(),
  truncated: z.boolean().optional(),
});

export const aiEmailThreadMessageContextSchema = z.object({
  direction: z.nativeEnum(EmailDirection),
  from: z.string().trim().min(1),
  to: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  receivedAt: dateTimeStringSchema,
  cleanBody: cleanBodySchema,
  attachments: z.array(aiEmailAttachmentContextSchema).optional(),
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

export const aiEmailThreadSummaryContextSchema = z.object({
  summaryText: z.string().trim().min(1),
  coveredMessageCount: z.number().int().nonnegative(),
  coveredTimeRange: z.object({
    from: dateTimeStringSchema,
    to: dateTimeStringSchema,
  }).refine(
    (range) => Date.parse(range.from) <= Date.parse(range.to),
    { message: 'coveredTimeRange.from must be before or equal to coveredTimeRange.to' },
  ),
  knownFacts: nonEmptyStringArraySchema,
  customerDecisions: nonEmptyStringArraySchema,
  ourCommitments: nonEmptyStringArraySchema,
  openQuestions: nonEmptyStringArraySchema,
});

export const aiEmailAnalysisContextPayloadSchema = z.object({
  inquiryState: z.object({
    businessStage: z.nativeEnum(InquiryBusinessStage),
    actionOwner: z.nativeEnum(InquiryActionOwner),
    lifecycleStatus: z.nativeEnum(InquiryLifecycleStatus),
    stateVersion: z.number().int().nonnegative(),
    customerEmail: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    latestMessageAt: dateTimeStringSchema,
  }),
  threadSummary: aiEmailThreadSummaryContextSchema.optional(),
  recentThreadMessages: z.array(aiEmailThreadMessageContextSchema),
  ragReferences: z.array(aiEmailRagReferenceContextSchema),
  currentEmail: aiEmailCurrentMessageContextSchema,
  humanInstructions: z.string().trim().min(1).optional(),
  outputInstruction: z.object({
    format: z.literal('json_only'),
    schema: z.record(z.string(), z.string()),
  }),
});

export type AiEmailAttachmentContext = z.infer<typeof aiEmailAttachmentContextSchema>;
export type AiEmailThreadMessageContext = z.infer<typeof aiEmailThreadMessageContextSchema>;
export type AiEmailCurrentMessageContext = z.infer<typeof aiEmailCurrentMessageContextSchema>;
export type AiEmailRagReferenceContext = z.infer<typeof aiEmailRagReferenceContextSchema>;
export type AiEmailThreadSummaryContext = z.infer<typeof aiEmailThreadSummaryContextSchema>;
export type AiEmailAnalysisContextPayload = z.infer<typeof aiEmailAnalysisContextPayloadSchema>;
