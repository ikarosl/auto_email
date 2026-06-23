import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { ContextSourceReference } from '../../domain/value-objects/context-source-reference.vo.js';

export interface ContextSnapshotResponseDto {
  contextSnapshotId: string;
  inquiryCaseId: string;
  emailMessageId?: string;
  purpose: ContextPurpose;
  messages: AiChatMessage[];
  sources: ContextSourceReference[];
  estimatedTokens: number;
}
