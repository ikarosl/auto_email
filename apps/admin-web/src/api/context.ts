import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type { ContextSnapshotListItem } from '@email-inquiry/shared';

import type { ListParams } from './shared';
import { fetchItem, fetchPage } from './shared';

export async function fetchContextSnapshots(params: ListParams = {}) {
  return fetchPage<ContextSnapshotListItem>(`/${API_ROUTE_SEGMENTS.contextSnapshots}`, params);
}

export async function fetchContextSnapshot(id: string) {
  return fetchItem<ContextSnapshotListItem>(`/${API_ROUTE_SEGMENTS.contextSnapshots}/${id}`);
}
