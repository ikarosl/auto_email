import { env } from 'node:process';

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailAiAnalysisAdapter } from '../../application/ports/email-ai-analysis.adapter.js';

type DeepSeekChatCompletionCreateParams = ChatCompletionCreateParamsNonStreaming & {
  thinking?: {
    type: 'enabled' | 'disabled';
  };
};

const EMAIL_ANALYSIS_SYSTEM_PROMPT = `You are an assistant for an email inquiry management system.

Your task is to analyze one customer email and output a strict JSON object.

You may:
- identify whether the email is a valid product inquiry
- extract technical requirements
- identify missing information
- suggest the next inquiry status
- identify risk or quotation boundary signals

You must not:
- promise technical feasibility
- promise price, lead time, payment, contract, PI, or delivery
- decide final quotation readiness without human review
- suggest sending an external reply automatically
- output any text outside JSON

Allowed first-version statuses:
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed

Rules:
- classification must be one of: valid_inquiry, invalid, unrelated_product, commercial, unknown.
- Never use classification values outside the allowed list. For spam, SEO, marketing, or unsolicited promotion emails, use classification=invalid.
- For spam, SEO, marketing, or unsolicited promotion emails, use suggestedStatus=invalid, not closed.
- For spam, SEO, marketing, or unsolicited promotion emails, set humanReviewRequired=true because the system does not let AI close or discard inquiries automatically.
- If product requirements are missing, suggest need_clarification.
- If technical requirements are mostly clear but feasibility needs engineering confirmation, suggest need_engineer_review.
- If the email asks for price, quote, payment, invoice, contract, PI, purchase order, or commercial terms, set quoteBoundaryDetected=true and humanReviewRequired=true.
- Do not suggest ready_for_quote unless the email clearly indicates quotation readiness, and still set humanReviewRequired=true.
- Do not suggest closed unless the email is clearly not actionable.
- If unsure, suggest need_clarification or need_engineer_review and set humanReviewRequired=true.

Return only valid JSON matching this shape:
{
  "isInquiry": true,
  "classification": "valid_inquiry",
  "suggestedStatus": "need_clarification",
  "confidence": 0.8,
  "riskLevel": "medium",
  "reason": "Short explanation.",
  "missingFields": ["power", "vswr"],
  "extractedRequirements": {
    "productType": "circulator",
    "frequencyRange": "12-15GHz",
    "power": "20W",
    "quantity": "10 pcs",
    "sizeRequirement": "small size",
    "application": "unknown"
  },
  "quoteBoundaryDetected": false,
  "humanReviewRequired": true,
  "nextAction": "Ask customer for missing technical parameters."
}`;

export class DeepseekEmailAnalysisAdapter implements EmailAiAnalysisAdapter {
  private readonly client: OpenAI;

  constructor() {
    if (!env.DEEPSEEK_API_KEY) {
      throw new Error('Missing required DeepSeek config: DEEPSEEK_API_KEY');
    }

    this.client = new OpenAI({
      baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      apiKey: env.DEEPSEEK_API_KEY,
    });
  }

  async analyze(emailMessage: EmailMessage): Promise<string> {
    const request: DeepSeekChatCompletionCreateParams = {
      messages: [
        {
          role: 'system',
          content: EMAIL_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: formatEmailForAnalysis(emailMessage),
        },
      ],
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

function formatEmailForAnalysis(emailMessage: EmailMessage): string {
  return [
    `From: ${emailMessage.fromName || ''} <${emailMessage.fromEmail}>`,
    `To: ${emailMessage.toEmails.join(', ')}`,
    `Subject: ${emailMessage.subject}`,
    `ReceivedAt: ${emailMessage.receivedAt.toISOString()}`,
    '',
    'Plain text body:',
    emailMessage.bodyText || '(empty)',
    '',
    'HTML body:',
    emailMessage.bodyHtml || '(empty)',
  ].join('\n');
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
