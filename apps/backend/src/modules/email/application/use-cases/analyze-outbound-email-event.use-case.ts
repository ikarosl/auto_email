import { BuildAiContextUseCase } from '../../../context/application/use-cases/build-ai-context.use-case.js';
import { ContextPurpose } from '../../../context/domain/enums/context-purpose.enum.js';
import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import {
  OUTBOUND_EMAIL_EVENT_OUTPUT_SCHEMA,
  OutboundEmailEventAnalysis,
  outboundEmailEventAnalysisSchema,
} from '../dto/outbound-email-event-analysis.schema.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import {
  OUTBOUND_EMAIL_EVENT_PROMPT_VERSION,
  OUTBOUND_EMAIL_EVENT_SYSTEM_PROMPT,
} from '../prompts/outbound-email-event.prompt.js';

const MAX_ATTEMPTS = 3;

export type AnalyzeOutboundEmailEventResult =
  | {
    success: true;
    analysis: OutboundEmailEventAnalysis;
    rawOutput: string;
    contextSnapshotId?: string;
  }
  | {
    success: false;
    errorCode: 'ai_disabled' | 'ai_empty_output' | 'ai_json_parse_failed' | 'ai_validation_failed';
    message: string;
    rawOutput?: string;
    contextSnapshotId?: string;
  };

export class AnalyzeOutboundEmailEventUseCase {
  constructor(
    private readonly aiAdapter: EmailAiAnalysisAdapter,
    private readonly buildAiContextUseCase: BuildAiContextUseCase,
  ) {}

  async execute(input: {
    emailMessage: EmailMessage;
    inquiryCase: InquiryCase;
    recentEmailMessages: EmailMessage[];
  }): Promise<AnalyzeOutboundEmailEventResult> {
    if (!isEnabled(process.env.AI_EMAIL_ANALYSIS_ENABLED, true)) {
      return { success: false, errorCode: 'ai_disabled', message: 'AI email analysis is disabled.' };
    }

    const context = await this.buildAiContextUseCase.execute({
      inquiryCase: input.inquiryCase,
      currentEmailMessage: input.emailMessage,
      purpose: ContextPurpose.OUTBOUND_EVENT_ANALYSIS,
      systemPrompt: OUTBOUND_EMAIL_EVENT_SYSTEM_PROMPT,
      outputFormatInstruction: 'Return only valid JSON.',
      outputSchema: OUTBOUND_EMAIL_EVENT_OUTPUT_SCHEMA,
      recentEmailMessages: input.recentEmailMessages,
    });
    let lastError = 'AI returned no usable output.';
    let lastRawOutput: string | undefined;
    let lastErrorCode: 'ai_empty_output' | 'ai_json_parse_failed' | 'ai_validation_failed' = 'ai_empty_output';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const repair: AiChatMessage[] = attempt === 1 ? [] : [{
        role: 'user',
        content: `The previous output failed validation: ${lastError}. Return only one JSON object matching outputInstruction.schema.`,
      }];
      const rawOutput = (await this.aiAdapter.analyze([...context.messages, ...repair])).trim();
      lastRawOutput = rawOutput || lastRawOutput;
      if (!rawOutput) {
        lastError = 'AI returned empty output.';
        lastErrorCode = 'ai_empty_output';
        continue;
      }

      try {
        const parsed = JSON.parse(extractJson(rawOutput));
        const validation = outboundEmailEventAnalysisSchema.safeParse(parsed);
        if (validation.success) {
          return {
            success: true,
            analysis: validation.data,
            rawOutput,
            contextSnapshotId: context.contextSnapshotId,
          };
        }
        lastErrorCode = 'ai_validation_failed';
        lastError = validation.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
      } catch (error) {
        lastErrorCode = 'ai_json_parse_failed';
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      success: false,
      errorCode: lastErrorCode,
      message: lastError,
      rawOutput: lastRawOutput,
      contextSnapshotId: context.contextSnapshotId,
    };
  }
}

export { OUTBOUND_EMAIL_EVENT_PROMPT_VERSION };

function extractJson(rawOutput: string): string {
  const value = rawOutput
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI output did not contain a JSON object.');
  return value.slice(start, end + 1);
}

function isEnabled(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
