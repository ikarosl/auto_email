import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';

export interface UpdateInquiryDto {
  businessSubject?: string;
  businessSubjectLocked?: boolean;
  primaryCustomerId?: string | null;
  organizationId?: string | null;
  productType?: string | null;
  status?: InquiryStatus;
}
