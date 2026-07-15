import { z } from 'zod';

import {
  AI_BUSINESS_EVENT_TYPES,
  InquiryBusinessEventActor,
} from '../../../inquiry/domain/enums/inquiry-business-event.enum.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '../../../inquiry/domain/enums/inquiry-state.enum.js';

const extractedRequirementValueSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .optional();

export const emailWorkflowAnalysisSchema = z.object({
  isInquiry: z.boolean(),
  messageClassification: z.enum([
    'customer_inquiry',
    'customer_follow_up',
    'our_response',
    'internal',
    'invalid',
    'unrelated_product',
    'commercial_solicitation',
    'unknown',
  ]),
  inquiryScope: z.object({
    type: z.enum(['single_product', 'multiple_products', 'uncertain']),
    relationshipToExistingInquiry: z.enum([
      'same_requirement',
      'replacement_requirement',
      'additional_independent_requirement',
      'separate_new_inquiry',
      'not_applicable',
      'uncertain',
    ]),
    confidence: z.number().min(0).max(1),
    detectedProducts: z.array(z.string().trim().min(1)).default([]),
  }),
  events: z.array(z.object({
    eventType: z.enum(AI_BUSINESS_EVENT_TYPES),
    actor: z.enum([
      InquiryBusinessEventActor.CUSTOMER,
      InquiryBusinessEventActor.US,
      InquiryBusinessEventActor.SYSTEM,
    ]),
    confidence: z.number().min(0).max(1),
    evidence: z.string().trim().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  })).min(1),
  suggestedState: z.object({
    businessStage: z.nativeEnum(InquiryBusinessStage),
    actionOwner: z.nativeEnum(InquiryActionOwner),
    lifecycleStatus: z.nativeEnum(InquiryLifecycleStatus),
  }),
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
}).superRefine((value, context) => {
  if (
    value.suggestedState.lifecycleStatus !== InquiryLifecycleStatus.ACTIVE &&
    value.suggestedState.actionOwner !== InquiryActionOwner.NONE
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['suggestedState', 'actionOwner'],
      message: 'Terminal lifecycle states require actionOwner=none.',
    });
  }
});

export const emailAiAnalysisSchema = emailWorkflowAnalysisSchema;
export type EmailWorkflowAnalysisSchemaOutput = z.infer<typeof emailWorkflowAnalysisSchema>;
export type EmailAiAnalysisSchemaOutput = EmailWorkflowAnalysisSchemaOutput;
