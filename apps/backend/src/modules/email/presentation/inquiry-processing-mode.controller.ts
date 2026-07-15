import { randomUUID } from 'node:crypto';

import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { itemResponse, toDateIso } from '../../../common/http/api-response.js';
import { ReplayInquiryTimelineUseCase } from '../../inquiry/application/use-cases/replay-inquiry-timeline.use-case.js';

@Controller(API_ROUTE_SEGMENTS.inquiries)
export class InquiryProcessingModeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replayInquiryTimelineUseCase: ReplayInquiryTimelineUseCase,
  ) {}

  @Patch(':id/processing-mode')
  async updateMode(
    @Param('id') id: string,
    @Body() body: { mode?: 'automatic' | 'manual'; reason?: string; changedBy?: string },
  ) {
    if (!['automatic', 'manual'].includes(body.mode ?? '')) {
      throw new BadRequestException('mode must be automatic or manual');
    }
    const inquiry = await this.prisma.inquiryCase.findUnique({ where: { id } });
    if (!inquiry || inquiry.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);
    const changedBy = body.changedBy?.trim() || 'internal_admin';

    if (body.mode === 'automatic') {
      if (inquiry.processingMode === 'automatic') return itemResponse({ inquiry, replayRun: null });
      const replayRun = await this.replayInquiryTimelineUseCase.execute({
        inquiryCaseId: id,
        initiatedBy: changedBy,
        triggerType: 'manual_mode_restored',
      });
      const updated = await this.prisma.inquiryCase.findUniqueOrThrow({ where: { id } });
      return itemResponse({ inquiry: updated, replayRun: mapReplayRun(replayRun) });
    }

    if (!body.reason?.trim()) throw new BadRequestException('reason is required when switching to manual mode');
    if (inquiry.processingMode === 'manual') return itemResponse({ inquiry, replayRun: null });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.inquiryCase.update({
        where: { id },
        data: {
          processingMode: 'manual',
          processingModeReason: body.reason!.trim(),
          processingModeChangedAt: now,
          processingModeChangedBy: changedBy,
          updatedAt: now,
        },
      });
      await tx.inquiryProcessingModeTransition.create({
        data: {
          id: `processing_mode_transition_${randomUUID()}`,
          inquiryCaseId: id,
          fromMode: 'automatic',
          toMode: 'manual',
          reason: body.reason!.trim(),
          beforeStateJson: {
            businessStage: inquiry.businessStage,
            actionOwner: inquiry.actionOwner,
            lifecycleStatus: inquiry.lifecycleStatus,
            stateVersion: inquiry.stateVersion,
          },
          changedBy,
          changedByType: 'human',
          changedAt: now,
        },
      });
      await tx.replyDraft.updateMany({
        where: { inquiryCaseId: id, status: { in: ['pending_review', 'approved', 'rejected'] } },
        data: { status: 'expired', updatedAt: now },
      });
    });
    return itemResponse({
      inquiry: await this.prisma.inquiryCase.findUniqueOrThrow({ where: { id } }),
      replayRun: null,
    });
  }

  @Get(':id/processing-mode-history')
  async history(@Param('id') id: string) {
    const inquiry = await this.prisma.inquiryCase.findUnique({ where: { id }, select: { id: true } });
    if (!inquiry) throw new NotFoundException(`Inquiry not found: ${id}`);
    const [transitions, replayRuns] = await Promise.all([
      this.prisma.inquiryProcessingModeTransition.findMany({
        where: { inquiryCaseId: id },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.inquiryReplayRun.findMany({
        where: { inquiryCaseId: id },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return itemResponse({
      transitions: transitions.map((item) => ({
        ...item,
        scopeConfidence: item.scopeConfidence === null ? null : Number(item.scopeConfidence),
        changedAt: toDateIso(item.changedAt),
      })),
      replayRuns: replayRuns.map(mapReplayRun),
    });
  }
}

function mapReplayRun(record: any) {
  return {
    ...record,
    fromTime: toDateIso(record.fromTime),
    throughTime: toDateIso(record.throughTime),
    startedAt: toDateIso(record.startedAt),
    completedAt: toDateIso(record.completedAt),
  };
}
