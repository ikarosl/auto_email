import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import {
  AnalyzeEmailWithAiResult,
  AnalyzeEmailWithAiUseCase,
} from './analyze-email-with-ai.use-case.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';
import {
  ProcessedEmailIdentity,
  ProcessedEmailTracker,
} from '../ports/processed-email-tracker.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import {
  InquiryTransitionContext,
  InquiryTransitionOperatorType,
} from '../../../inquiry/domain/state-machine/inquiry-transition.guard.js';
import { InquiryStateMachine } from '../../../inquiry/domain/state-machine/inquiry-state-machine.js';
import { InquiryRepository } from '../../../inquiry/application/ports/inquiry.repository.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from '../../../inquiry/application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';
import { AiDecisionRepository } from '../ports/ai-decision.repository.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';

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
  skippedReason?: string;
}

export class PollEmailInboxUseCase {
  constructor(
    private readonly processedEmailTracker: ProcessedEmailTracker,
    private readonly receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
    private readonly analyzeEmailWithAiUseCase?: AnalyzeEmailWithAiUseCase,
    private readonly inquiryMessageRepository?: InquiryMessageRepository,
    private readonly emailMessageRepository?: EmailMessageRepository,
    private readonly updateCustomerStatusFromAiAnalysisUseCase?: UpdateCustomerStatusFromAiAnalysisUseCase,
    private readonly aiDecisionRepository?: AiDecisionRepository,
    private readonly inquiryStateMachine?: InquiryStateMachine,
    private readonly inquiryRepository?: InquiryRepository,
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

    if (receiveResult.emailMessage.direction === EmailDirection.OUTBOUND) {
      await this.processedEmailTracker.markProcessed(candidate.identity);

      return {
        skipped: false,
        identity: candidate.identity,
        emailMessage: receiveResult.emailMessage,
        inquiryCase: receiveResult.inquiryCase,
        skippedReason: 'outbound_email_stored_as_context',
      };
    }

    const recentEmailMessages = await this.listInquiryEmailMessages(receiveResult.inquiryCase.id);
    const recentOurReplies = recentEmailMessages.filter(
      (emailMessage) => emailMessage.direction === 'outbound',
    );
    const aiAnalysisResult = this.analyzeEmailWithAiUseCase
      ? await this.analyzeEmailWithAiUseCase.execute(receiveResult.emailMessage, {
        inquiryCase: receiveResult.inquiryCase,
        recentEmailMessages,
        recentOurReplies,
      })
      : undefined;

    if (aiAnalysisResult && this.aiDecisionRepository) {
      await this.aiDecisionRepository.save({
        emailMessageId: receiveResult.emailMessage.id,
        inquiryCaseId: receiveResult.inquiryCase.id,
        result: aiAnalysisResult.success ? aiAnalysisResult.analysis : aiAnalysisResult,
        rawOutput: aiAnalysisResult.rawOutput,
      });
    }

    if (aiAnalysisResult?.success) {
      // 更新客户状态（active / invalid / unknown）
      if (this.updateCustomerStatusFromAiAnalysisUseCase) {
        await this.updateCustomerStatusFromAiAnalysisUseCase.execute({
          customerEmail: receiveResult.inquiryCase.customerEmail,
          analysis: aiAnalysisResult.analysis,
        });
      }

      // 对于 NEW 状态的询盘，AI 判定为无效时可自动标记 invalid
      if (
        receiveResult.inquiryCase.status === InquiryStatus.NEW &&
        this.inquiryStateMachine &&
        this.inquiryRepository
      ) {
        const invalidated = await tryAutoInvalidateInquiry(
          receiveResult.inquiryCase,
          aiAnalysisResult.analysis,
          this.inquiryStateMachine,
          this.inquiryRepository,
        );
        if (invalidated) {
          receiveResult.inquiryCase.status = InquiryStatus.INVALID;
        }
      }
    }

    await this.processedEmailTracker.markProcessed(candidate.identity);

    return {
      skipped: false,
      identity: candidate.identity,
      emailMessage: receiveResult.emailMessage,
      inquiryCase: receiveResult.inquiryCase,
      aiAnalysisResult,
    };
  }

  private async listInquiryEmailMessages(inquiryCaseId: string): Promise<EmailMessage[]> {
    if (!this.inquiryMessageRepository || !this.emailMessageRepository) {
      return [];
    }

    const inquiryMessages = await this.inquiryMessageRepository.listByInquiryCaseId(inquiryCaseId);
    const emailMessages = await Promise.all(
      inquiryMessages.map((inquiryMessage) =>
        this.emailMessageRepository?.findById(inquiryMessage.emailMessageId),
      ),
    );

    return emailMessages
      .filter((emailMessage): emailMessage is EmailMessage => Boolean(emailMessage))
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }
}

const AI_AUTO_INVALIDATE_CONFIDENCE_THRESHOLD = 0.9;

/**
 * 在 AI 分析后将符合无效条件的询盘自动标记为 INVALID。
 *
 * 仅对 status === NEW 的询盘生效（即首次邮件创建的询盘），
 * 已匹配到已有询盘的后续邮件不自动无效化。
 *
 * 阈值：classification === 'invalid' 且 confidence >= 0.9。
 */
async function tryAutoInvalidateInquiry(
  inquiryCase: InquiryCase,
  analysis: { classification: string; confidence: number; reason?: string },
  stateMachine: InquiryStateMachine,
  inquiryRepository: InquiryRepository,
): Promise<boolean> {
  if (analysis.classification !== 'invalid') {
    return false;
  }

  if (analysis.confidence < AI_AUTO_INVALIDATE_CONFIDENCE_THRESHOLD) {
    return false;
  }

  const context: InquiryTransitionContext = {
    operatorType: 'ai' as InquiryTransitionOperatorType,
    reason: `AI classified as invalid: ${analysis.reason ?? 'No reason provided.'}`,
  };

  if (!stateMachine.canTransition(InquiryStatus.NEW, InquiryStatus.INVALID, context)) {
    return false;
  }

  const transition = stateMachine.transition(InquiryStatus.NEW, InquiryStatus.INVALID, context);
  const updated: InquiryCase = {
    ...inquiryCase,
    status: transition.toStatus,
    updatedAt: transition.changedAt,
  };

  await inquiryRepository.save(updated);
  return true;
}
