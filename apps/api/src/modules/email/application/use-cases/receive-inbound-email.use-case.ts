import { randomUUID } from 'node:crypto';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';

export interface ReceiveInboundEmailResult {
  emailMessage: EmailMessage;
  inquiryCase: InquiryCase;
}

export class ReceiveInboundEmailUseCase {
  constructor(
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly createInquiryFromEmailUseCase: CreateInquiryFromEmailUseCase,
  ) {}

  async execute(inboundEmail: InboundEmail): Promise<ReceiveInboundEmailResult> {
    const existingEmail = await this.emailMessageRepository.findByExternalMessageId(inboundEmail.messageId);
    if (existingEmail) {
      const { inquiryCase } = await this.createInquiryFromEmailUseCase.execute(existingEmail);
      return {
        emailMessage: existingEmail,
        inquiryCase,
      };
    }

    const emailMessage: EmailMessage = {
      id: `email_${randomUUID()}`,
      externalMessageId: inboundEmail.messageId,
      threadId: inboundEmail.threadId,
      direction: EmailDirection.INBOUND,
      source: inboundEmail.source,
      fromEmail: inboundEmail.fromEmail,
      fromName: inboundEmail.fromName,
      toEmails: inboundEmail.toEmails,
      ccEmails: inboundEmail.ccEmails,
      subject: inboundEmail.subject,
      bodyText: inboundEmail.bodyText,
      bodyHtml: inboundEmail.bodyHtml,
      receivedAt: inboundEmail.receivedAt,
      raw: inboundEmail.raw,
      createdAt: new Date(),
    };

    const savedEmailMessage = await this.emailMessageRepository.save(emailMessage);
    const { inquiryCase } = await this.createInquiryFromEmailUseCase.execute(savedEmailMessage);

    return {
      emailMessage: savedEmailMessage,
      inquiryCase,
    };
  }
}
