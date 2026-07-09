export interface ApiPageResult<T> {
  success: true;
  data: T;
  total: number;
  page: number;
  limit: number;
}

export type InquiryStatus =
  | 'new'
  | 'need_clarification'
  | 'need_engineer_review'
  | 'ready_for_quote'
  | 'quoted'
  | 'closed'
  | 'invalid';

export type CustomerStatus = 'unknown' | 'active' | 'invalid';

export type BusinessSubjectSource = 'raw_email' | 'ai_generated' | 'human';

export type EmailDirection = 'inbound' | 'outbound' | 'internal';

export type AiClassification =
  | 'valid_inquiry'
  | 'invalid'
  | 'unrelated_product'
  | 'commercial'
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
}
