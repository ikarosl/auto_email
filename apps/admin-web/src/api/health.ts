import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { http } from './http';
import type { HealthResponse } from './shared';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await http.get<HealthResponse>(`/${API_ROUTE_SEGMENTS.health}`);
  return response.data;
}
