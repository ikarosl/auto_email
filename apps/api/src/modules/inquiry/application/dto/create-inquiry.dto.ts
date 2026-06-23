export interface CreateInquiryDto {
  customerEmail: string;
  customerName?: string;
  subject: string;
  latestMessageAt?: string;
}
