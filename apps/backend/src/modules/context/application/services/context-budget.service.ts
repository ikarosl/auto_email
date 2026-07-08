import { AiEmailAnalysisContextPayload } from '../dto/ai-email-analysis-context.schema.js';
import { TokenEstimator } from '../ports/token-estimator.js';
import { ContextBudget } from '../../domain/value-objects/context-budget.vo.js';
import { AiEmailThreadMessageContext } from '../dto/ai-email-analysis-context.schema.js';

export interface ContextBudgetResult {
  recentThreadMessages: AiEmailThreadMessageContext[];
  overflowThreadMessages: AiEmailThreadMessageContext[];
  fixedTokens: number;
  recentMessagesBudget: number;
}

export class ContextBudgetService {
  constructor(private readonly tokenEstimator: TokenEstimator) {}

  applyRecentMessageBudget(
    payload: AiEmailAnalysisContextPayload,
    systemPrompt: string,
    budget: ContextBudget,
  ): ContextBudgetResult {
    const fixedPayload: AiEmailAnalysisContextPayload = {
      ...payload,
      recentThreadMessages: [],
    };
    const fixedTokens = this.tokenEstimator.estimateText(systemPrompt)
      + this.tokenEstimator.estimateText(JSON.stringify(fixedPayload, null, 2));
    const inputTokenBudget = Math.floor(
      (budget.maxContextTokens ?? 64000) * (budget.inputTokenRatio ?? 0.8),
    );
    const recentMessagesBudget = Math.max(
      0,
      inputTokenBudget - fixedTokens,
    );

    const keptNewestFirst: AiEmailThreadMessageContext[] = [];
    const overflowNewestFirst: AiEmailThreadMessageContext[] = [];
    let usedTokens = 0;

    for (const message of [...payload.recentThreadMessages].reverse()) {
      const messageTokens = this.tokenEstimator.estimateText(JSON.stringify(message));
      if (usedTokens + messageTokens <= recentMessagesBudget) {
        keptNewestFirst.push(message);
        usedTokens += messageTokens;
      } else {
        overflowNewestFirst.push(message);
      }
    }

    return {
      recentThreadMessages: keptNewestFirst.reverse(),
      overflowThreadMessages: overflowNewestFirst.reverse(),
      fixedTokens,
      recentMessagesBudget,
    };
  }
}
