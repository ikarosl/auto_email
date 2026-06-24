import { randomUUID } from 'node:crypto';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { FindInquiryForInboundEmailUseCase } from '../../../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryMessageRelationType } from '../../../inquiry/domain/enums/inquiry-message-relation-type.enum.js';
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
    private readonly findInquiryForInboundEmailUseCase?: FindInquiryForInboundEmailUseCase,
    private readonly inquiryMessageRepository?: InquiryMessageRepository,
  ) {}

  async execute(inboundEmail: InboundEmail): Promise<ReceiveInboundEmailResult> {
    const existingEmail = await this.emailMessageRepository.findByExternalMessageId(inboundEmail.messageId);
    if (existingEmail) {
      const inquiryCase = await this.findOrCreateInquiryForEmail(existingEmail);
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
    const inquiryCase = await this.findOrCreateInquiryForEmail(savedEmailMessage);

    return {
      emailMessage: savedEmailMessage,
      inquiryCase,
    };
  }

  private async findOrCreateInquiryForEmail(emailMessage: EmailMessage): Promise<InquiryCase> {
    if (this.findInquiryForInboundEmailUseCase && this.inquiryMessageRepository) {
      const match = await this.findInquiryForInboundEmailUseCase.execute(emailMessage);
      if (match.matched && match.inquiryCase) {
        const updatedInquiryCase: InquiryCase = {
          ...match.inquiryCase,
          latestMessageAt: emailMessage.receivedAt,
          updatedAt: new Date(),
        };

        await this.createInquiryFromEmailUseCase.saveExistingInquiry(updatedInquiryCase);
        await this.linkEmailToInquiry(
          emailMessage,
          updatedInquiryCase,
          InquiryMessageRelationType.REPLY,
        );
        return updatedInquiryCase;
      }
    }

    const { inquiryCase } = await this.createInquiryFromEmailUseCase.execute(emailMessage);
    await this.linkEmailToInquiry(
      emailMessage,
      inquiryCase,
      InquiryMessageRelationType.ORIGINAL,
    );
    return inquiryCase;
  }

  private async linkEmailToInquiry(
    emailMessage: EmailMessage,
    inquiryCase: InquiryCase,
    relationType: InquiryMessageRelationType,
  ): Promise<void> {
    if (!this.inquiryMessageRepository) {
      return;
    }

    await this.inquiryMessageRepository.save({
      id: `inquiry_message_${randomUUID()}`,
      inquiryCaseId: inquiryCase.id,
      emailMessageId: emailMessage.id,
      direction: emailMessage.direction,
      relationType,
      createdAt: new Date(),
    });
  }
}
