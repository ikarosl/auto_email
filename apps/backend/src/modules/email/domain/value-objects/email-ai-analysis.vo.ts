import type { EmailWorkflowAnalysisSchemaOutput } from '../../application/dto/email-ai-analysis.schema.js';

export type EmailMessageClassification = EmailWorkflowAnalysisSchemaOutput['messageClassification'];
export type EmailAiRiskLevel = EmailWorkflowAnalysisSchemaOutput['riskLevel'];
export type EmailExtractedRequirements = EmailWorkflowAnalysisSchemaOutput['extractedRequirements'];
export type EmailWorkflowAnalysis = EmailWorkflowAnalysisSchemaOutput;
export type EmailAiAnalysis = EmailWorkflowAnalysis;
