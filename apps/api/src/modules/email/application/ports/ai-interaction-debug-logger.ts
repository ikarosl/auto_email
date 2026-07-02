import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';

export interface AiInteractionDebugLogEntry {
  occurredAt: Date;
  emailMessage: EmailMessage;
  inquiryCase?: InquiryCase;
  contextSnapshotId?: string;
  estimatedContextTokens?: number;
  messages: AiChatMessage[];
  rawOutput?: string;
  analysis?: EmailAiAnalysis;
  validationError?: {
    errorCode: string;
    message: string;
  };
}

export interface AiInteractionDebugLogger {
  log(entry: AiInteractionDebugLogEntry): Promise<void>;
}
