import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';
import { getConfiguredNextStatuses } from '../../domain/state-machine/inquiry-transitions.js';
import { GetInquiryUseCase } from './get-inquiry.use-case.js';

export interface ListAllowedTransitionsResult {
  currentStatus: InquiryStatus;
  allowedNextStatuses: readonly InquiryStatus[];
}

export class ListAllowedTransitionsUseCase {
  constructor(private readonly getInquiryUseCase: GetInquiryUseCase) {}

  async execute(inquiryCaseId: string): Promise<ListAllowedTransitionsResult> {
    const inquiryCase = await this.getInquiryUseCase.execute(inquiryCaseId);

    return {
      currentStatus: inquiryCase.status,
      allowedNextStatuses: getConfiguredNextStatuses(inquiryCase.status),
    };
  }
}
