import { z } from 'zod';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';

const extractedRequirementValueSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .optional();

export const emailAiAnalysisSchema = z
  .object({
    isInquiry: z.boolean(),
    classification: z.enum([
      'valid_inquiry',
      'invalid',
      'unknown',
    ]),
    suggestedStatus: z.nativeEnum(InquiryStatus),
    confidence: z.number().min(0).max(1),
    riskLevel: z.enum(['low', 'medium', 'high']),
    reason: z.string().trim().min(1),
    missingFields: z.array(z.string()),
    extractedRequirements: z.object({
      productType: extractedRequirementValueSchema,
      structureType: extractedRequirementValueSchema,
      frequencyRange: extractedRequirementValueSchema,
      power: extractedRequirementValueSchema,
      insertionLoss: extractedRequirementValueSchema,
      isolation: extractedRequirementValueSchema,
      vswr: extractedRequirementValueSchema,
      connector: extractedRequirementValueSchema,
      quantity: extractedRequirementValueSchema,
      sizeRequirement: extractedRequirementValueSchema,
      application: extractedRequirementValueSchema,
      deliveryRequirement: extractedRequirementValueSchema,
      specialRequirements: extractedRequirementValueSchema,
    }),
    quoteBoundaryDetected: z.boolean(),
    humanReviewRequired: z.boolean(),
    nextAction: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (value.quoteBoundaryDetected && !value.humanReviewRequired) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'quoteBoundaryDetected=true requires humanReviewRequired=true.',
        path: ['humanReviewRequired'],
      });
    }

    if (
      (value.suggestedStatus === InquiryStatus.READY_FOR_QUOTE ||
        value.suggestedStatus === InquiryStatus.QUOTED ||
        value.suggestedStatus === InquiryStatus.CLOSED) &&
      !value.humanReviewRequired
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ready_for_quote, quoted, or closed suggestions require humanReviewRequired=true.',
        path: ['humanReviewRequired'],
      });
    }
  });

export type EmailAiAnalysisSchemaOutput = z.infer<typeof emailAiAnalysisSchema>;
