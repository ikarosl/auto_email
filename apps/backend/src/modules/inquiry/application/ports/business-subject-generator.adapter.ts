import type { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import type { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';

export interface BusinessSubjectGeneratorInput {
  inquiryCase: InquiryCase;
  currentEmail: EmailMessage;
  knownFacts: {
    productType?: string;
    frequencyRange?: string;
    quantity?: string;
  };
}

export interface BusinessSubjectGeneratorAdapter {
  generate(input: BusinessSubjectGeneratorInput): Promise<string>;
}
