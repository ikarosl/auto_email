import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type { ApiPageResult } from '@email-inquiry/shared';

import { http } from './http';
import type {
  InquiryBusinessEventListItem,
  InquiryStateDecisionListItem,
  InquiryStateTransitionListItem,
} from '@/types/inquiry-state';
import type { ListParams } from './shared';
import { fetchItem, fetchPage } from './shared';

export async function fetchStateDecisions(inquiryCaseId: string, params: ListParams = {}) {
  return fetchPage<InquiryStateDecisionListItem>(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryCaseId}/state-decisions`,
    params,
  );
}

export async function applyStateDecision(decisionId: string, reason?: string) {
  const response = await http.post<ApiPageResult<InquiryStateDecisionListItem>>(
    `/inquiry-state-decisions/${decisionId}/apply`,
    { reason },
  );
  return response.data.data;
}

export async function rejectStateDecision(decisionId: string, reason: string) {
  const response = await http.post<ApiPageResult<InquiryStateDecisionListItem>>(
    `/inquiry-state-decisions/${decisionId}/reject`,
    { reason },
  );
  return response.data.data;
}

export async function submitStateCorrection(
  inquiryCaseId: string,
  data: {
    businessStage: string;
    actionOwner: string;
    lifecycleStatus: string;
    reason: string;
  },
) {
  const response = await http.post<ApiPageResult<InquiryStateDecisionListItem>>(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryCaseId}/state-corrections`,
    data,
  );
  return response.data.data;
}

export async function fetchBusinessEvents(inquiryCaseId: string, params: ListParams = {}) {
  return fetchPage<InquiryBusinessEventListItem>(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryCaseId}/business-events`,
    params,
  );
}

export async function fetchStateTransitions(inquiryCaseId: string, params: ListParams = {}) {
  return fetchPage<InquiryStateTransitionListItem>(
    `/${API_ROUTE_SEGMENTS.inquiries}/${inquiryCaseId}/state-transitions`,
    params,
  );
}
