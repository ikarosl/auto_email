export const InquiryBusinessStage = {
  INTAKE: 'intake',
  TECHNICAL_REVIEW: 'technical_review',
  COMMERCIAL: 'commercial',
  CONTRACT: 'contract',
} as const;

export type InquiryBusinessStage = typeof InquiryBusinessStage[keyof typeof InquiryBusinessStage];

export const InquiryActionOwner = {
  US: 'us',
  CUSTOMER: 'customer',
  NONE: 'none',
} as const;

export type InquiryActionOwner = typeof InquiryActionOwner[keyof typeof InquiryActionOwner];

export const InquiryLifecycleStatus = {
  ACTIVE: 'active',
  WON: 'won',
  LOST: 'lost',
  INVALID: 'invalid',
} as const;

export type InquiryLifecycleStatus = typeof InquiryLifecycleStatus[keyof typeof InquiryLifecycleStatus];

export interface InquiryState {
  businessStage: InquiryBusinessStage;
  actionOwner: InquiryActionOwner;
  lifecycleStatus: InquiryLifecycleStatus;
  stateVersion: number;
}

export const INITIAL_INQUIRY_STATE: InquiryState = {
  businessStage: InquiryBusinessStage.INTAKE,
  actionOwner: InquiryActionOwner.US,
  lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
  stateVersion: 0,
};

export function isTerminalLifecycle(status: InquiryLifecycleStatus): boolean {
  return status !== InquiryLifecycleStatus.ACTIVE;
}

export function isValidInquiryState(state: Omit<InquiryState, 'stateVersion'>): boolean {
  return !isTerminalLifecycle(state.lifecycleStatus) || state.actionOwner === InquiryActionOwner.NONE;
}
