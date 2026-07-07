import { env } from 'node:process';

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

import { EmailAiAnalysisAdapter } from '../../application/ports/email-ai-analysis.adapter.js';
import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';

type DeepSeekChatCompletionCreateParams = ChatCompletionCreateParamsNonStreaming & {
  thinking?: {
    type: 'enabled' | 'disabled';
  };
};

export class DeepseekEmailAnalysisAdapter implements EmailAiAnalysisAdapter {
  private readonly client: OpenAI | null;

  constructor() {
    if (!env.DEEPSEEK_API_KEY) {
      this.client = null;
      return;
    }

    this.client = new OpenAI({
      baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      apiKey: env.DEEPSEEK_API_KEY,
    });
  }

  async analyze(messages: AiChatMessage[]): Promise<string> {
    if (!this.client) {
      return '';
    }
    console.log(messages);
    const request: DeepSeekChatCompletionCreateParams = {
      messages,
      model: env.AI_EMAIL_ANALYSIS_MODEL || env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      thinking: { type: isThinkingEnabled() ? 'enabled' : 'disabled' },
      reasoning_effort: getReasoningEffort(),
      stream: false,
      response_format: { type: 'json_object' },
    };

    const completion = await this.client.chat.completions.create(request);
    return completion.choices[0]?.message?.content ?? '';
  }
}

function isThinkingEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((env.DEEPSEEK_THINKING_ENABLED ?? 'true').toLowerCase());
}

function getReasoningEffort(): 'minimal' | 'low' | 'medium' | 'high' {
  const value = env.DEEPSEEK_REASONING_EFFORT || 'high';
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  return 'high';
}
