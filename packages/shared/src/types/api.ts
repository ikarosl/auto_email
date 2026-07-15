export interface ApiPageResult<T> {
  success: true;
  data: T;
  total: number;
  page: number;
  limit: number;
}

export type InquiryStatus =
  | 'new'
  | 'invalid'
  | 'need_clarification'
  | 'need_engineer_review'
  | 'waiting_customer'
  | 'ready_for_quote'
  | 'quoted'
  | 'closed';

export type CustomerStatus = 'unknown' | 'active' | 'invalid';

export type BusinessSubjectSource = 'raw_email' | 'ai_generated' | 'human';

export type EmailDirection = 'inbound' | 'outbound' | 'internal';

export type AiClassification =
  | 'valid_inquiry'
  | 'invalid'
  | 'unknown';

export interface CustomerListItem {
  id: string;
  organizationId?: string | null;
  email: string;
  name?: string | null;
  domain?: string | null;
  companyName?: string | null;
  country?: string | null;
  source: string;
  status: CustomerStatus | string;
  invalidReason?: string | null;
  statusUpdatedAt?: string | null;
  remark?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  counts?: {
    inquiryCases?: number;
  };
  organization?: OrganizationListItem | null;
}

export interface OrganizationListItem {
  id: string;
  name: string;
  domain?: string | null;
  status: string;
  source: string;
  remark?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  counts?: {
    customers?: number;
    inquiryCases?: number;
  };
}

export interface InquiryListItem {
  id: string;
  customerId: string;
  organizationId?: string | null;
  primaryCustomerId?: string | null;
  status: InquiryStatus | string;
  subject?: string | null;
  rawSubject?: string | null;
  businessSubject?: string | null;
  businessSubjectSource?: BusinessSubjectSource | string | null;
  businessSubjectLocked?: boolean;
  businessSubjectUpdatedAt?: string | null;
  productType?: string | null;
  latestMessageAt?: string | null;
  closedAt?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  customer?: CustomerListItem | null;
  organization?: OrganizationListItem | null;
  primaryCustomer?: CustomerListItem | null;
  structuredFacts?: unknown;
  contextSummary?: unknown;
  statusLogs?: unknown;
  counts?: {
    inquiryMessages?: number;
    aiDecisions?: number;
    replyDrafts?: number;
    contextSnapshots?: number;
    statusLogs?: number;
  };
}

export interface EmailThreadListItem {
  id: string;
  mailboxAccountId: string;
  mailboxEmail?: string | null;
  threadKey: string;
  externalThreadId?: string | null;
  subjectNormalized?: string | null;
  customerEmail?: string | null;
  latestMessageAt?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  counts?: {
    emailMessages?: number;
  };
}

export interface EmailAttachmentListItem {
  id: string;
  emailMessageId: string;
  inquiryCaseId?: string | null;
  originalFileName?: string | null;
  safeFileName: string;
  contentId?: string | null;
  contentDisposition?: string | null;
  mimeType: string;
  fileExtension?: string | null;
  fileSize?: string | null;
  contentHash?: string | null;
  storageProvider: string;
  storagePath?: string | null;
  parseStatus: 'pending' | 'parsed' | 'skipped' | 'failed' | string;
  parseStrategy?: string | null;
  parsedTextPreview?: string | null;
  parsedTextLength?: number | null;
  parseErrorCode?: string | null;
  parseErrorMessage?: string | null;
  parsedAt?: string | null;
  ocrStatus?: 'pending' | 'skipped' | 'parsed' | 'failed' | string;
  ocrProvider?: string | null;
  ocrTextPreview?: string | null;
  ocrErrorCode?: string | null;
  ocrAt?: string | null;
  isInline: boolean;
  isContextCandidate: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EmailMessageListItem {
  id: string;
  emailThreadId?: string | null;
  direction: EmailDirection | string;
  fromEmail: string;
  fromName?: string | null;
  toEmails: unknown;
  ccEmails: unknown;
  subject?: string | null;
  bodyText?: string | null;
  hasAttachments?: boolean;
  attachmentCount?: number;
  attachments?: EmailAttachmentListItem[];
  receivedAt: string | null;
  inquiryLinks?: Array<{
    inquiryCaseId: string;
    relationType: string;
    direction: string;
    inquiryCase?: {
      id: string;
      status: string;
      subject?: string | null;
    } | null;
  }>;
  latestAiDecision?: AiDecisionListItem | null;
}

export interface ContextSnapshotListItem {
  id: string;
  inquiryCaseId?: string | null;
  emailMessageId?: string | null;
  purpose: string;
  contextPayload: unknown;
  messages: unknown;
  sourceReferences: unknown;
  estimatedTokens?: number | null;
  modelName?: string | null;
  createdAt: string | null;
  inquiryCase?: {
    id: string;
    status: string;
    subject?: string | null;
  } | null;
  emailMessage?: {
    id: string;
    fromEmail: string;
    subject?: string | null;
    receivedAt?: string | null;
  } | null;
}

export interface AiDecisionListItem {
  id: string;
  emailMessageId?: string | null;
  inquiryCaseId?: string | null;
  classification?: AiClassification | string | null;
  suggestedStatus?: InquiryStatus | string | null;
  confidence?: number | null;
  riskLevel?: string | null;
  reason?: string | null;
  missingFields?: unknown;
  extractedRequirements?: unknown;
  quoteBoundaryDetected: boolean;
  humanReviewRequired: boolean;
  nextAction?: string | null;
  rawResult?: unknown;
  modelName?: string | null;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  executionStatus?: 'not_evaluated' | 'disabled' | 'rejected' | 'dry_run' | 'applied' | 'conflict';
  executionFromStatus?: InquiryStatus | string | null;
  executionToStatus?: InquiryStatus | string | null;
  executionReason?: string | null;
  executionPolicyVersion?: string | null;
  executedAt?: string | null;
  createdAt: string | null;
  emailMessage?: {
    id: string;
    fromEmail: string;
    subject?: string | null;
    receivedAt?: string | null;
  } | null;
  inquiryCase?: {
    id: string;
    status: string;
    subject?: string | null;
  } | null;
}

export interface ReplyDraftListItem {
  id: string;
  inquiryCaseId: string;
  sourceEmailMessageId?: string | null;
  sentEmailMessageId?: string | null;
  draftType: string;
  status: string;
  subject?: string | null;
  bodyText: string;
  modelName?: string | null;
  contextSnapshotId?: string | null;
  aiDecisionId?: string | null;
  language?: string | null;
  usedFacts?: string[];
  unresolvedQuestions?: string[];
  warnings?: string[];
  requiresCommercialReview?: boolean;
  promptVersion?: string | null;
  version: number;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  sentAt?: string | null;
  lastSendError?: string | null;
  createdByType: string;
  createdAt: string | null;
  updatedAt: string | null;
  inquiryCase?: {
    id: string;
    status: string;
    subject?: string | null;
    customer?: {
      email: string;
      name?: string | null;
    } | null;
  } | null;
  attachments?: EmailAttachmentListItem[];
  sendAttempts?: EmailSendAttemptListItem[];
}

export interface EmailSendAttemptListItem {
  id: string;
  operationMode: 'debug' | 'production';
  provider: 'simulated' | 'smtp';
  status: 'simulated' | 'accepted' | 'rejected' | 'failed' | 'unknown';
  messageId?: string | null;
  recipient: string;
  subject: string;
  initiatedBy: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string | null;
  completedAt?: string | null;
}

export interface MailRuntimeInfo {
  mailOperationMode: 'debug' | 'production';
  imapPollEnabled: boolean;
}

export type EmailWorkflowExecutionStatus =
  | 'pending'
  | 'dry_run'
  | 'applied'
  | 'rejected'
  | 'conflict'
  | 'no_change'
  | 'historical_backfill'
  | 'failed';

export interface EmailWorkflowDecisionListItem {
  id: string;
  emailMessageId: string;
  inquiryCaseId: string;
  aiDecisionId?: string | null;
  direction: 'inbound' | 'outbound';
  source: string;
  eventType: string;
  responseExpected: boolean;
  suggestedStatus?: InquiryStatus | string | null;
  confidence?: number | null;
  riskLevel?: 'low' | 'medium' | 'high' | null;
  reason?: string | null;
  commercialBoundaryDetected: boolean;
  humanReviewRequired: boolean;
  decisionSource: 'ai' | 'system_rule';
  modelName?: string | null;
  promptVersion?: string | null;
  executionStatus: EmailWorkflowExecutionStatus;
  executionFromStatus?: InquiryStatus | string | null;
  executionToStatus?: InquiryStatus | string | null;
  executionReason?: string | null;
  executedAt?: string | null;
  createdAt: string | null;
  emailMessage?: {
    subject?: string | null;
    fromEmail: string;
    receivedAt?: string | null;
  };
}
