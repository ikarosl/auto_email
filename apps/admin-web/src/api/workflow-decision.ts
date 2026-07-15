import type { ApiPageResult, EmailWorkflowDecisionListItem } from '@email-inquiry/shared';

import { http } from './http';

export async function fetchInquiryWorkflowDecisions(
  inquiryCaseId: string,
  params: { page?: number; limit?: number } = {},
) {
  return http.get<ApiPageResult<EmailWorkflowDecisionListItem[]>>(
    `/inquiries/${inquiryCaseId}/workflow-decisions`,
    { params },
  ).then((response) => response.data);
}

export async function applyWorkflowDecision(
  id: string,
  input: { reason?: string; changedBy?: string } = {},
) {
  return http.post<ApiPageResult<EmailWorkflowDecisionListItem>>(
    `/email-workflow-decisions/${id}/apply`,
    input,
  ).then((response) => response.data.data);
}

export async function rejectWorkflowDecision(
  id: string,
  input: { reason: string; changedBy?: string },
) {
  return http.post<ApiPageResult<EmailWorkflowDecisionListItem>>(
    `/email-workflow-decisions/${id}/reject`,
    input,
  ).then((response) => response.data.data);
}
