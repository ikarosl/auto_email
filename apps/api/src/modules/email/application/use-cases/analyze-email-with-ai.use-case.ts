import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import { emailAiAnalysisSchema } from '../dto/email-ai-analysis.schema.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';

export interface AnalyzeEmailWithAiSuccess {
  success: true;
  analysis: EmailAiAnalysis;
  rawOutput: string;
}

export interface AnalyzeEmailWithAiFailure {
  success: false;
  errorCode: 'ai_empty_output' | 'ai_json_parse_failed' | 'ai_validation_failed';
  message: string;
  rawOutput?: string;
  humanReviewRequired: true;
}

export type AnalyzeEmailWithAiResult = AnalyzeEmailWithAiSuccess | AnalyzeEmailWithAiFailure;

export class AnalyzeEmailWithAiUseCase {
  constructor(private readonly emailAiAnalysisAdapter: EmailAiAnalysisAdapter) {}

  async execute(emailMessage: EmailMessage): Promise<AnalyzeEmailWithAiResult> {
    const rawOutput = (await this.emailAiAnalysisAdapter.analyze(emailMessage)).trim();

    if (!rawOutput) {
      return {
        success: false,
        errorCode: 'ai_empty_output',
        message: 'AI returned empty output.',
        humanReviewRequired: true,
      };
    }

    const jsonText = extractJsonText(rawOutput);
    if (!jsonText) {
      return {
        success: false,
        errorCode: 'ai_json_parse_failed',
        message: 'AI output did not contain a JSON object.',
        rawOutput,
        humanReviewRequired: true,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      return {
        success: false,
        errorCode: 'ai_json_parse_failed',
        message: error instanceof Error ? error.message : String(error),
        rawOutput,
        humanReviewRequired: true,
      };
    }

    const validation = emailAiAnalysisSchema.safeParse(parsed);
    if (!validation.success) {
      return {
        success: false,
        errorCode: 'ai_validation_failed',
        message: validation.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
        rawOutput,
        humanReviewRequired: true,
      };
    }

    return {
      success: true,
      analysis: validation.data,
      rawOutput,
    };
  }
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
