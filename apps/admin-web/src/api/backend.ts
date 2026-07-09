import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type {
  AiDecisionListItem,
  ApiPageResult,
  ContextSnapshotListItem,
  CustomerListItem,
  EmailMessageListItem,
  EmailThreadListItem,
  InquiryListItem,
  ReplyDraftListItem,
} from '@email-inquiry/shared';

import { http } from './http';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  inquiryCaseId?: string;
  emailMessageId?: string;
  customerEmail?: string;
  classification?: string;
  success?: boolean;
  purpose?: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await http.get<HealthResponse>(`/${API_ROUTE_SEGMENTS.health}`);
  return response.data;
}

export async function fetchInquiries(params: ListParams = {}) {
  return fetchPage<InquiryListItem>(`/${API_ROUTE_SEGMENTS.inquiries}`, params);
}

export async function fetchInquiry(id: string) {
  return fetchItem<InquiryListItem>(`/${API_ROUTE_SEGMENTS.inquiries}/${id}`);
}

export async function fetchCustomers(params: ListParams = {}) {
  return fetchPage<CustomerListItem>(`/${API_ROUTE_SEGMENTS.customers}`, params);
}

export async function fetchEmailThreads(params: ListParams = {}) {
  return fetchPage<EmailThreadListItem>(`/${API_ROUTE_SEGMENTS.emailThreads}`, params);
}

export async function fetchEmailThread(id: string) {
  return fetchItem<EmailThreadListItem>(`/${API_ROUTE_SEGMENTS.emailThreads}/${id}`);
}

export async function fetchEmailThreadMessages(threadId: string, params: ListParams = {}) {
  return fetchPage<EmailMessageListItem>(
    `/${API_ROUTE_SEGMENTS.emailThreads}/${threadId}/messages`,
    params,
  );
}

export async function fetchContextSnapshots(params: ListParams = {}) {
  return fetchPage<ContextSnapshotListItem>(`/${API_ROUTE_SEGMENTS.contextSnapshots}`, params);
}

export async function fetchContextSnapshot(id: string) {
  return fetchItem<ContextSnapshotListItem>(`/${API_ROUTE_SEGMENTS.contextSnapshots}/${id}`);
}

export async function fetchAiDecisions(params: ListParams = {}) {
  return fetchPage<AiDecisionListItem>(`/${API_ROUTE_SEGMENTS.aiDecisions}`, params);
}

export async function fetchReplyDrafts(params: ListParams = {}) {
  return fetchPage<ReplyDraftListItem>(`/${API_ROUTE_SEGMENTS.replyDrafts}`, params);
}

// ── Correction / Mutation APIs ──

export async function updateInquiry(id: string, data: Record<string, unknown>) {
  const response = await http.patch<ApiPageResult<InquiryListItem>>(`/${API_ROUTE_SEGMENTS.inquiries}/${id}`, data);
  return response.data.data;
}

export async function updateCustomer(id: string, data: Record<string, unknown>) {
  const response = await http.patch<ApiPageResult<CustomerListItem>>(
    `/${API_ROUTE_SEGMENTS.customers}/${id}`,
    data,
  );
  return response.data.data;
}

export async function transitionInquiryStatus(inquiryId: string, data: {
  toStatus: string;
  reason?: string;
  operatorType?: string;
}) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/transitions`,
    data,
  );
  return response.data;
}

export async function linkMessageToInquiry(inquiryId: string, data: {
  mode: 'link_existing_email';
  emailMessageId: string;
  relationReason?: string;
  changedBy?: string;
}) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/messages`,
    data,
  );
  return response.data;
}

export async function createManualEmail(inquiryId: string, data: {
  mode: 'create_manual_email';
  direction: 'inbound' | 'outbound';
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyText?: string;
  receivedAt: string;
  relationReason?: string;
  changedBy?: string;
}) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/messages`,
    data,
  );
  return response.data;
}

export async function moveInquiryMessage(messageId: string, data: {
  targetInquiryCaseId: string;
  reason?: string;
  changedBy?: string;
}) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiryMessages}/${messageId}/move`,
    data,
  );
  return response.data;
}

export async function fetchInquiryMessages(inquiryId: string, params: ListParams = {}) {
  return fetchPage<any>(`/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/messages`, params);
}

export async function fetchMessage(id: string) {
  return fetchItem<any>(`/${API_ROUTE_SEGMENTS.messages}/${id}`);
}

export async function fetchInquiryThread(inquiryId: string) {
  return fetchItem<any>(`/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/thread`);
}

async function fetchPage<T>(url: string, params: ListParams): Promise<ApiPageResult<T[]>> {
  const response = await http.get<ApiPageResult<T[]>>(url, { params });
  return response.data;
}

async function fetchItem<T>(url: string): Promise<T> {
  const response = await http.get<ApiPageResult<T>>(url);
  return response.data.data;
}
