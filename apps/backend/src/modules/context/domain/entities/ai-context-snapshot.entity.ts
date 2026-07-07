import { ContextPurpose } from '../enums/context-purpose.enum.js';
import { AiChatMessage } from '../value-objects/ai-chat-message.vo.js';
import { ContextSourceReference } from '../value-objects/context-source-reference.vo.js';
import type { AiEmailAnalysisContextPayload } from '../../application/dto/ai-email-analysis-context.schema.js';

export interface AiContextSnapshot {
  id: string;
  inquiryCaseId: string;
  emailMessageId?: string;
  purpose: ContextPurpose;
  contextPayload: AiEmailAnalysisContextPayload;
  messages: AiChatMessage[];
  sourceReferences: ContextSourceReference[];
  estimatedTokens: number;
  createdAt: Date;
}
