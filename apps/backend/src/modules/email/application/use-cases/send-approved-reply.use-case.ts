import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';

import { BusinessError } from '../../../../common/errors/business-error.js';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import type { EmailSenderAdapter } from '../ports/email-sender.adapter.js';
import { MailRuntimeConfigService } from '../../infrastructure/config/mail-runtime-config.service.js';

export interface SendApprovedReplyInput {
  replyDraftId: string;
  initiatedBy?: string;
}

export class SendApprovedReplyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeConfig: MailRuntimeConfigService,
    private readonly sender: EmailSenderAdapter,
  ) {}

  async execute(input: SendApprovedReplyInput) {
    const draft = await this.prisma.replyDraft.findUnique({
      where: { id: input.replyDraftId },
      include: {
        inquiryCase: { include: { customer: true, primaryCustomer: true } },
        sourceEmailMessage: true,
        attachments: { include: { emailAttachment: true } },
      },
    });
    if (!draft) throw new BusinessError('Reply draft not found.', 'REPLY_DRAFT_NOT_FOUND');
    if (draft.status !== 'approved') {
      throw new BusinessError('Only approved drafts can be sent.', 'REPLY_DRAFT_NOT_APPROVED');
    }

    const recipient = draft.inquiryCase.primaryCustomer?.email || draft.inquiryCase.customer.email;
    const fromEmail = this.runtimeConfig.smtp?.fromEmail || process.env.IMAP_USER?.trim();
    if (!fromEmail) throw new BusinessError('No sender mailbox is configured.', 'MAIL_FROM_NOT_CONFIGURED');
    await validateAttachments(draft.inquiryCaseId, draft.attachments.map((item) => item.emailAttachment));

    const attemptId = `send_attempt_${randomUUID()}`;
    const attemptKey = `send:${draft.id}:v${draft.version}`;
    const domain = fromEmail.split('@')[1] || 'local';
    const messageId = `<reply-${draft.id}-v${draft.version}@${domain}>`;
    const initiatedBy = input.initiatedBy?.trim() || 'internal_admin';
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.replyDraft.updateMany({
        where: { id: draft.id, status: 'approved', version: draft.version },
        data: { status: 'sending', updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BusinessError('Draft changed before sending. Reload and try again.', 'REPLY_DRAFT_CONFLICT');
      }
      await tx.emailSendAttempt.create({
        data: {
          id: attemptId,
          replyDraftId: draft.id,
          inquiryCaseId: draft.inquiryCaseId,
          operationMode: this.runtimeConfig.operationMode,
          provider: this.runtimeConfig.operationMode === 'debug' ? 'simulated' : 'smtp',
          status: 'unknown',
          idempotencyKey: attemptKey,
          messageId,
          recipient,
          subject: draft.subject || '(no subject)',
          initiatedBy,
        },
      });
    });

    let providerAccepted = false;
    try {
      const references = Array.from(new Set([
        ...readStringArray(draft.sourceEmailMessage?.referencesJson),
        ...(draft.sourceEmailMessage?.messageId ? [draft.sourceEmailMessage.messageId] : []),
      ]));
      const result = await this.sender.send({
        fromEmail,
        fromName: this.runtimeConfig.smtp?.fromName || process.env.SMTP_FROM_NAME?.trim() || 'Sales',
        recipient,
        subject: draft.subject || '(no subject)',
        bodyText: draft.bodyText,
        messageId,
        inReplyTo: draft.sourceEmailMessage?.messageId ?? undefined,
        references,
        attachments: draft.attachments.map(({ emailAttachment }) => ({
          fileName: emailAttachment.originalFileName || emailAttachment.safeFileName,
          path: emailAttachment.storagePath!,
          mimeType: emailAttachment.mimeType,
        })),
      });

      if (result.status === 'rejected') {
        await this.recordFailure(draft.id, attemptId, 'send_failed', 'SMTP_REJECTED', 'SMTP rejected all recipients.');
        throw new BusinessError('SMTP rejected the recipient.', 'SMTP_REJECTED');
      }
      providerAccepted = true;

      return await this.persistSuccessfulSend({
        draft,
        attemptId,
        initiatedBy,
        recipient,
        fromEmail,
        messageId: result.messageId,
        providerResponse: result.providerResponse,
        sendStatus: result.status,
      });
    } catch (error) {
      if (error instanceof BusinessError) throw error;
      const uncertain = providerAccepted || isUncertainSendError(error);
      const message = error instanceof Error ? error.message : String(error);
      await this.recordFailure(
        draft.id,
        attemptId,
        uncertain ? 'send_unknown' : 'send_failed',
        readErrorCode(error),
        message,
      );
      throw new BusinessError(
        uncertain
          ? 'SMTP result is unknown. Check the mailbox before any manual retry.'
          : `Email send failed: ${message}`,
        uncertain ? 'EMAIL_SEND_UNKNOWN' : 'EMAIL_SEND_FAILED',
      );
    }
  }

  private async persistSuccessfulSend(input: {
    draft: any;
    attemptId: string;
    initiatedBy: string;
    recipient: string;
    fromEmail: string;
    messageId: string;
    providerResponse: Record<string, unknown>;
    sendStatus: 'simulated' | 'accepted';
  }) {
    const now = new Date();
    const emailId = `email_${randomUUID()}`;
    const source = input.sendStatus === 'simulated' ? 'simulated_send' : 'smtp';

    return this.prisma.$transaction(async (tx) => {
      await tx.emailMessage.create({
        data: {
          id: emailId,
          mailboxAccountId: input.draft.sourceEmailMessage?.mailboxAccountId ?? null,
          emailThreadId: input.draft.sourceEmailMessage?.emailThreadId ?? null,
          direction: 'outbound',
          messageId: input.messageId,
          inReplyTo: input.draft.sourceEmailMessage?.messageId ?? null,
          referencesJson: Array.from(new Set([
            ...readStringArray(input.draft.sourceEmailMessage?.referencesJson),
            ...(input.draft.sourceEmailMessage?.messageId
              ? [input.draft.sourceEmailMessage.messageId]
              : []),
          ])),
          fromEmail: input.fromEmail,
          fromName: this.runtimeConfig.smtp?.fromName || process.env.SMTP_FROM_NAME?.trim() || 'Sales',
          toEmails: [input.recipient],
          ccEmails: [],
          subject: input.draft.subject,
          bodyText: input.draft.bodyText,
          hasAttachments: input.draft.attachments.length > 0,
          attachmentCount: input.draft.attachments.length,
          receivedAt: now,
          source,
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.inquiryMessage.create({
        data: {
          id: `inquiry_message_${randomUUID()}`,
          inquiryCaseId: input.draft.inquiryCaseId,
          emailMessageId: emailId,
          relationType: 'reply',
          direction: 'outbound',
          createdByType: 'system',
          createdBy: input.attemptId,
          relationReason: `${source} reply`,
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.emailSendAttempt.update({
        where: { id: input.attemptId },
        data: {
          outboundEmailMessageId: emailId,
          status: input.sendStatus,
          messageId: input.messageId,
          providerResponseJson: JSON.parse(JSON.stringify(input.providerResponse)),
          completedAt: now,
        },
      });
      await tx.replyDraft.update({
        where: { id: input.draft.id },
        data: {
          status: input.sendStatus === 'simulated' ? 'simulated' : 'sent',
          sentEmailMessageId: emailId,
          sentAt: now,
          lastSendError: null,
          updatedAt: now,
        },
      });

      const transition = resolveSendTransition(input.draft.draftType, input.draft.inquiryCase.status);
      let transitionStatus: 'applied' | 'conflict' | 'not_required' = 'not_required';
      if (transition) {
        const update = await tx.inquiryCase.updateMany({
          where: { id: input.draft.inquiryCaseId, status: transition.from },
          data: { status: transition.to, updatedAt: now },
        });
        if (update.count === 1) {
          transitionStatus = 'applied';
          await tx.inquiryStatusLog.create({
            data: {
              id: `status_log_${randomUUID()}`,
              inquiryCaseId: input.draft.inquiryCaseId,
              fromStatus: transition.from,
              toStatus: transition.to,
              reason: `${source} reply sent from approved draft`,
              changedBy: input.attemptId,
              changedByType: 'system',
            },
          });
        } else {
          transitionStatus = 'conflict';
        }
      }

      return {
        replyDraftId: input.draft.id,
        sendAttemptId: input.attemptId,
        outboundEmailMessageId: emailId,
        operationMode: this.runtimeConfig.operationMode,
        sendStatus: input.sendStatus,
        transitionStatus,
      };
    });
  }

  private async recordFailure(
    draftId: string,
    attemptId: string,
    draftStatus: 'send_failed' | 'send_unknown',
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailSendAttempt.update({
        where: { id: attemptId },
        data: {
          status: draftStatus === 'send_unknown' ? 'unknown' : 'failed',
          errorCode,
          errorMessage,
          completedAt: new Date(),
        },
      }),
      this.prisma.replyDraft.update({
        where: { id: draftId },
        data: { status: draftStatus, lastSendError: errorMessage, updatedAt: new Date() },
      }),
    ]);
  }
}

function resolveSendTransition(draftType: string, currentStatus: string) {
  if (draftType === 'clarification_request' && currentStatus === InquiryStatus.NEED_CLARIFICATION) {
    return { from: InquiryStatus.NEED_CLARIFICATION, to: InquiryStatus.WAITING_CUSTOMER };
  }
  if (draftType === 'quote_reply' && currentStatus === InquiryStatus.READY_FOR_QUOTE) {
    return { from: InquiryStatus.READY_FOR_QUOTE, to: InquiryStatus.QUOTED };
  }
  return undefined;
}

async function validateAttachments(inquiryCaseId: string, attachments: Array<{
  inquiryCaseId: string | null;
  storageProvider: string;
  storagePath: string | null;
  fileSize: bigint;
  mimeType: string;
}>): Promise<void> {
  const maxBytes = Number(process.env.ATTACHMENT_MAX_FILE_SIZE_MB ?? 20) * 1024 * 1024;
  for (const attachment of attachments) {
    if (attachment.inquiryCaseId !== inquiryCaseId) {
      throw new BusinessError('Selected attachment does not belong to this inquiry.', 'ATTACHMENT_OWNERSHIP_INVALID');
    }
    if (attachment.storageProvider !== 'local' || !attachment.storagePath) {
      throw new BusinessError('Selected attachment is not available in local storage.', 'ATTACHMENT_NOT_AVAILABLE');
    }
    if (Number(attachment.fileSize) > maxBytes) {
      throw new BusinessError('Selected attachment exceeds the configured size limit.', 'ATTACHMENT_TOO_LARGE');
    }
    if (!attachment.mimeType.trim()) {
      throw new BusinessError('Selected attachment has no MIME type.', 'ATTACHMENT_MIME_INVALID');
    }
    await access(attachment.storagePath).catch(() => {
      throw new BusinessError('Selected attachment file is missing.', 'ATTACHMENT_FILE_MISSING');
    });
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isUncertainSendError(error: unknown): boolean {
  return ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET'].includes(readErrorCode(error));
}

function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string') return error.code;
  return 'SMTP_ERROR';
}
