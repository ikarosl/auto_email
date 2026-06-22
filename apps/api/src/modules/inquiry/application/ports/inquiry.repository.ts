import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';

export interface InquiryRepository {
  save(inquiryCase: InquiryCase): Promise<InquiryCase>;
  findById(id: string): Promise<InquiryCase | undefined>;
  list(): Promise<InquiryCase[]>;
}
