import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type {
  AiDecisionListItem,
  ReplyDraftListItem,
} from '@email-inquiry/shared';

import type { ListParams } from './shared';
import { fetchPage } from './shared';

export async function fetchAiDecisions(params: ListParams = {}) {
  return fetchPage<AiDecisionListItem>(`/${API_ROUTE_SEGMENTS.aiDecisions}`, params);
}

export async function fetchReplyDrafts(params: ListParams = {}) {
  return fetchPage<ReplyDraftListItem>(`/${API_ROUTE_SEGMENTS.replyDrafts}`, params);
}
