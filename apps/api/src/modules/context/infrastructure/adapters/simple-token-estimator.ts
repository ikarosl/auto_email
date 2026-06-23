import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { TokenEstimator } from '../../application/ports/token-estimator.js';

export class SimpleTokenEstimator implements TokenEstimator {
  estimateMessages(messages: AiChatMessage[]): number {
    return messages.reduce((total, message) => total + this.estimateText(message.content), 0);
  }

  estimateText(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
