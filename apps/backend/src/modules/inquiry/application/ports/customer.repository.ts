import { CustomerStatus } from '../../domain/enums/customer-status.enum.js';

export interface UpdateCustomerStatusInput {
  email: string;
  status: CustomerStatus;
  invalidReason?: string;
  statusUpdatedAt: Date;
}

export interface CustomerRepository {
  updateStatusByEmail(input: UpdateCustomerStatusInput): Promise<void>;
}
