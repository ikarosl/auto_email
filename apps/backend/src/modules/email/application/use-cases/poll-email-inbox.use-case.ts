import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { AnalyzeEmailWithAiResult } from './analyze-email-with-ai.use-case.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';
import {
  ProcessedEmailIdentity,
  ProcessedEmailTracker,
} from '../ports/processed-email-tracker.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { ApplyAiSuggestedStatusResult } from '../../../inquiry/application/use-cases/apply-ai-suggested-status.use-case.js';
import { ProcessInquiryEmailEventUseCase } from './process-inquiry-email-event.use-case.js';
import { AnalyzeOutboundEmailEventResult } from './analyze-outbound-email-event.use-case.js';

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
  replyDraftId?: string;
  replyDraftError?: string;
  skippedReason?: string;
  outboundAnalysisResult?: AnalyzeOutboundEmailEventResult;
  workflowDecisionId?: string;
  workflowExecutionStatus?: string;
}

export class PollEmailInboxUseCase {
  constructor(
    private readonly processedEmailTracker: ProcessedEmailTracker,
    private readonly receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
    private readonly processInquiryEmailEventUseCase?: ProcessInquiryEmailEventUseCase,
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

    const eventResult = this.processInquiryEmailEventUseCase
      ? await this.processInquiryEmailEventUseCase.execute({
        emailMessage: receiveResult.emailMessage,
        inquiryCase: receiveResult.inquiryCase,
      })
      : undefined;

    await this.processedEmailTracker.markProcessed(candidate.identity);

    return {
      skipped: false,
      identity: candidate.identity,
      emailMessage: receiveResult.emailMessage,
      inquiryCase: receiveResult.inquiryCase,
      aiAnalysisResult: eventResult?.aiAnalysisResult,
      aiTransitionResult: eventResult?.aiTransitionResult,
      replyDraftId: eventResult?.replyDraftId,
      replyDraftError: eventResult?.replyDraftError,
      skippedReason: eventResult?.skippedReason,
      outboundAnalysisResult: eventResult?.outboundAnalysisResult,
      workflowDecisionId: eventResult?.workflowDecisionId,
      workflowExecutionStatus: eventResult?.workflowExecutionStatus,
    };
  }
}
