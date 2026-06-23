import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';

export type EmailInquiryClassification =
  | 'valid_inquiry'
  | 'invalid'
  | 'unrelated_product'
  | 'commercial'
  | 'unknown';

export type EmailAiRiskLevel = 'low' | 'medium' | 'high';

export interface EmailExtractedRequirements {
  productType?: string;
  frequencyRange?: string;
  power?: string;
  quantity?: string;
  sizeRequirement?: string;
  application?: string;
}

export interface EmailAiAnalysis {
  isInquiry: boolean;
  classification: EmailInquiryClassification;
  suggestedStatus: InquiryStatus;
  confidence: number;
  riskLevel: EmailAiRiskLevel;
  reason: string;
  missingFields: string[];
  extractedRequirements: EmailExtractedRequirements;
  quoteBoundaryDetected: boolean;
  humanReviewRequired: boolean;
  nextAction: string;
}
