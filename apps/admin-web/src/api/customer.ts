import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';
import type {
  ApiPageResult,
  CustomerListItem,
} from '@email-inquiry/shared';

import { http } from './http';
import type { ListParams } from './shared';
import { fetchPage } from './shared';

export async function fetchCustomers(params: ListParams = {}) {
  return fetchPage<CustomerListItem>(`/${API_ROUTE_SEGMENTS.customers}`, params);
}

export async function updateCustomer(id: string, data: Record<string, unknown>) {
  const response = await http.patch<ApiPageResult<CustomerListItem>>(
    `/${API_ROUTE_SEGMENTS.customers}/${id}`,
    data,
  );
  return response.data.data;
}
