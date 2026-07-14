import { BusinessError } from '../../../../common/errors/business-error.js';
import { PrismaService } from '../../../../common/database/prisma.service.js';

export interface UpdateReplyDraftInput {
  replyDraftId: string;
  version: number;
  subject: string;
  bodyText: string;
  attachmentIds?: string[];
}

export class ManageReplyDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async update(input: UpdateReplyDraftInput) {
    if (!input.subject.trim() || !input.bodyText.trim()) {
      throw new BusinessError('Draft subject and body are required.', 'DRAFT_CONTENT_REQUIRED');
    }
    const draft = await this.prisma.replyDraft.findUnique({ where: { id: input.replyDraftId } });
    if (!draft) throw new BusinessError('Reply draft not found.', 'REPLY_DRAFT_NOT_FOUND');
    if (!['pending_review', 'rejected'].includes(draft.status)) {
      throw new BusinessError('This draft can no longer be edited.', 'DRAFT_NOT_EDITABLE');
    }

    const attachmentIds = Array.from(new Set(input.attachmentIds ?? []));
    if (attachmentIds.length > 0) {
      const count = await this.prisma.emailAttachment.count({
        where: { id: { in: attachmentIds }, inquiryCaseId: draft.inquiryCaseId },
      });
      if (count !== attachmentIds.length) {
        throw new BusinessError('One or more attachments do not belong to this inquiry.', 'ATTACHMENT_OWNERSHIP_INVALID');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.replyDraft.updateMany({
        where: { id: draft.id, version: input.version, status: draft.status },
        data: {
          subject: input.subject.trim(),
          bodyText: input.bodyText.trim(),
          status: 'pending_review',
          version: { increment: 1 },
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new BusinessError('Draft version conflict. Reload before saving.', 'DRAFT_VERSION_CONFLICT');
      }
      await tx.replyDraftAttachment.deleteMany({ where: { replyDraftId: draft.id } });
      if (attachmentIds.length > 0) {
        await tx.replyDraftAttachment.createMany({
          data: attachmentIds.map((emailAttachmentId) => ({ replyDraftId: draft.id, emailAttachmentId })),
        });
      }
      return tx.replyDraft.findUnique({
        where: { id: draft.id },
        include: { attachments: { include: { emailAttachment: true } } },
      });
    });
  }

  async approve(replyDraftId: string, approvedBy?: string) {
    const update = await this.prisma.replyDraft.updateMany({
      where: { id: replyDraftId, status: 'pending_review' },
      data: {
        status: 'approved',
        approvedBy: approvedBy?.trim() || 'internal_admin',
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    if (update.count !== 1) {
      throw new BusinessError('Only a pending review draft can be approved.', 'DRAFT_NOT_APPROVABLE');
    }
    return this.prisma.replyDraft.findUnique({ where: { id: replyDraftId } });
  }

  async reject(replyDraftId: string, reason: string, rejectedBy?: string) {
    if (!reason.trim()) throw new BusinessError('Rejection reason is required.', 'REJECTION_REASON_REQUIRED');
    const update = await this.prisma.replyDraft.updateMany({
      where: { id: replyDraftId, status: { in: ['pending_review', 'approved'] } },
      data: {
        status: 'rejected',
        rejectedBy: rejectedBy?.trim() || 'internal_admin',
        rejectedAt: new Date(),
        rejectionReason: reason.trim(),
        approvedBy: null,
        approvedAt: null,
        updatedAt: new Date(),
      },
    });
    if (update.count !== 1) {
      throw new BusinessError('This draft cannot be rejected in its current state.', 'DRAFT_NOT_REJECTABLE');
    }
    return this.prisma.replyDraft.findUnique({ where: { id: replyDraftId } });
  }
}
