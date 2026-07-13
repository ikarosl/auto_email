import type { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import type { AnalyzeEmailWithAiFailure } from '../use-cases/analyze-email-with-ai.use-case.js';

export interface SaveAiDecisionInput {
  emailMessageId: string;
  inquiryCaseId: string;
  result: EmailAiAnalysis | AnalyzeEmailWithAiFailure;
  rawOutput?: string;
}

export interface AiDecisionRepository {
  save(input: SaveAiDecisionInput): Promise<string>;
}
