import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  AiDecisionRepository,
  SaveAiDecisionInput,
} from '../../application/ports/ai-decision.repository.js';
import { AnalyzeEmailWithAiFailure } from '../../application/use-cases/analyze-email-with-ai.use-case.js';
import { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';

export class PrismaAiDecisionRepository implements AiDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(input: SaveAiDecisionInput): Promise<string> {
    if (isAiFailure(input.result)) {
      const decision = await this.prisma.aiDecision.create({
        data: {
          emailMessageId: input.emailMessageId,
          inquiryCaseId: input.inquiryCaseId,
          success: false,
          errorCode: input.result.errorCode,
          errorMessage: input.result.message,
          rawResult: {
            rawOutput: input.rawOutput ?? input.result.rawOutput,
            errorCode: input.result.errorCode,
            message: input.result.message,
          },
        },
      });
      return decision.id;
    }

    const analysis = input.result;
    const decision = await this.prisma.aiDecision.create({
      data: {
        emailMessageId: input.emailMessageId,
        inquiryCaseId: input.inquiryCaseId,
        classification: analysis.classification,
        suggestedStatus: analysis.suggestedStatus,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        reason: analysis.reason,
        missingFields: analysis.missingFields,
        extractedRequirements: toJson(analysis.extractedRequirements),
        quoteBoundaryDetected: analysis.quoteBoundaryDetected,
        humanReviewRequired: analysis.humanReviewRequired,
        nextAction: analysis.nextAction,
        rawResult: toJson(analysis),
        success: true,
      },
    });
    return decision.id;
  }
}

function isAiFailure(
  result: EmailAiAnalysis | AnalyzeEmailWithAiFailure,
): result is AnalyzeEmailWithAiFailure {
  return 'success' in result && result.success === false;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
