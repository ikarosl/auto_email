export interface UpdateCustomerDto {
  organizationId?: string | null;
  name?: string;
  companyName?: string | null;
  status?: 'unknown' | 'active' | 'invalid';
  invalidReason?: string | null;
  remark?: string | null;
}
