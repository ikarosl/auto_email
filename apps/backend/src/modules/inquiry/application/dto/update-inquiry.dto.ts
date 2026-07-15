export interface UpdateInquiryDto {
  businessSubject?: string;
  businessSubjectLocked?: boolean;
  primaryCustomerId?: string | null;
  organizationId?: string | null;
  productType?: string | null;
}
