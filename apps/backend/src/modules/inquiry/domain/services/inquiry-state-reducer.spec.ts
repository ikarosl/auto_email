import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryBusinessEventType } from '../enums/inquiry-business-event.enum.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
  InquiryState,
} from '../enums/inquiry-state.enum.js';
import { reduceInquiryState } from './inquiry-state-reducer.js';

describe('reduceInquiryState', () => {
  it('supports the expected inquiry timeline without unsupported regressions', () => {
    let state = createState();
    state = apply(state, InquiryBusinessEventType.REQUIREMENTS_PROVIDED, {
      businessStage: InquiryBusinessStage.TECHNICAL_REVIEW,
      actionOwner: InquiryActionOwner.US,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
    state = apply(state, InquiryBusinessEventType.TECHNICAL_SOLUTION_SENT, {
      businessStage: InquiryBusinessStage.TECHNICAL_REVIEW,
      actionOwner: InquiryActionOwner.CUSTOMER,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
    state = apply(state, InquiryBusinessEventType.TECHNICAL_SOLUTION_ACCEPTED, {
      businessStage: InquiryBusinessStage.COMMERCIAL,
      actionOwner: InquiryActionOwner.US,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
    state = apply(state, InquiryBusinessEventType.COMMERCIAL_TERMS_SENT, {
      businessStage: InquiryBusinessStage.COMMERCIAL,
      actionOwner: InquiryActionOwner.CUSTOMER,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
    state = apply(state, InquiryBusinessEventType.COMMERCIAL_TERMS_ACCEPTED, {
      businessStage: InquiryBusinessStage.CONTRACT,
      actionOwner: InquiryActionOwner.US,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
    state = apply(state, InquiryBusinessEventType.CONTRACT_SENT, {
      businessStage: InquiryBusinessStage.CONTRACT,
      actionOwner: InquiryActionOwner.CUSTOMER,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });

    const signed = reduce(state, InquiryBusinessEventType.CONTRACT_SIGNED, {
      businessStage: InquiryBusinessStage.CONTRACT,
      actionOwner: InquiryActionOwner.NONE,
      lifecycleStatus: InquiryLifecycleStatus.WON,
    });
    assert.equal(signed.executionStatus, 'eligible');
    assert.equal(signed.pendingLifecycleStatus, InquiryLifecycleStatus.WON);
    assert.deepEqual(signed.safeState, {
      businessStage: InquiryBusinessStage.CONTRACT,
      actionOwner: InquiryActionOwner.US,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
  });

  it('blocks stage regression without an explicit update or rejection event', () => {
    const result = reduce({
      ...createState(),
      businessStage: InquiryBusinessStage.COMMERCIAL,
    }, InquiryBusinessEventType.GENERAL_CORRESPONDENCE, {
      businessStage: InquiryBusinessStage.TECHNICAL_REVIEW,
      actionOwner: InquiryActionOwner.US,
      lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    });
    assert.equal(result.executionStatus, 'pending_review');
    assert.equal(result.eventValidationPassed, false);
  });

  it('allows high-confidence customer cancellation to become lost', () => {
    const result = reduce(createState(), InquiryBusinessEventType.INQUIRY_CANCELLED, {
      businessStage: InquiryBusinessStage.INTAKE,
      actionOwner: InquiryActionOwner.NONE,
      lifecycleStatus: InquiryLifecycleStatus.LOST,
    });
    assert.equal(result.executionStatus, 'eligible');
  });

  it('never automatically applies a historical backfill decision', () => {
    const result = reduceInquiryState({
      current: createState(),
      suggested: {
        businessStage: InquiryBusinessStage.TECHNICAL_REVIEW,
        actionOwner: InquiryActionOwner.US,
        lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
      },
      events: [{ eventType: InquiryBusinessEventType.REQUIREMENTS_PROVIDED, confidence: 0.99 }],
      messageClassification: 'customer_follow_up',
      confidence: 0.99,
      riskLevel: 'low',
      minimumConfidence: 0.9,
      historicalBackfill: true,
    });
    assert.equal(result.executionStatus, 'historical_backfill');
  });
});

function reduce(current: InquiryState, eventType: InquiryBusinessEventType, suggested: Omit<InquiryState, 'stateVersion'>) {
  return reduceInquiryState({
    current,
    suggested,
    events: [{ eventType, confidence: 0.99 }],
    messageClassification: 'customer_follow_up',
    confidence: 0.99,
    riskLevel: 'low',
    minimumConfidence: 0.9,
  });
}

function apply(current: InquiryState, eventType: InquiryBusinessEventType, suggested: Omit<InquiryState, 'stateVersion'>) {
  const result = reduce(current, eventType, suggested);
  assert.equal(result.executionStatus, 'eligible');
  return { ...result.safeState, stateVersion: current.stateVersion + 1 };
}

function createState(): InquiryState {
  return {
    businessStage: InquiryBusinessStage.INTAKE,
    actionOwner: InquiryActionOwner.US,
    lifecycleStatus: InquiryLifecycleStatus.ACTIVE,
    stateVersion: 0,
  };
}
