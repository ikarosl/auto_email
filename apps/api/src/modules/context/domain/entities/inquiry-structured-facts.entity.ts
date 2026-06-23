import { StructuredRequirements } from '../value-objects/structured-requirements.vo.js';

export interface InquiryStructuredFacts {
  inquiryCaseId: string;
  customerRequirements: StructuredRequirements;
  missingFields: string[];
  confirmedFields: string[];
  openQuestions: string[];
  constraints: string[];
  sourceEmailIds: string[];
  updatedAt: Date;
}
