import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { itemResponse, toDateIso, toNumber } from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Controller(API_ROUTE_SEGMENTS.messages)
export class MessageController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.emailMessage.findUnique({
      where: { id },
      include: {
        inquiryMessages: {
          include: {
            inquiryCase: {
              select: {
                id: true,
                businessStage: true,
                actionOwner: true,
                lifecycleStatus: true,
                businessSubject: true,
              },
            },
          },
        },
        analysisDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        contextSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!record || record.deletedAt) throw new NotFoundException(`Message not found: ${id}`);

    return itemResponse({
      id: record.id,
      mailboxAccountId: record.mailboxAccountId,
      emailThreadId: record.emailThreadId,
      messageId: record.messageId,
      inReplyTo: record.inReplyTo,
      references: record.referencesJson,
      direction: record.direction,
      source: record.source,
      fromEmail: record.fromEmail,
      fromName: record.fromName,
      toEmails: record.toEmails,
      ccEmails: record.ccEmails,
      subject: record.subject,
      bodyText: record.bodyText,
      bodyHtml: record.bodyHtml,
      rawSource: record.rawSource,
      receivedAt: toDateIso(record.receivedAt),
      createdAt: toDateIso(record.createdAt),
      inquiryLinks: record.inquiryMessages?.map((link) => ({
        inquiryCaseId: link.inquiryCaseId,
        relationType: link.relationType,
        inquiryCase: link.inquiryCase,
      })),
      analysisDecisions: record.analysisDecisions?.map((d) => ({
        id: d.id,
        messageClassification: d.messageClassification,
        suggestedState: d.suggestedBusinessStage ? {
          businessStage: d.suggestedBusinessStage,
          actionOwner: d.suggestedActionOwner,
          lifecycleStatus: d.suggestedLifecycleStatus,
        } : null,
        confidence: toNumber(d.confidence),
        reason: d.reason,
        success: d.success,
        createdAt: toDateIso(d.createdAt),
      })),
      contextSnapshots: record.contextSnapshots?.map((s) => ({
        id: s.id,
        purpose: s.purpose,
        estimatedTokens: s.estimatedTokens,
        createdAt: toDateIso(s.createdAt),
      })),
    });
  }
}
