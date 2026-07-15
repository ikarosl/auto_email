import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { AnalyzeEmailWithAiResult } from './analyze-email-with-ai.use-case.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';
import {
  ProcessedEmailIdentity,
  ProcessedEmailTracker,
} from '../ports/processed-email-tracker.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { ProcessInquiryEmailEventUseCase } from './process-inquiry-email-event.use-case.js';

export interface PollEmailCandidate {
  identity: ProcessedEmailIdentity;
  inboundEmail: InboundEmail;
}

export interface PollEmailProcessResult {
  skipped: boolean;
  identity: ProcessedEmailIdentity;
  emailMessage?: EmailMessage;
  inquiryCase?: InquiryCase;
  aiAnalysisResult?: AnalyzeEmailWithAiResult;
  analysisDecisionId?: string;
  stateDecisionId?: string;
  stateExecutionStatus?: string;
  replayRunId?: string;
  recoveryStatus?: string;
  replyDraftId?: string;
  replyDraftError?: string;
  skippedReason?: string;
}

export class PollEmailInboxUseCase {
  constructor(
    private readonly processedEmailTracker: ProcessedEmailTracker,
    private readonly receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
    private readonly processInquiryEmailEventUseCase?: ProcessInquiryEmailEventUseCase,
    private readonly prisma?: PrismaService,
  ) {}

  async markExistingSeen(candidates: PollEmailCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.processedEmailTracker.markSeen(candidate.identity);
    }
  }

  async processCandidate(candidate: PollEmailCandidate): Promise<PollEmailProcessResult> {
    if (await this.processedEmailTracker.hasProcessed(candidate.identity)) {
      return {
        skipped: true,
        identity: candidate.identity,
      };
    }

    const receiveResult = await this.receiveInboundEmailUseCase.execute(candidate.inboundEmail);
    if (!receiveResult.inquiryCase) {
      await this.processedEmailTracker.markProcessed(candidate.identity);

      return {
        skipped: false,
        identity: candidate.identity,
        emailMessage: receiveResult.emailMessage,
        skippedReason: receiveResult.skippedReason ?? 'email_without_matching_inquiry',
      };
    }

    const recovery = await this.processRecoveredParent(candidate, receiveResult);
    const eventResult = this.processInquiryEmailEventUseCase
      ? await this.processInquiryEmailEventUseCase.execute({
        emailMessage: receiveResult.emailMessage,
        inquiryCase: receiveResult.inquiryCase,
        baselineIncomplete: recovery.baselineIncomplete,
        replayRunId: recovery.replayRunId,
      })
      : undefined;

    await this.processedEmailTracker.markProcessed(candidate.identity);

    return {
      skipped: false,
      identity: candidate.identity,
      emailMessage: receiveResult.emailMessage,
      inquiryCase: receiveResult.inquiryCase,
      aiAnalysisResult: eventResult?.analysisResult,
      analysisDecisionId: eventResult?.analysisDecisionId,
      stateDecisionId: eventResult?.stateDecisionId,
      stateExecutionStatus: eventResult?.stateExecutionStatus,
      replayRunId: recovery.replayRunId,
      recoveryStatus: recovery.recoveryStatus,
      replyDraftId: eventResult?.replyDraftId,
      replyDraftError: eventResult?.replyDraftError,
      skippedReason: eventResult?.skippedReason,
    };
  }

  private async processRecoveredParent(
    candidate: PollEmailCandidate,
    receiveResult: Awaited<ReturnType<ReceiveInboundEmailUseCase['execute']>>,
  ): Promise<{ baselineIncomplete: boolean; replayRunId?: string; recoveryStatus?: string }> {
    if (
      !this.prisma
      || !this.processInquiryEmailEventUseCase
      || !receiveResult.inquiryCase
      || receiveResult.recoveredEmails.length === 0
    ) return { baselineIncomplete: false };

    const recovered = receiveResult.recoveredEmails[0]!;
    const replayRunId = `replay_${randomUUID()}`;
    const assessment = await this.assessImmediateReplay(candidate, receiveResult, recovered);
    const record = await this.prisma.emailRecoveryRecord.upsert({
      where: {
        triggerEmailId_recoveredEmailId: {
          triggerEmailId: receiveResult.emailMessage.id,
          recoveredEmailId: recovered.emailMessage.id,
        },
      },
      create: {
        id: `recovery_${randomUUID()}`,
        inquiryCaseId: receiveResult.inquiryCase.id,
        triggerEmailId: receiveResult.emailMessage.id,
        recoveredEmailId: recovered.emailMessage.id,
        expectedMessageId: candidate.inboundEmail.inReplyTo!,
        confidence: recovered.confidence,
        evidenceJson: { ...recovered.evidence, assessmentReason: assessment.reason },
        recoveryStatus: assessment.safe ? 'replaying' : 'context_only',
        replayRunId: assessment.safe ? replayRunId : null,
        baselineIncomplete: !assessment.safe,
      },
      update: {
        inquiryCaseId: receiveResult.inquiryCase.id,
        confidence: recovered.confidence,
        evidenceJson: { ...recovered.evidence, assessmentReason: assessment.reason },
        recoveryStatus: assessment.safe ? 'replaying' : 'context_only',
        replayRunId: assessment.safe ? replayRunId : null,
        baselineIncomplete: !assessment.safe,
        updatedAt: new Date(),
      },
    });

    if (!assessment.safe) {
      return { baselineIncomplete: true, recoveryStatus: record.recoveryStatus };
    }

    const parentResult = await this.processInquiryEmailEventUseCase.execute({
      emailMessage: recovered.emailMessage,
      inquiryCase: receiveResult.inquiryCase,
      replayRunId,
      suppressReplyDraft: true,
    });
    const failed = parentResult.analysisResult?.success === false;
    await this.prisma.emailRecoveryRecord.update({
      where: { id: record.id },
      data: {
        recoveryStatus: failed ? 'replay_failed' : 'replayed',
        baselineIncomplete: failed,
        updatedAt: new Date(),
      },
    });
    return {
      baselineIncomplete: failed,
      replayRunId,
      recoveryStatus: failed ? 'replay_failed' : 'replayed',
    };
  }

  private async assessImmediateReplay(
    candidate: PollEmailCandidate,
    receiveResult: Awaited<ReturnType<ReceiveInboundEmailUseCase['execute']>>,
    recovered: Awaited<ReturnType<ReceiveInboundEmailUseCase['execute']>>['recoveredEmails'][number],
  ): Promise<{ safe: boolean; reason: string }> {
    if (receiveResult.recoveredEmails.length !== 1) return { safe: false, reason: 'multiple_recovered_messages' };
    if (!candidate.inboundEmail.inReplyTo) return { safe: false, reason: 'missing_in_reply_to' };
    if (recovered.emailMessage.externalMessageId !== candidate.inboundEmail.inReplyTo) {
      return { safe: false, reason: 'not_direct_parent' };
    }
    if (recovered.confidence < 0.9 || !recovered.bodyComplete) {
      return { safe: false, reason: 'recovery_confidence_or_body_incomplete' };
    }
    if (recovered.emailMessage.receivedAt.getTime() >= receiveResult.emailMessage.receivedAt.getTime()) {
      return { safe: false, reason: 'invalid_parent_child_time_order' };
    }

    const otherReferences = (candidate.inboundEmail.references ?? [])
      .filter((reference) => normalizeMessageId(reference) !== normalizeMessageId(candidate.inboundEmail.inReplyTo!));
    for (const reference of otherReferences) {
      const variants = messageIdVariants(reference);
      const exists = await this.prisma!.emailMessage.findFirst({
        where: { OR: variants.map((messageId) => ({ messageId })) },
        select: { id: true },
      });
      if (!exists) return { safe: false, reason: 'references_contain_additional_gap' };
    }

    const middleEvents = await this.prisma!.inquiryBusinessEvent.count({
      where: {
        inquiryCaseId: receiveResult.inquiryCase!.id,
        occurredAt: {
          gt: recovered.emailMessage.receivedAt,
          lt: receiveResult.emailMessage.receivedAt,
        },
      },
    });
    if (middleEvents > 0) return { safe: false, reason: 'intermediate_business_events_exist' };
    return { safe: true, reason: 'trusted_direct_parent' };
  }
}

function normalizeMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, '').toLowerCase();
}

function messageIdVariants(value: string): string[] {
  const normalized = normalizeMessageId(value);
  return [normalized, `<${normalized}>`];
}
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
