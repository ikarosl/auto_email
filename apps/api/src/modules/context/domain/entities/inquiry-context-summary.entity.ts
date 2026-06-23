export interface InquiryContextSummary {
  inquiryCaseId: string;
  summaryText: string;
  customerIntentSummary: string;
  ourLastPositionSummary: string;
  unresolvedQuestions: string[];
  keyDecisions: string[];
  riskNotes: string[];
  coveredEmailIds: string[];
  updatedAt: Date;
}
