import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type {
  EmailMessageListItem,
  EmailThreadListItem,
} from '@email-inquiry/shared';

import type { ListParams } from './shared';
import { fetchItem, fetchPage } from './shared';

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
