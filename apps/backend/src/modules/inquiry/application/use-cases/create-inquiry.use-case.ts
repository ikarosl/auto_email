import { randomUUID } from 'node:crypto';

import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import { INITIAL_INQUIRY_STATE } from '../../domain/enums/inquiry-state.enum.js';
import { extractEmailDomain } from '../../domain/matching/email-domain-policy.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';

export interface CreateInquiryInput {
  customerEmail: string;
  customerName?: string;
  subject: string;
  latestMessageAt?: Date;
}

export class CreateInquiryUseCase {
  constructor(private readonly inquiryRepository: InquiryRepository) {}

  async execute(input: CreateInquiryInput): Promise<InquiryCase> {
    const now = new Date();
    const inquiryCase: InquiryCase = {
      id: `inquiry_${randomUUID()}`,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerDomain: extractEmailDomain(input.customerEmail),
      subject: input.subject,
      rawSubject: input.subject,
      businessSubject: input.subject,
      businessSubjectSource: 'human',
      businessSubjectLocked: false,
      businessSubjectUpdatedAt: now,
      ...INITIAL_INQUIRY_STATE,
      latestMessageAt: input.latestMessageAt ?? now,
      createdAt: now,
      updatedAt: now,
    };

    return this.inquiryRepository.save(inquiryCase);
  }
}
