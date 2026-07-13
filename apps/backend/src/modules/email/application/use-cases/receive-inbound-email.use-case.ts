import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
import { recoverParentEmailFromQuote, RecoveredEmail } from '../services/email-quote-recovery.service.js';
import { isRelayDomain, extractContactInfoFromBody } from '../services/email-relay-extractor.js';
import { EMAIL_THREAD_REPOSITORY } from '../../email.tokens.js';
import { SaveEmailAttachmentsUseCase } from './save-email-attachments.use-case.js';

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
    private readonly saveEmailAttachmentsUseCase?: SaveEmailAttachmentsUseCase,
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
    const sanitizeResult = this.emailContentSanitizer.sanitize(
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
    const cleanedBodyText = sanitizeResult.cleaned;

    // Phase 1 调试日志：记录引用文本内容，用于分析 Message-ID 提取策略
    if (sanitizeResult.quotedHistory) {
      writeQuotedRecoveryDebugLog({
        currentEmailMessageId: emailMessageId,
        currentSubject: inboundEmail.subject,
        currentFrom: inboundEmail.fromEmail,
        inReplyTo: inboundEmail.inReplyTo,
        references: inboundEmail.references,
        quotedHistoryChars: sanitizeResult.quotedHistory.length,
        quotedHistoryPreview: truncatePreview(sanitizeResult.quotedHistory, 500),
        hasMessageIdHeader: /^>?\s*Message-ID\s*:/im.test(sanitizeResult.quotedHistory),
        extractedMessageIds: extractMessageIdsFromText(sanitizeResult.quotedHistory),
      });
    }

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

    // ── 引用邮件恢复：从被移除的引用文本中提取缺失邮件 ──
    // 不设 threadId，让 Prisma 仓库通过 externalMessageId(=inReplyTo) 自动匹配线程
    const recoveredEmails: RecoveredEmail[] = await this.tryRecoverMissingEmail(
      sanitizeResult.quotedHistory,
      inboundEmail.inReplyTo,
      inboundEmail.subject,
      inboundEmail.fromEmail,
    );

    const emailMessage: EmailMessage = {
      id: emailMessageId,
      externalMessageId: inboundEmail.messageId,
      emailThreadId: thread.id,
      direction: resolveEmailDirection(inboundEmail),
      source: inboundEmail.source,
      fromEmail: inboundEmail.fromEmail,
      fromName: inboundEmail.fromName,
      toEmails: inboundEmail.toEmails,
      ccEmails: inboundEmail.ccEmails,
      subject: inboundEmail.subject,
      bodyText: cleanedBodyText,
      bodyHtml: inboundEmail.bodyHtml,
      hasAttachments: (inboundEmail.attachments?.length ?? 0) > 0,
      attachmentCount: inboundEmail.attachments?.length ?? 0,
      receivedAt: inboundEmail.receivedAt,
      raw: inboundEmail.raw,
      createdAt: new Date(),
    };

    let savedEmailMessage = await this.emailMessageRepository.save(emailMessage);
    if (this.saveEmailAttachmentsUseCase && inboundEmail.attachments?.length) {
      const attachments = await this.saveEmailAttachmentsUseCase.execute({
        emailMessageId: savedEmailMessage.id,
        attachments: inboundEmail.attachments,
      });
      savedEmailMessage = {
        ...savedEmailMessage,
        hasAttachments: attachments.length > 0,
        attachmentCount: attachments.length,
        attachments: attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.originalFileName ?? attachment.safeFileName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          parseStatus: attachment.parseStatus === 'pending' ? 'skipped' : attachment.parseStatus,
          textSource: attachment.ocrStatus === 'parsed'
            ? 'ocr'
            : attachment.parseStrategy === 'pdf_text'
              ? 'pdf_text'
              : attachment.parseStrategy === 'plain_text'
                ? 'plain_text'
                : 'none',
          parsedTextPreview: attachment.parsedTextPreview,
          parsedText: attachment.parsedText,
          parseErrorCode: attachment.parseErrorCode,
          ocrStatus: attachment.ocrStatus,
          ocrTextPreview: attachment.ocrTextPreview,
          ocrText: attachment.ocrText,
          ocrErrorCode: attachment.ocrErrorCode,
          isContextCandidate: attachment.isContextCandidate,
        })),
      };
    }
    const inquiryCase = await this.findOrCreateInquiryForEmail(savedEmailMessage);

    // 将恢复的邮件关联到同一询盘
    if (inquiryCase && recoveredEmails.length > 0) {
      await this.linkRecoveredEmailsToInquiry(recoveredEmails, inquiryCase);
    }

    if (inquiryCase && this.saveEmailAttachmentsUseCase && inboundEmail.attachments?.length) {
      await this.saveEmailAttachmentsUseCase.updateInquiryCaseId(
        savedEmailMessage.id,
        inquiryCase.id,
      );
    }

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

        if (emailMessage.direction === EmailDirection.INBOUND) {
          await this.createInquiryFromEmailUseCase.ensureCustomerContactFromEmail(emailMessage);
        }
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

  /**
   * 尝试从引用文本中恢复缺失的父邮件。
   * 如果 inReplyTo 存在且库中查不到，则从引用文本中提取内容并入库。
   */
  private async tryRecoverMissingEmail(
    quotedHistory: string | undefined,
    inReplyTo: string | undefined,
    currentSubject: string,
    currentFromEmail: string,
  ): Promise<RecoveredEmail[]> {
    if (!quotedHistory || !inReplyTo) return [];

    // 先检查父邮件是否已入库
    const existing = await this.emailMessageRepository.findByExternalMessageId(inReplyTo);
    if (existing) return [];

    const recovered = recoverParentEmailFromQuote(
      quotedHistory, inReplyTo, currentSubject, currentFromEmail,
    );
    if (!recovered) return [];

    // 保存恢复的邮件（含完整 threadId + toEmails）
    await this.emailMessageRepository.save(recovered.emailMessage);

    return [recovered];
  }

  /**
   * 将恢复的邮件全部关联到指定询盘。
   */
  private async linkRecoveredEmailsToInquiry(
    recoveredEmails: RecoveredEmail[],
    inquiryCase: InquiryCase,
  ): Promise<void> {
    if (!this.inquiryMessageRepository) return;

    for (const recovered of recoveredEmails) {
      await this.inquiryMessageRepository.save({
        id: `inquiry_message_${randomUUID()}`,
        inquiryCaseId: inquiryCase.id,
        emailMessageId: recovered.emailMessage.id,
        direction: recovered.emailMessage.direction,
        relationType: InquiryMessageRelationType.RELATED_CONTEXT,
        createdAt: new Date(),
      });
    }
  }
}

function resolveEmailDirection(inboundEmail: InboundEmail): EmailDirection {
  if (!isOwnEmail(inboundEmail.fromEmail)) {
    return EmailDirection.INBOUND;
  }

  return EmailDirection.OUTBOUND;
}

// ---------------------------------------------------------------------------
// Phase 1 调试日志：引用文本恢复分析
// ---------------------------------------------------------------------------

const QUOTED_RECOVERY_DEBUG_LOG_PATH = resolve(
  process.cwd(),
  'logs/quoted-recovery-debug.jsonl',
);

interface QuotedRecoveryDebugEntry {
  occurredAt: string;
  currentEmailMessageId: string;
  currentSubject: string;
  currentFrom: string;
  inReplyTo?: string;
  references?: string[];
  quotedHistoryChars: number;
  quotedHistoryPreview: string;
  hasMessageIdHeader: boolean;
  extractedMessageIds: string[];
}

function writeQuotedRecoveryDebugLog(
  input: Omit<QuotedRecoveryDebugEntry, 'occurredAt'>,
): void {
  try {
    mkdirSync(dirname(QUOTED_RECOVERY_DEBUG_LOG_PATH), { recursive: true });
    appendFileSync(
      QUOTED_RECOVERY_DEBUG_LOG_PATH,
      `${JSON.stringify({ ...input, occurredAt: new Date().toISOString() })}\n`,
      'utf8',
    );
  } catch {
    // 调试日志不能阻塞主流程
  }
}

/**
 * 从文本中正则提取可能的 Message-ID 值。
 * 匹配格式：<xxx@yyy> 或 Message-ID: <xxx@yyy>
 */
function extractMessageIdsFromText(text: string): string[] {
  const ids: string[] = [];
  const patterns = [
    /Message-ID\s*:\s*<([^>]+)>/gi,
    /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?::[0-9]+)?(?:\.[a-zA-Z]{2,})?)>/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        ids.push(match[1]);
      }
    }
  }

  return [...new Set(ids)];
}

function truncatePreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n... [truncated, total ${text.length} chars]`;
}
