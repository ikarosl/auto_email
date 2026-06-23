export interface ContextBudget {
  systemRulesTokens: number;
  customerProfileTokens: number;
  structuredFactsTokens: number;
  historySummaryTokens: number;
  recentMessagesTokens: number;
  ragTokens: number;
  currentEmailTokens: number;
  outputTokens: number;
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
