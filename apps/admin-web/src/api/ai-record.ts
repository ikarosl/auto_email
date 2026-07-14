import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type {
  ApiPageResult,
  AiDecisionListItem,
  MailRuntimeInfo,
  ReplyDraftListItem,
} from '@email-inquiry/shared';

import type { ListParams } from './shared';
import { fetchItem, fetchPage } from './shared';
import { http } from './http';

export async function fetchAiDecisions(params: ListParams = {}) {
  return fetchPage<AiDecisionListItem>(`/${API_ROUTE_SEGMENTS.aiDecisions}`, params);
}

export async function fetchReplyDrafts(params: ListParams = {}) {
  return fetchPage<ReplyDraftListItem>(`/${API_ROUTE_SEGMENTS.replyDrafts}`, params);
}

export async function fetchReplyDraft(id: string) {
  return fetchItem<ReplyDraftListItem>(`/${API_ROUTE_SEGMENTS.replyDrafts}/${id}`);
}

export async function fetchMailRuntime() {
  return fetchItem<MailRuntimeInfo>(`/${API_ROUTE_SEGMENTS.runtimeConfig}`);
}

export async function createReplyDraft(
  inquiryCaseId: string,
  data: { targetStatus?: string; commercialTerms?: string; operator?: string } = {},
) {
  const response = await http.post<ApiPageResult<ReplyDraftListItem>>(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryCaseId}/reply-drafts`,
    data,
  );
  return response.data.data;
}

async function postDraftAction<T>(id: string, action: string, data: Record<string, unknown> = {}) {
  const response = await http.post<ApiPageResult<T>>(
    `/${API_ROUTE_SEGMENTS.replyDrafts}/${id}/${action}`,
    data,
  );
  return response.data.data;
}

export async function updateReplyDraft(
  id: string,
  data: { version: number; subject: string; bodyText: string; attachmentIds?: string[] },
) {
  const response = await http.patch<ApiPageResult<ReplyDraftListItem>>(
    `/${API_ROUTE_SEGMENTS.replyDrafts}/${id}`,
    data,
  );
  return response.data.data;
}

export const approveReplyDraft = (id: string, operator?: string) =>
  postDraftAction<ReplyDraftListItem>(id, 'approve', { operator });
export const rejectReplyDraft = (id: string, reason: string, operator?: string) =>
  postDraftAction<ReplyDraftListItem>(id, 'reject', { reason, operator });
export const regenerateReplyDraft = (id: string, commercialTerms?: string, operator?: string) =>
  postDraftAction<ReplyDraftListItem>(id, 'regenerate', { commercialTerms, operator });
export const sendReplyDraft = (id: string, operator?: string) =>
  postDraftAction<Record<string, unknown>>(id, 'send', { operator });
