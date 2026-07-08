import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  CustomerRepository,
  UpdateCustomerStatusInput,
} from '../../application/ports/customer.repository.js';
import { CustomerStatus } from '../../domain/enums/customer-status.enum.js';

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatusByEmail(input: UpdateCustomerStatusInput): Promise<void> {
    await this.prisma.customer.updateMany({
      where: { email: input.email.toLowerCase().trim() },
      data: {
        status: input.status,
        invalidReason: input.status === CustomerStatus.INVALID
          ? input.invalidReason ?? null
          : null,
        statusUpdatedAt: input.statusUpdatedAt,
        updatedAt: input.statusUpdatedAt,
      },
    });
  }
}
