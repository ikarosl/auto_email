import { randomUUID } from 'node:crypto';

import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';
import { extractEmailDomain } from '../../domain/matching/email-domain-policy.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';

export interface CreateInquiryFromEmailResult {
  inquiryCase: InquiryCase;
}

export class CreateInquiryFromEmailUseCase {
  constructor(private readonly inquiryRepository: InquiryRepository) {}

  async execute(emailMessage: EmailMessage): Promise<CreateInquiryFromEmailResult> {
    const now = new Date();
    const inquiryCase: InquiryCase = {
      id: `inquiry_${randomUUID()}`,
      sourceEmailMessageId: emailMessage.id,
      customerEmail: emailMessage.fromEmail,
      customerName: emailMessage.fromName,
      customerDomain: extractEmailDomain(emailMessage.fromEmail),
      subject: emailMessage.subject,
      rawSubject: emailMessage.subject,
      businessSubject: emailMessage.subject,
      businessSubjectSource: 'raw_email',
      businessSubjectLocked: false,
      businessSubjectUpdatedAt: now,
      status: InquiryStatus.NEW,
      latestMessageAt: emailMessage.receivedAt,
      createdAt: now,
      updatedAt: now,
    };

    return {
      inquiryCase: await this.inquiryRepository.save(inquiryCase),
    };
  }

  async saveExistingInquiry(inquiryCase: InquiryCase): Promise<InquiryCase> {
    return this.inquiryRepository.save(inquiryCase);
  }

  async ensureCustomerContactFromEmail(emailMessage: EmailMessage): Promise<void> {
    await this.inquiryRepository.ensureCustomerContact({
      email: emailMessage.fromEmail,
      name: emailMessage.fromName,
    });
  }
}
