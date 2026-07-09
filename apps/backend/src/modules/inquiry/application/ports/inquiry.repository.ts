import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';

export interface EnsureCustomerContactInput {
  email: string;
  name?: string;
}

export interface InquiryRepository {
  save(inquiryCase: InquiryCase): Promise<InquiryCase>;
  ensureCustomerContact(input: EnsureCustomerContactInput): Promise<void>;
  findById(id: string): Promise<InquiryCase | undefined>;
  listOpenByCustomerEmail(customerEmail: string): Promise<InquiryCase[]>;
  listOpenByCustomerDomain(customerDomain: string): Promise<InquiryCase[]>;
  list(): Promise<InquiryCase[]>;
}
