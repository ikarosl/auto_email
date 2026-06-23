import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';

export interface TokenEstimator {
  estimateMessages(messages: AiChatMessage[]): number;
  estimateText(text: string): number;
}
