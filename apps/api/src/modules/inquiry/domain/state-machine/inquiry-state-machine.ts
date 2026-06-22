import { InvalidTransitionError } from '../../../../common/errors/invalid-transition.error.js';
import { InquiryStatus } from '../enums/inquiry-status.enum.js';
import {
  InquiryTransitionContext,
  validateInquiryTransition,
} from './inquiry-transition.guard.js';
import { getConfiguredNextStatuses } from './inquiry-transitions.js';

export interface InquiryStatusTransition {
  fromStatus: InquiryStatus;
  toStatus: InquiryStatus;
  changedAt: Date;
}

export class InquiryStateMachine {
  canTransition(
    fromStatus: InquiryStatus,
    toStatus: InquiryStatus,
    context: InquiryTransitionContext = {},
  ): boolean {
    return validateInquiryTransition(fromStatus, toStatus, context).allowed;
  }

  transition(
    fromStatus: InquiryStatus,
    toStatus: InquiryStatus,
    context: InquiryTransitionContext = {},
  ): InquiryStatusTransition {
    const validation = validateInquiryTransition(fromStatus, toStatus, context);

    if (!validation.allowed) {
      throw new InvalidTransitionError(validation.reason ?? 'Invalid inquiry status transition.');
    }

    return {
      fromStatus,
      toStatus,
      changedAt: new Date(),
    };
  }

  getAllowedNextStatuses(
    fromStatus: InquiryStatus,
    context: InquiryTransitionContext = {},
  ): InquiryStatus[] {
    return getConfiguredNextStatuses(fromStatus).filter((toStatus) =>
      this.canTransition(fromStatus, toStatus, context),
    );
  }
}
