import { randomUUID } from 'node:crypto';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { FindInquiryForInboundEmailUseCase } from '../../../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryMessageRelationType } from '../../../inquiry/domain/enums/inquiry-message-relation-type.enum.js';
import { isOwnEmail } from '../../../../common/email/own-email-address.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';
import { EmailContentSanitizer } from '../services/email-content-sanitizer.js';

export interface ReceiveInboundEmailResult {
  emailMessage: EmailMessage;
  inquiryCase?: InquiryCase;
  skippedReason?: 'own_email_without_matching_inquiry';
}

export class ReceiveInboundEmailUseCase {
  constructor(
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly createInquiryFromEmailUseCase: CreateInquiryFromEmailUseCase,
    private readonly findInquiryForInboundEmailUseCase?: FindInquiryForInboundEmailUseCase,
    private readonly inquiryMessageRepository?: InquiryMessageRepository,
    private readonly emailContentSanitizer = new EmailContentSanitizer(),
  ) {}

  async execute(inboundEmail: InboundEmail): Promise<ReceiveInboundEmailResult> {
    const existingEmail = await this.emailMessageRepository.findByExternalMessageId(inboundEmail.messageId);
    if (existingEmail) {
      const inquiryCase = await this.findOrCreateInquiryForEmail(existingEmail);
      return {
        emailMessage: existingEmail,
        inquiryCase: inquiryCase ?? undefined,
        skippedReason: inquiryCase ? undefined : 'own_email_without_matching_inquiry',
      };
    }

    const emailMessageId = `email_${randomUUID()}`;
    const cleanedBodyText = this.emailContentSanitizer.sanitize(
      inboundEmail.bodyText,
      inboundEmail.bodyHtml,
      {
        emailMessageId,
        externalMessageId: inboundEmail.messageId,
        fromEmail: inboundEmail.fromEmail,
        subject: inboundEmail.subject,
        sourceKind: inboundEmail.source,
      },
    );
    const emailMessage: EmailMessage = {
      id: emailMessageId,
      externalMessageId: inboundEmail.messageId,
      threadId: inboundEmail.threadId,
      direction: resolveEmailDirection(inboundEmail),
      source: inboundEmail.source,
      fromEmail: inboundEmail.fromEmail,
      fromName: inboundEmail.fromName,
      toEmails: inboundEmail.toEmails,
      ccEmails: inboundEmail.ccEmails,
      subject: inboundEmail.subject,
      bodyText: cleanedBodyText,
      bodyHtml: inboundEmail.bodyHtml,
      receivedAt: inboundEmail.receivedAt,
      raw: inboundEmail.raw,
      createdAt: new Date(),
    };

    const savedEmailMessage = await this.emailMessageRepository.save(emailMessage);
    const inquiryCase = await this.findOrCreateInquiryForEmail(savedEmailMessage);

    return {
      emailMessage: savedEmailMessage,
      inquiryCase: inquiryCase ?? undefined,
      skippedReason: inquiryCase ? undefined : 'own_email_without_matching_inquiry',
    };
  }

  private async findOrCreateInquiryForEmail(emailMessage: EmailMessage): Promise<InquiryCase | undefined> {
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

    if (emailMessage.direction === EmailDirection.OUTBOUND) {
      return undefined;
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

function resolveEmailDirection(inboundEmail: InboundEmail): EmailDirection {
  if (!isOwnEmail(inboundEmail.fromEmail)) {
    return EmailDirection.INBOUND;
  }

  return EmailDirection.OUTBOUND;
}
