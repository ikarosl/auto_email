import { env } from 'node:process';

import OpenAI from 'openai';

import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import type {
  BusinessSubjectGeneratorAdapter,
  BusinessSubjectGeneratorInput,
} from '../../application/ports/business-subject-generator.adapter.js';
import { BUSINESS_SUBJECT_SYSTEM_PROMPT } from '../../application/prompts/business-subject.prompt.js';

export class DeepseekBusinessSubjectGenerator implements BusinessSubjectGeneratorAdapter {
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

  async generate(input: BusinessSubjectGeneratorInput): Promise<string> {
    if (!this.client) {
      return '';
    }

    const messages = buildMessages(input);
    const completion = await this.client.chat.completions.create({
      messages,
      model: env.AI_EMAIL_ANALYSIS_MODEL || env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      stream: false,
      response_format: { type: 'json_object' },
    });

    return completion.choices[0]?.message?.content ?? '';
  }
}

function buildMessages(input: BusinessSubjectGeneratorInput): AiChatMessage[] {
  return [
    { role: 'system', content: BUSINESS_SUBJECT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        rawSubject: input.inquiryCase.rawSubject ?? input.inquiryCase.subject,
        currentEmailBody: input.currentEmail.bodyText || input.currentEmail.bodyHtml || '',
        knownFacts: input.knownFacts,
      }),
    },
  ];
}
