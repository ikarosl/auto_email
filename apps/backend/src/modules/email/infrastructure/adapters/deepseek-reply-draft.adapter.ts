import OpenAI from 'openai';

import type { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import type { ReplyDraftAiAdapter } from '../../application/ports/reply-draft-ai.adapter.js';

export class DeepseekReplyDraftAdapter implements ReplyDraftAiAdapter {
  private readonly client?: OpenAI;

  constructor() {
    if (process.env.DEEPSEEK_API_KEY) {
      this.client = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
    }
  }

  async generate(messages: AiChatMessage[]): Promise<string> {
    if (!this.client) return '';
    const completion = await this.client.chat.completions.create({
      model: process.env.AI_REPLY_DRAFT_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      messages,
      response_format: { type: 'json_object' },
      stream: false,
    });
    return completion.choices[0]?.message?.content ?? '';
  }
}
