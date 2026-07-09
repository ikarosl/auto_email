import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type {
  ApiPageResult,
  InquiryListItem,
} from '@email-inquiry/shared';

import { http } from './http';
import type { ListParams } from './shared';
import { fetchItem, fetchPage } from './shared';

export async function fetchInquiries(params: ListParams = {}) {
  return fetchPage<InquiryListItem>(`/${API_ROUTE_SEGMENTS.inquiries}`, params);
}

export async function fetchInquiry(id: string) {
  return fetchItem<InquiryListItem>(`/${API_ROUTE_SEGMENTS.inquiries}/${id}`);
}

export async function updateInquiry(id: string, data: Record<string, unknown>) {
  const response = await http.patch<ApiPageResult<InquiryListItem>>(
    `/${API_ROUTE_SEGMENTS.inquiries}/${id}`,
    data,
  );
  return response.data.data;
}

export async function transitionInquiryStatus(
  inquiryId: string,
  data: {
    toStatus: string;
    reason?: string;
    operatorType?: string;
  },
) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/transitions`,
    data,
  );
  return response.data;
}

export async function linkMessageToInquiry(
  inquiryId: string,
  data: {
    mode: 'link_existing_email';
    emailMessageId: string;
    relationReason?: string;
    changedBy?: string;
  },
) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/messages`,
    data,
  );
  return response.data;
}

export async function createManualEmail(
  inquiryId: string,
  data: {
    mode: 'create_manual_email';
    direction: 'inbound' | 'outbound';
    fromEmail: string;
    fromName?: string;
    subject: string;
    bodyText?: string;
    receivedAt: string;
    relationReason?: string;
    changedBy?: string;
  },
) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryId}/messages`,
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

export async function moveInquiryMessage(
  messageId: string,
  data: {
    targetInquiryCaseId: string;
    reason?: string;
    changedBy?: string;
  },
) {
  const response = await http.post(
    `/${API_ROUTE_SEGMENTS.inquiryMessages}/${messageId}/move`,
    data,
  );
  return response.data;
}
