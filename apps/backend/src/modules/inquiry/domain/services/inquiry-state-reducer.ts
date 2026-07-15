import { InquiryBusinessEventType } from '../enums/inquiry-business-event.enum.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
  InquiryState,
  isTerminalLifecycle,
  isValidInquiryState,
} from '../enums/inquiry-state.enum.js';

export const INQUIRY_STATE_POLICY_VERSION = 'three-dimensional-v1';

export interface StateDrivingEvent {
  eventType: InquiryBusinessEventType;
  confidence: number;
}

export interface SuggestedInquiryState {
  businessStage: InquiryBusinessStage;
  actionOwner: InquiryActionOwner;
  lifecycleStatus: InquiryLifecycleStatus;
}

export interface ReduceInquiryStateInput {
  current: InquiryState;
  suggested: SuggestedInquiryState;
  events: StateDrivingEvent[];
  messageClassification: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  minimumConfidence: number;
  historicalBackfill?: boolean;
}

export interface InquiryStateReduction {
  suggested: SuggestedInquiryState;
  safeState: SuggestedInquiryState;
  eventValidationPassed: boolean;
  executionStatus: 'eligible' | 'no_change' | 'pending_review' | 'historical_backfill';
  reason: string;
  pendingLifecycleStatus?: InquiryLifecycleStatus;
}

const STAGE_ORDER: Record<InquiryBusinessStage, number> = {
  [InquiryBusinessStage.INTAKE]: 0,
  [InquiryBusinessStage.TECHNICAL_REVIEW]: 1,
  [InquiryBusinessStage.COMMERCIAL]: 2,
  [InquiryBusinessStage.CONTRACT]: 3,
};

const REGRESSION_EVENTS = new Set<InquiryBusinessEventType>([
  InquiryBusinessEventType.REQUIREMENTS_UPDATED,
  InquiryBusinessEventType.TECHNICAL_SOLUTION_REJECTED,
  InquiryBusinessEventType.DELIVERY_TERMS_REJECTED,
  InquiryBusinessEventType.COMMERCIAL_TERMS_REJECTED,
  InquiryBusinessEventType.CONTRACT_CHANGE_REQUESTED,
]);

const CUSTOMER_OWNER_EVENTS = new Set<InquiryBusinessEventType>([
  InquiryBusinessEventType.CUSTOMER_RESPONSE_REQUESTED,
  InquiryBusinessEventType.CLARIFICATION_REQUESTED,
  InquiryBusinessEventType.TECHNICAL_SOLUTION_SENT,
  InquiryBusinessEventType.ALTERNATIVE_SOLUTION_SENT,
  InquiryBusinessEventType.DELIVERY_TERMS_SENT,
  InquiryBusinessEventType.COMMERCIAL_TERMS_SENT,
  InquiryBusinessEventType.FORMAL_QUOTE_SENT,
  InquiryBusinessEventType.CONTRACT_SENT,
]);

export function reduceInquiryState(input: ReduceInquiryStateInput): InquiryStateReduction {
  const suggested = input.suggested;
  const eventTypes = new Set(input.events.map((event) => event.eventType));
  const eventsMeetThreshold = input.events
    .filter((event) => isStateDrivingEvent(event.eventType))
    .every((event) => event.confidence >= input.minimumConfidence);
  const validation = validateSuggestion(input.current, suggested, eventTypes, input.messageClassification);

  if (input.historicalBackfill) {
    return result(input.suggested, 'historical_backfill', validation.valid, currentState(input.current), validation.reason);
  }
  if (input.riskLevel === 'high') {
    return result(input.suggested, 'pending_review', validation.valid, currentState(input.current), 'High-risk analysis requires review.');
  }
  if (input.confidence < input.minimumConfidence || !eventsMeetThreshold) {
    return result(
      input.suggested,
      'pending_review',
      validation.valid,
      currentState(input.current),
      `Confidence is below the ${input.minimumConfidence} automatic execution threshold.`,
    );
  }
  if (!validation.valid) {
    return result(input.suggested, 'pending_review', false, currentState(input.current), validation.reason);
  }

  if (suggested.lifecycleStatus === InquiryLifecycleStatus.WON) {
    const safeState = {
      businessStage: InquiryBusinessStage.CONTRACT,
      actionOwner: InquiryActionOwner.US,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    };
    return {
      suggested,
      safeState,
      eventValidationPassed: true,
      executionStatus: statesEqual(currentState(input.current), safeState) ? 'pending_review' : 'eligible',
      pendingLifecycleStatus: InquiryLifecycleStatus.WON,
      reason: 'Contract signature may update safe dimensions, but won requires human confirmation.',
    };
  }

  if (
    suggested.lifecycleStatus === InquiryLifecycleStatus.LOST &&
    !eventTypes.has(InquiryBusinessEventType.INQUIRY_CANCELLED)
  ) {
    return result(
      input.suggested,
      'pending_review',
      true,
      currentState(input.current),
      'Lost without an explicit customer cancellation requires human confirmation.',
    );
  }

  if (statesEqual(currentState(input.current), suggested)) {
    return result(input.suggested, 'no_change', true, suggested, 'Suggested state already matches the inquiry state.');
  }

  return result(input.suggested, 'eligible', true, suggested, 'AI suggestion passed event and state validation.');
}

function validateSuggestion(
  current: InquiryState,
  suggested: SuggestedInquiryState,
  eventTypes: Set<InquiryBusinessEventType>,
  classification: string,
): { valid: boolean; reason: string } {
  if (!isValidInquiryState(suggested)) {
    return { valid: false, reason: 'Terminal lifecycle states require actionOwner=none.' };
  }
  if (isTerminalLifecycle(current.lifecycleStatus) && suggested.lifecycleStatus === InquiryLifecycleStatus.ACTIVE) {
    return { valid: false, reason: 'Restoring a terminal inquiry to active requires a manual correction.' };
  }
  if (suggested.lifecycleStatus === InquiryLifecycleStatus.INVALID) {
    const invalidClassification = ['invalid', 'commercial_solicitation', 'unrelated_product'].includes(classification);
    return invalidClassification
      ? { valid: true, reason: 'Invalid lifecycle is supported by message classification.' }
      : { valid: false, reason: 'Invalid lifecycle requires an invalid or unrelated classification.' };
  }
  if (
    suggested.lifecycleStatus === InquiryLifecycleStatus.LOST &&
    !eventTypes.has(InquiryBusinessEventType.INQUIRY_CANCELLED) &&
    !eventTypes.has(InquiryBusinessEventType.UNABLE_TO_FULFILL)
  ) {
    return { valid: false, reason: 'Lost requires inquiry_cancelled or unable_to_fulfill.' };
  }
  if (
    suggested.lifecycleStatus === InquiryLifecycleStatus.WON &&
    !eventTypes.has(InquiryBusinessEventType.CONTRACT_SIGNED)
  ) {
    return { valid: false, reason: 'Won requires contract_signed.' };
  }

  const currentOrder = STAGE_ORDER[current.businessStage];
  const suggestedOrder = STAGE_ORDER[suggested.businessStage];
  if (suggestedOrder < currentOrder && !hasAny(eventTypes, REGRESSION_EVENTS)) {
    return { valid: false, reason: 'Stage regression lacks a requirements or rejection event.' };
  }
  if (suggestedOrder > currentOrder && !supportsStage(suggested.businessStage, eventTypes)) {
    return { valid: false, reason: `Events do not support advancing to ${suggested.businessStage}.` };
  }
  if (suggested.actionOwner === InquiryActionOwner.CUSTOMER && !hasAny(eventTypes, CUSTOMER_OWNER_EVENTS)) {
    return { valid: false, reason: 'actionOwner=customer requires an explicit request or sent proposal/terms.' };
  }

  return { valid: true, reason: 'Suggestion is compatible with extracted business events.' };
}

function supportsStage(stage: InquiryBusinessStage, events: Set<InquiryBusinessEventType>): boolean {
  if (stage === InquiryBusinessStage.TECHNICAL_REVIEW) {
    return hasAny(events, new Set([
      InquiryBusinessEventType.REQUIREMENTS_PROVIDED,
      InquiryBusinessEventType.REQUIREMENTS_UPDATED,
      InquiryBusinessEventType.CLARIFICATION_PROVIDED,
      InquiryBusinessEventType.TECHNICAL_SOLUTION_SENT,
      InquiryBusinessEventType.ALTERNATIVE_SOLUTION_SENT,
    ]));
  }
  if (stage === InquiryBusinessStage.COMMERCIAL) {
    return hasAny(events, new Set([
      InquiryBusinessEventType.TECHNICAL_SOLUTION_ACCEPTED,
      InquiryBusinessEventType.DELIVERY_TERMS_SENT,
      InquiryBusinessEventType.DELIVERY_TERMS_ACCEPTED,
      InquiryBusinessEventType.COMMERCIAL_TERMS_SENT,
      InquiryBusinessEventType.FORMAL_QUOTE_SENT,
    ]));
  }
  if (stage === InquiryBusinessStage.CONTRACT) {
    return hasAny(events, new Set([
      InquiryBusinessEventType.COMMERCIAL_TERMS_ACCEPTED,
      InquiryBusinessEventType.CONTRACT_SENT,
      InquiryBusinessEventType.CONTRACT_SIGNED,
      InquiryBusinessEventType.CONTRACT_CHANGE_REQUESTED,
    ]));
  }
  return true;
}

function isStateDrivingEvent(eventType: InquiryBusinessEventType): boolean {
  const nonDrivingEvents: InquiryBusinessEventType[] = [
    InquiryBusinessEventType.GENERAL_CORRESPONDENCE,
    InquiryBusinessEventType.UNRELATED_INTERNAL,
    InquiryBusinessEventType.INQUIRY_RECEIVED,
  ];
  return !nonDrivingEvents.includes(eventType);
}

function hasAny(values: Set<InquiryBusinessEventType>, candidates: Set<InquiryBusinessEventType>): boolean {
  return Array.from(candidates).some((candidate) => values.has(candidate));
}

function currentState(state: InquiryState): SuggestedInquiryState {
  return {
    businessStage: state.businessStage,
    actionOwner: state.actionOwner,
    lifecycleStatus: state.lifecycleStatus,
  };
}

function statesEqual(left: SuggestedInquiryState, right: SuggestedInquiryState): boolean {
  return left.businessStage === right.businessStage
    && left.actionOwner === right.actionOwner
    && left.lifecycleStatus === right.lifecycleStatus;
}

function result(
  suggested: SuggestedInquiryState,
  executionStatus: InquiryStateReduction['executionStatus'],
  eventValidationPassed: boolean,
  safeState: SuggestedInquiryState,
  reason: string,
): InquiryStateReduction {
  return {
    suggested,
    safeState,
    eventValidationPassed,
    executionStatus,
    reason,
  };
}
