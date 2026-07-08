export interface InquiryStatusLogInput {
  inquiryCaseId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
  changedByType: 'human' | 'system' | 'ai';
  changedBy?: string;
}

export interface InquiryStatusLogRepository {
  save(input: InquiryStatusLogInput): Promise<void>;
}
