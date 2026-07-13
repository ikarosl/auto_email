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
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import {
  ApplyAiSuggestedStatusResult,
  ApplyAiSuggestedStatusUseCase,
} from '../../../inquiry/application/use-cases/apply-ai-suggested-status.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from '../../../inquiry/application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { UpdateInquiryStructuredFactsFromAiUseCase } from '../../../inquiry/application/use-cases/update-inquiry-structured-facts-from-ai.use-case.js';
import { GenerateBusinessSubjectUseCase } from '../../../inquiry/application/use-cases/generate-business-subject.use-case.js';
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
  aiTransitionResult?: ApplyAiSuggestedStatusResult;
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
    private readonly updateInquiryStructuredFactsFromAiUseCase?: UpdateInquiryStructuredFactsFromAiUseCase,
    private readonly applyAiSuggestedStatusUseCase?: ApplyAiSuggestedStatusUseCase,
    private readonly generateBusinessSubjectUseCase?: GenerateBusinessSubjectUseCase,
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

    const aiDecisionId = aiAnalysisResult && this.aiDecisionRepository
      ? await this.aiDecisionRepository.save({
        emailMessageId: receiveResult.emailMessage.id,
        inquiryCaseId: receiveResult.inquiryCase.id,
        result: aiAnalysisResult.success ? aiAnalysisResult.analysis : aiAnalysisResult,
        rawOutput: aiAnalysisResult.rawOutput,
      })
      : undefined;

    let aiTransitionResult: ApplyAiSuggestedStatusResult | undefined;

    if (aiAnalysisResult?.success) {
      // 更新客户状态（active / invalid / unknown）
      if (this.updateCustomerStatusFromAiAnalysisUseCase) {
        await this.updateCustomerStatusFromAiAnalysisUseCase.execute({
          customerEmail: receiveResult.inquiryCase.customerEmail,
          analysis: aiAnalysisResult.analysis,
        });
      }

      if (this.updateInquiryStructuredFactsFromAiUseCase) {
        await this.updateInquiryStructuredFactsFromAiUseCase.execute({
          inquiryCaseId: receiveResult.inquiryCase.id,
          emailMessageId: receiveResult.emailMessage.id,
          analysis: aiAnalysisResult.analysis,
        });
      }

      // AI 生成业务主题（跳过已锁定/人工设置）
      if (this.generateBusinessSubjectUseCase && receiveResult.inquiryCase) {
        await this.generateBusinessSubjectUseCase.execute({
          inquiryCaseId: receiveResult.inquiryCase.id,
          currentEmail: receiveResult.emailMessage,
          knownFacts: aiAnalysisResult.analysis.extractedRequirements,
        });
      }

      if (aiDecisionId && this.applyAiSuggestedStatusUseCase) {
        aiTransitionResult = await this.applyAiSuggestedStatusUseCase.execute({
          aiDecisionId,
          inquiryCaseId: receiveResult.inquiryCase.id,
          analysis: aiAnalysisResult.analysis,
        });
        if (aiTransitionResult.status === 'applied') {
          receiveResult.inquiryCase.status = aiTransitionResult.toStatus;
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
      aiTransitionResult,
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
