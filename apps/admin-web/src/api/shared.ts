import type { ApiPageResult } from '@email-inquiry/shared';

import { http } from './http';

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

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export async function fetchPage<T>(url: string, params: ListParams): Promise<ApiPageResult<T[]>> {
  const response = await http.get<ApiPageResult<T[]>>(url, { params });
  return response.data;
}

export async function fetchItem<T>(url: string): Promise<T> {
  const response = await http.get<ApiPageResult<T>>(url);
  return response.data.data;
}
