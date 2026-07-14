import type { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';

export interface ReplyDraftAiAdapter {
  generate(messages: AiChatMessage[]): Promise<string>;
}
