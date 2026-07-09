import { Body, Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { itemResponse, toDateIso } from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { MoveInquiryMessageDto } from '../application/dto/move-inquiry-message.dto.js';
import { InquiryMessageRelationType } from '../domain/enums/inquiry-message-relation-type.enum.js';

@Controller(API_ROUTE_SEGMENTS.inquiryMessages)
export class InquiryMessageController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':id/move')
  async move(@Param('id') id: string, @Body() body: MoveInquiryMessageDto) {
    const current = await this.prisma.inquiryMessage.findUnique({
      where: { id },
      include: { emailMessage: true },
    });
    if (!current) throw new NotFoundException(`Inquiry message link not found: ${id}`);

    const targetInquiry = await this.prisma.inquiryCase.findUnique({
      where: { id: body.targetInquiryCaseId },
    });
    if (!targetInquiry || targetInquiry.deletedAt) {
      throw new NotFoundException(`Target inquiry not found: ${body.targetInquiryCaseId}`);
    }

    const now = new Date();
    const existingTarget = await this.prisma.inquiryMessage.findUnique({
      where: {
        inquiryCaseId_emailMessageId: {
          inquiryCaseId: body.targetInquiryCaseId,
          emailMessageId: current.emailMessageId,
        },
      },
      include: { emailMessage: true, inquiryCase: true },
    });

    if (existingTarget && existingTarget.id !== current.id) {
      await this.prisma.inquiryMessage.delete({ where: { id: current.id } });
      const updatedExisting = await this.prisma.inquiryMessage.update({
        where: { id: existingTarget.id },
        data: {
          relationType: InquiryMessageRelationType.MANUAL_LINK,
          createdByType: 'human',
          createdBy: body.changedBy ?? null,
          relationReason: body.reason,
          updatedAt: now,
        },
        include: { emailMessage: true, inquiryCase: true },
      });
      await this.touchTargetInquiry(body.targetInquiryCaseId, current.emailMessage.receivedAt, now);
      return itemResponse(mapInquiryMessage(updatedExisting));
    }

    const moved = await this.prisma.inquiryMessage.update({
      where: { id },
      data: {
        inquiryCaseId: body.targetInquiryCaseId,
        relationType: InquiryMessageRelationType.MANUAL_LINK,
        createdByType: 'human',
        createdBy: body.changedBy ?? null,
        relationReason: body.reason,
        updatedAt: now,
      },
      include: { emailMessage: true, inquiryCase: true },
    });
    await this.touchTargetInquiry(body.targetInquiryCaseId, current.emailMessage.receivedAt, now);

    return itemResponse(mapInquiryMessage(moved));
  }

  private async touchTargetInquiry(inquiryCaseId: string, emailReceivedAt: Date, updatedAt: Date) {
    await this.prisma.inquiryCase.update({
      where: { id: inquiryCaseId },
      data: {
        latestMessageAt: emailReceivedAt,
        updatedAt,
      },
    });
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
    emailMessage: record.emailMessage
      ? {
          id: record.emailMessage.id,
          fromEmail: record.emailMessage.fromEmail,
          fromName: record.emailMessage.fromName,
          subject: record.emailMessage.subject,
          receivedAt: toDateIso(record.emailMessage.receivedAt),
        }
      : null,
    inquiryCase: record.inquiryCase
      ? {
          id: record.inquiryCase.id,
          status: record.inquiryCase.status,
          subject: record.inquiryCase.subject,
          businessSubject: record.inquiryCase.businessSubject,
        }
      : null,
  };
}
