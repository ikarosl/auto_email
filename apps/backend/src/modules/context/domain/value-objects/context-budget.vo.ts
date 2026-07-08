export interface ContextBudget {
  systemRulesTokens: number;
  customerProfileTokens: number;
  structuredFactsTokens: number;
  historySummaryTokens: number;
  recentMessagesTokens: number;
  ragTokens: number;
  currentEmailTokens: number;
  outputTokens: number;
  maxContextTokens?: number;
  inputTokenRatio?: number;
  outputTokenRatio?: number;
  safetyTokenRatio?: number;
}

export const DEFAULT_EMAIL_ANALYSIS_CONTEXT_BUDGET: ContextBudget = {
  systemRulesTokens: 1500,
  customerProfileTokens: 500,
  structuredFactsTokens: 1000,
  historySummaryTokens: 1500,
  recentMessagesTokens: 3000,
  ragTokens: 3000,
  currentEmailTokens: 2000,
  outputTokens: 2000,
};

export function getEmailAnalysisContextBudgetFromEnv(env: NodeJS.ProcessEnv): ContextBudget {
  const maxContextTokens = readPositiveInteger(env.AI_CONTEXT_MAX_TOKENS, 64000);
  const inputTokenRatio = readRatio(env.AI_CONTEXT_INPUT_TOKEN_RATIO, 0.8);
  const outputTokenRatio = readRatio(env.AI_CONTEXT_OUTPUT_TOKEN_RATIO, 0.1);
  const safetyTokenRatio = readRatio(
    env.AI_CONTEXT_SAFETY_TOKEN_RATIO,
    Math.max(0, 1 - inputTokenRatio - outputTokenRatio),
  );

  return {
    ...DEFAULT_EMAIL_ANALYSIS_CONTEXT_BUDGET,
    maxContextTokens,
    inputTokenRatio,
    outputTokenRatio,
    safetyTokenRatio,
    outputTokens: Math.floor(maxContextTokens * outputTokenRatio),
    recentMessagesTokens: Math.floor(maxContextTokens * inputTokenRatio),
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readRatio(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}
