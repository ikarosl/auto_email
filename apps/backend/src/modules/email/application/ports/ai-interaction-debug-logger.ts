import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import type { AiEmailAnalysisContextPayload } from '../../../context/application/dto/ai-email-analysis-context.schema.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';

export interface AiInteractionDebugLogEntry {
  occurredAt: Date;
  emailMessage: EmailMessage;
  inquiryCase?: InquiryCase;
  contextSnapshotId?: string;
  estimatedContextTokens?: number;
  contextPayload?: AiEmailAnalysisContextPayload;
  messages: AiChatMessage[];
  rawOutput?: string;
  analysis?: EmailAiAnalysis;
  validationError?: {
    errorCode: string;
    message: string;
  };
  attempts?: AiInteractionDebugAttempt[];
  successfulAttempt?: number;
}

export interface AiInteractionDebugAttempt {
  attempt: number;
  rawOutput?: string;
  validationError?: {
    errorCode: string;
    message: string;
  };
  messageCount: number;
  usedRepairInstruction: boolean;
  repairInstructionMessage?: AiChatMessage;
}

export interface AiInteractionDebugLogger {
  log(entry: AiInteractionDebugLogEntry): Promise<void>;
}
