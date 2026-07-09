import { InquiryRepository } from '../../application/ports/inquiry.repository.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import {
  canUseDomainForOrganizationMatching,
  extractEmailDomain,
} from '../../domain/matching/email-domain-policy.js';

export class InMemoryInquiryRepository implements InquiryRepository {
  private readonly inquiryCases = new Map<string, InquiryCase>();

  async ensureCustomerContact(): Promise<void> {
    return undefined;
  }

  async save(inquiryCase: InquiryCase): Promise<InquiryCase> {
    const saved = {
      ...inquiryCase,
      customerDomain: inquiryCase.customerDomain ?? extractEmailDomain(inquiryCase.customerEmail),
      rawSubject: inquiryCase.rawSubject ?? inquiryCase.subject,
      businessSubject: inquiryCase.businessSubject ?? inquiryCase.subject,
      businessSubjectSource: inquiryCase.businessSubjectSource ?? 'raw_email',
      businessSubjectLocked: inquiryCase.businessSubjectLocked ?? false,
      businessSubjectUpdatedAt: inquiryCase.businessSubjectUpdatedAt ?? new Date(),
    };

    this.inquiryCases.set(saved.id, saved);
    return saved;
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

  async listOpenByCustomerDomain(customerDomain: string): Promise<InquiryCase[]> {
    const domain = customerDomain.toLowerCase();
    if (!canUseDomainForOrganizationMatching(domain)) {
      return [];
    }

    return Array.from(this.inquiryCases.values())
      .filter((inquiryCase) =>
        (inquiryCase.customerDomain ?? extractEmailDomain(inquiryCase.customerEmail)) === domain &&
        inquiryCase.status !== 'closed',
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async list(): Promise<InquiryCase[]> {
    return Array.from(this.inquiryCases.values());
  }
}
