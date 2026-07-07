import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { FindInquiryForInboundEmailUseCase } from '../../../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryMessageRelationType } from '../../../inquiry/domain/enums/inquiry-message-relation-type.enum.js';
import { isOwnEmail } from '../../../../common/email/own-email-address.js';
import { EmailThread } from '../../domain/entities/email-thread.entity.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { EmailThreadRepository } from '../ports/email-thread.repository.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';
import { EmailContentSanitizer } from '../services/email-content-sanitizer.js';
import { isRelayDomain, extractContactInfoFromBody } from '../services/email-relay-extractor.js';
import { EMAIL_THREAD_REPOSITORY } from '../../email.tokens.js';

export interface ReceiveInboundEmailResult {
  emailMessage: EmailMessage;
  inquiryCase?: InquiryCase;
  skippedReason?: 'own_email_without_matching_inquiry';
}

export class ReceiveInboundEmailUseCase {
  constructor(
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly createInquiryFromEmailUseCase: CreateInquiryFromEmailUseCase,
    @Inject(EMAIL_THREAD_REPOSITORY) private readonly emailThreadRepository: EmailThreadRepository,
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

    // 中转服务检测：来自已知中转域名的邮件，从正文提取真实客户邮箱/姓名
    // （如 tatasoft.com 网站留言表单，Envelope From 为中转服务而非客户）
    if (isRelayDomain(inboundEmail.fromEmail)) {
      const relayInfo = extractContactInfoFromBody(inboundEmail.bodyText);
      if (relayInfo?.email) {
        inboundEmail.fromEmail = relayInfo.email;
        if (relayInfo.name) {
          inboundEmail.fromName = relayInfo.name;
        }
      }
    }

    // 解析/创建邮件线程：先确保 email_threads 记录存在，email_messages 才能引用
    const thread = await this.resolveOrCreateThread(inboundEmail);

    const emailMessage: EmailMessage = {
      id: emailMessageId,
      externalMessageId: inboundEmail.messageId,
      threadId: thread.id,
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

  /**
   * 根据入站邮件解析或创建 EmailThread。
   *
   * 规则：
   *  - 如果 inboundEmail.threadId 存在（回复邮件），用其值作为 threadKey
   *    → 按 (mailboxAccountId, threadKey) 查找已有线程
   *    → 如未找到则创建新线程（threadKey = 父消息 ID）
   *  - 如果 inboundEmail.threadId 不存在（首封邮件），用自己的 messageId 作为 threadKey
   */
  private async resolveOrCreateThread(inboundEmail: InboundEmail): Promise<EmailThread> {
    const threadKey = inboundEmail.threadId || inboundEmail.messageId;

    const existing = await this.emailThreadRepository.findByThreadKey(
      inboundEmail.mailboxAccountId,
      threadKey,
    );
    if (existing) return existing;

    return this.emailThreadRepository.create({
      id: `thread_${randomUUID()}`,
      mailboxAccountId: inboundEmail.mailboxAccountId,
      threadKey,
      externalThreadId: inboundEmail.threadId,
      customerEmail: inboundEmail.fromEmail,
      latestMessageAt: inboundEmail.receivedAt,
    });
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
