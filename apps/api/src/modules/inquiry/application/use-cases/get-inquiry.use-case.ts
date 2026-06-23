import { BusinessError } from '../../../../common/errors/business-error.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';

export class GetInquiryUseCase {
  constructor(private readonly inquiryRepository: InquiryRepository) {}

  async execute(id: string): Promise<InquiryCase> {
    const inquiryCase = await this.inquiryRepository.findById(id);
    if (!inquiryCase) {
      throw new BusinessError(`Inquiry case not found: ${id}`, 'INQUIRY_NOT_FOUND');
    }

    return inquiryCase;
  }
}
