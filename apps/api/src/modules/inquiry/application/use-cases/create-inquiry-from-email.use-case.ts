import { randomUUID } from 'node:crypto';

import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';
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
      subject: emailMessage.subject,
      status: InquiryStatus.NEW,
      latestMessageAt: emailMessage.receivedAt,
      createdAt: now,
      updatedAt: now,
    };

    return {
      inquiryCase: await this.inquiryRepository.save(inquiryCase),
    };
  }
}
