import { InquiryTransitionOperatorType } from '../../domain/state-machine/inquiry-transition.guard.js';
import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';

export interface TransitionInquiryStatusDto {
  toStatus: InquiryStatus;
  reason?: string;
  operatorType?: InquiryTransitionOperatorType;
  changedBy?: string;
}
