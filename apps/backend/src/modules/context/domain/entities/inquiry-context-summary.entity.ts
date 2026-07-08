export interface InquiryContextSummary {
  id?: string;
  inquiryCaseId: string;
  summaryText: string;
  knownFacts: string[];
  customerDecisions: string[];
  ourCommitments: string[];
  openQuestions: string[];
  coveredMessageIds: string[];
  coveredMessageCount: number;
  coveredFrom?: Date;
  coveredTo?: Date;
  updatedAt: Date;
}
