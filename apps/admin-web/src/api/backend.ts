import { http } from './http';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export interface InquiryCase {
  id: string;
  customerEmail: string;
  customerName?: string;
  subject: string;
  status: string;
  latestMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryListResponse {
  success: boolean;
  inquiryCases: InquiryCase[];
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await http.get<HealthResponse>('/health');
  return response.data;
}

export async function fetchInquiries(): Promise<InquiryCase[]> {
  const response = await http.get<InquiryListResponse>('/inquiries');
  return response.data.inquiryCases;
}
