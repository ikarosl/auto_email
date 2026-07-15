import { EmailAiAnalysis } from '../../../email/domain/value-objects/email-ai-analysis.vo.js';
import { CustomerStatus } from '../../domain/enums/customer-status.enum.js';
import { CustomerRepository } from '../ports/customer.repository.js';

const INVALID_CUSTOMER_CONFIDENCE_THRESHOLD = 0.9;

export interface UpdateCustomerStatusFromAiAnalysisInput {
  customerEmail: string;
  analysis: EmailAiAnalysis;
}

export interface CustomerStatusUpdateResult {
  updated: boolean;
  status?: CustomerStatus;
  invalidReason?: string;
}

export class UpdateCustomerStatusFromAiAnalysisUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(
    input: UpdateCustomerStatusFromAiAnalysisInput,
  ): Promise<CustomerStatusUpdateResult> {
    if (['customer_inquiry', 'customer_follow_up'].includes(input.analysis.messageClassification)) {
      await this.customerRepository.updateStatusByEmail({
        email: input.customerEmail,
        status: CustomerStatus.ACTIVE,
        statusUpdatedAt: new Date(),
      });

      return { updated: true, status: CustomerStatus.ACTIVE };
    }

    if (
      ['invalid', 'commercial_solicitation', 'unrelated_product'].includes(input.analysis.messageClassification)
      && input.analysis.confidence >= INVALID_CUSTOMER_CONFIDENCE_THRESHOLD
    ) {
      await this.customerRepository.updateStatusByEmail({
        email: input.customerEmail,
        status: CustomerStatus.INVALID,
        invalidReason: input.analysis.reason,
        statusUpdatedAt: new Date(),
      });

      return {
        updated: true,
        status: CustomerStatus.INVALID,
        invalidReason: input.analysis.reason,
      };
    }

    return { updated: false };
  }
}
