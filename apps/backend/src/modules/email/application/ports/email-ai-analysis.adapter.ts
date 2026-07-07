import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';

export interface EmailAiAnalysisAdapter {
  analyze(messages: AiChatMessage[]): Promise<string>;
}
