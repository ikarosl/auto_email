import { InquiryRepository } from '../../application/ports/inquiry.repository.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';

export class InMemoryInquiryRepository implements InquiryRepository {
  private readonly inquiryCases = new Map<string, InquiryCase>();

  async save(inquiryCase: InquiryCase): Promise<InquiryCase> {
    this.inquiryCases.set(inquiryCase.id, inquiryCase);
    return inquiryCase;
  }

  async findById(id: string): Promise<InquiryCase | undefined> {
    return this.inquiryCases.get(id);
  }

  async listOpenByCustomerEmail(customerEmail: string): Promise<InquiryCase[]> {
    return Array.from(this.inquiryCases.values())
      .filter((inquiryCase) =>
        inquiryCase.customerEmail.toLowerCase() === customerEmail.toLowerCase() &&
        inquiryCase.status !== 'closed',
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async list(): Promise<InquiryCase[]> {
    return Array.from(this.inquiryCases.values());
  }
}
