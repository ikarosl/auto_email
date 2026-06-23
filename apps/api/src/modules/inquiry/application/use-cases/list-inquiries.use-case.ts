import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';

export class ListInquiriesUseCase {
  constructor(private readonly inquiryRepository: InquiryRepository) {}

  async execute(): Promise<InquiryCase[]> {
    return this.inquiryRepository.list();
  }
}
