import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { ContextSourceReference } from '../../domain/value-objects/context-source-reference.vo.js';
import type { AiEmailAnalysisContextPayload } from './ai-email-analysis-context.schema.js';

export interface ContextSnapshotResponseDto {
  contextSnapshotId: string;
  inquiryCaseId: string;
  emailMessageId?: string;
  purpose: ContextPurpose;
  contextPayload: AiEmailAnalysisContextPayload;
  messages: AiChatMessage[];
  sources: ContextSourceReference[];
  estimatedTokens: number;
}
