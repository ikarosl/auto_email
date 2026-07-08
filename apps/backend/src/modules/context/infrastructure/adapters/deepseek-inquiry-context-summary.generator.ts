import { env } from 'node:process';

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

import {
  inquiryContextSummaryGenerationSchema,
  InquiryContextSummaryGenerationResult,
} from '../../application/dto/inquiry-context-summary-generation.schema.js';
import {
  GenerateInquiryContextSummaryInput,
  InquiryContextSummaryGenerator,
} from '../../application/ports/inquiry-context-summary-generator.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';

type DeepSeekChatCompletionCreateParams = ChatCompletionCreateParamsNonStreaming & {
  thinking?: {
    type: 'enabled' | 'disabled';
  };
};

const MAX_SUMMARY_ATTEMPTS = 3;
const DEFAULT_SUMMARY_SYSTEM_PROMPT = [
  'You are an AI context summarizer for a B2B email inquiry management system.',
  'Your task is to compress earlier email thread history into a durable rolling summary.',
  'The summary will be used by another AI call to analyze future customer emails.',
  'Preserve only business-relevant facts: product requirements, technical parameters, quantity, price, delivery, customer decisions, our commitments, risks, and unresolved questions.',
  'Do not invent facts. Do not infer acceptance unless the customer clearly confirmed it.',
  'Do not include internal database IDs, email IDs, token counts, or implementation details.',
  'If existingSummary is provided, merge it with messagesToSummarize instead of replacing it with only the new messages.',
  'Return only one valid JSON object. Do not include markdown fences, comments, or explanatory text.',
].join('\n');

export class DeepseekInquiryContextSummaryGenerator implements InquiryContextSummaryGenerator {
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

  async generate(input: GenerateInquiryContextSummaryInput): Promise<InquiryContextSummaryGenerationResult> {
    if (!this.client) {
      throw new Error('DEEPSEEK_API_KEY is required to generate inquiry context summaries.');
    }

    let lastError = 'Unknown summary generation error.';
    for (let attempt = 1; attempt <= MAX_SUMMARY_ATTEMPTS; attempt += 1) {
      const messages = buildSummaryMessages(input, attempt, lastError);
      const request: DeepSeekChatCompletionCreateParams = {
        messages,
        model: env.AI_CONTEXT_SUMMARY_MODEL || env.AI_EMAIL_ANALYSIS_MODEL || env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
        thinking: { type: isThinkingEnabled() ? 'enabled' : 'disabled' },
        reasoning_effort: getReasoningEffort(),
        stream: false,
        response_format: { type: 'json_object' },
      };
      const completion = await this.client.chat.completions.create(request);
      const rawOutput = completion.choices[0]?.message?.content?.trim() ?? '';
      const jsonText = extractJsonText(rawOutput);
      if (!jsonText) {
        lastError = 'AI summary output did not contain a JSON object.';
        continue;
      }

      try {
        const parsed = JSON.parse(jsonText);
        const validation = inquiryContextSummaryGenerationSchema.safeParse(parsed);
        if (validation.success) {
          return validation.data;
        }
        lastError = validation.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error(`AI summary generation failed after ${MAX_SUMMARY_ATTEMPTS} attempts: ${lastError}`);
  }
}

function buildSummaryMessages(
  input: GenerateInquiryContextSummaryInput,
  attempt: number,
  lastError: string,
): AiChatMessage[] {
  const messages: AiChatMessage[] = [
    {
      role: 'system',
      content: env.AI_CONTEXT_SUMMARY_SYSTEM_PROMPT?.trim() || DEFAULT_SUMMARY_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify({
        existingSummary: input.existingSummary
          ? {
            summaryText: input.existingSummary.summaryText,
            knownFacts: input.existingSummary.knownFacts,
            customerDecisions: input.existingSummary.customerDecisions,
            ourCommitments: input.existingSummary.ourCommitments,
            openQuestions: input.existingSummary.openQuestions,
          }
          : null,
        messagesToSummarize: input.messagesToSummarize,
        outputSchema: {
          summaryText: 'string',
          knownFacts: 'string[]',
          customerDecisions: 'string[]',
          ourCommitments: 'string[]',
          openQuestions: 'string[]',
        },
      }, null, 2),
    },
  ];

  if (attempt > 1) {
    messages.push({
      role: 'user',
      content: [
        `Previous summary attempt failed: ${lastError}`,
        'Return one valid JSON object only.',
        'All arrays must contain strings; use an empty array when there is no item.',
      ].join('\n'),
    });
  }

  return messages;
}

function extractJsonText(rawOutput: string): string | undefined {
  const trimmed = rawOutput
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  return trimmed.slice(start, end + 1);
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
