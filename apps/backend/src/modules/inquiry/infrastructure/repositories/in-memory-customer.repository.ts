import {
  CustomerRepository,
  UpdateCustomerStatusInput,
} from '../../application/ports/customer.repository.js';
import { CustomerStatus } from '../../domain/enums/customer-status.enum.js';

export interface InMemoryCustomerRecord {
  email: string;
  status: CustomerStatus;
  invalidReason?: string;
  statusUpdatedAt?: Date;
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly customers = new Map<string, InMemoryCustomerRecord>();

  async updateStatusByEmail(input: UpdateCustomerStatusInput): Promise<void> {
    const email = input.email.toLowerCase().trim();
    this.customers.set(email, {
      email,
      status: input.status,
      invalidReason: input.status === CustomerStatus.INVALID
        ? input.invalidReason
        : undefined,
      statusUpdatedAt: input.statusUpdatedAt,
    });
  }

  async findByEmail(email: string): Promise<InMemoryCustomerRecord | undefined> {
    return this.customers.get(email.toLowerCase().trim());
  }
}
