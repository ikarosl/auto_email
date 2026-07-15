import { randomUUID } from 'node:crypto';

import { BadRequestException, Body, Controller, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { itemResponse, toDateIso } from '../../../common/http/api-response.js';
import { LinkInquiryMessageDto } from '../../inquiry/application/dto/link-inquiry-message.dto.js';
import { InquiryRepository } from '../../inquiry/application/ports/inquiry.repository.js';
import { InquiryMessageRelationType } from '../../inquiry/domain/enums/inquiry-message-relation-type.enum.js';
import { INQUIRY_REPOSITORY } from '../../inquiry/inquiry.tokens.js';
import { EmailMessageRepository } from '../application/ports/email-message.repository.js';
import { ProcessInquiryEmailEventUseCase } from '../application/use-cases/process-inquiry-email-event.use-case.js';
import { EMAIL_MESSAGE_REPOSITORY } from '../email.tokens.js';

@Controller(API_ROUTE_SEGMENTS.inquiries)
export class InquiryEmailMessageController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INQUIRY_REPOSITORY) private readonly inquiryRepository: InquiryRepository,
    @Inject(EMAIL_MESSAGE_REPOSITORY) private readonly emailMessageRepository: EmailMessageRepository,
    private readonly processInquiryEmailEventUseCase: ProcessInquiryEmailEventUseCase,
  ) {}

  @Post(':id/messages')
  async linkMessage(@Param('id') id: string, @Body() body: LinkInquiryMessageDto) {
    const inquiryCase = await this.prisma.inquiryCase.findUnique({ where: { id } });
    if (!inquiryCase || inquiryCase.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);

    if (body.mode === 'create_manual_email') {
      const receivedAt = new Date(body.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException('receivedAt must be a valid ISO date.');
      const historicalBackfill = Boolean(inquiryCase.latestMessageAt && receivedAt < inquiryCase.latestMessageAt);
      const now = new Date();
      const emailId = `email_${randomUUID()}`;
      const inquiryMessage = await this.prisma.$transaction(async (tx) => {
        await tx.emailMessage.create({
          data: {
            id: emailId,
            direction: body.direction,
            source: 'manual',
            messageId: body.messageId ?? null,
            inReplyTo: body.inReplyTo ?? null,
            referencesJson: body.references ?? [],
            fromEmail: body.fromEmail,
            fromName: body.fromName ?? null,
            toEmails: body.toEmails ?? [],
            ccEmails: body.ccEmails ?? [],
            subject: body.subject,
            bodyText: body.bodyText ?? null,
            receivedAt,
          },
        });
        const record = await tx.inquiryMessage.create({
          data: {
            inquiryCaseId: id,
            emailMessageId: emailId,
            direction: body.direction,
            relationType: body.relationType ?? InquiryMessageRelationType.MANUAL_IMPORT,
            createdByType: 'human',
            createdBy: body.changedBy ?? null,
            relationReason: body.relationReason ?? null,
            createdAt: now,
            updatedAt: now,
          },
          include: { emailMessage: true, inquiryCase: true },
        });
        if (!historicalBackfill) {
          await tx.inquiryCase.update({
            where: { id },
            data: { latestMessageAt: receivedAt, updatedAt: now },
          });
        }
        return record;
      });

      let processing: unknown;
      try {
        const [domainEmail, domainInquiry] = await Promise.all([
          this.emailMessageRepository.findById(emailId),
          this.inquiryRepository.findById(id),
        ]);
        if (domainEmail && domainInquiry) {
          processing = await this.processInquiryEmailEventUseCase.execute({
            emailMessage: domainEmail,
            inquiryCase: domainInquiry,
            historicalBackfill,
          });
        }
      } catch (error) {
        processing = {
          kind: body.direction === 'outbound' ? 'outbound_event' : 'inbound_analysis',
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return itemResponse({
        ...mapInquiryMessage(inquiryMessage),
        historicalBackfill,
        processing,
      });
    }

    if (!body.emailMessageId) {
      throw new BadRequestException('emailMessageId is required when mode=link_existing_email.');
    }
    const existingEmail = await this.prisma.emailMessage.findUnique({ where: { id: body.emailMessageId } });
    if (!existingEmail || existingEmail.deletedAt) {
      throw new NotFoundException(`Email message not found: ${body.emailMessageId}`);
    }
    const existingOwner = await this.prisma.inquiryMessage.findFirst({
      where: { emailMessageId: body.emailMessageId },
      select: { id: true, inquiryCaseId: true },
    });
    if (existingOwner && existingOwner.inquiryCaseId !== id) {
      throw new BadRequestException(
        `Email already belongs to inquiry ${existingOwner.inquiryCaseId}. Use the move endpoint to change ownership.`,
      );
    }

    const now = new Date();
    const record = await this.prisma.inquiryMessage.upsert({
      where: { inquiryCaseId_emailMessageId: { inquiryCaseId: id, emailMessageId: body.emailMessageId } },
      create: {
        inquiryCaseId: id,
        emailMessageId: body.emailMessageId,
        direction: existingEmail.direction,
        relationType: body.relationType ?? InquiryMessageRelationType.MANUAL_LINK,
        createdByType: 'human',
        createdBy: body.changedBy ?? null,
        relationReason: body.relationReason ?? null,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        relationType: body.relationType ?? InquiryMessageRelationType.MANUAL_LINK,
        createdByType: 'human',
        createdBy: body.changedBy ?? null,
        relationReason: body.relationReason ?? null,
        updatedAt: now,
      },
      include: { emailMessage: true, inquiryCase: true },
    });
    if (!inquiryCase.latestMessageAt || existingEmail.receivedAt > inquiryCase.latestMessageAt) {
      await this.prisma.inquiryCase.update({
        where: { id },
        data: { latestMessageAt: existingEmail.receivedAt, updatedAt: now },
      });
    }
    return itemResponse(mapInquiryMessage(record));
  }
}

function mapInquiryMessage(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    emailMessageId: record.emailMessageId,
    relationType: record.relationType,
    direction: record.direction,
    createdByType: record.createdByType,
    createdBy: record.createdBy,
    relationReason: record.relationReason,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    emailMessage: record.emailMessage ? {
      id: record.emailMessage.id,
      fromEmail: record.emailMessage.fromEmail,
      fromName: record.emailMessage.fromName,
      subject: record.emailMessage.subject,
      receivedAt: toDateIso(record.emailMessage.receivedAt),
    } : null,
    inquiryCase: record.inquiryCase ? {
      id: record.inquiryCase.id,
      businessStage: record.inquiryCase.businessStage,
      actionOwner: record.inquiryCase.actionOwner,
      lifecycleStatus: record.inquiryCase.lifecycleStatus,
      stateVersion: record.inquiryCase.stateVersion,
      subject: record.inquiryCase.subject,
      businessSubject: record.inquiryCase.businessSubject,
    } : null,
  };
}
