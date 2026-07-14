import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvalidTransitionError } from '../../../../common/errors/invalid-transition.error.js';
import { InquiryStatus } from '../enums/inquiry-status.enum.js';
import { InquiryStateMachine } from './inquiry-state-machine.js';

describe('InquiryStateMachine', () => {
  const stateMachine = new InquiryStateMachine();

  it('allows configured transitions from new', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEW, InquiryStatus.NEED_CLARIFICATION, {
        operatorType: 'system',
      }),
      true,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEW, InquiryStatus.NEED_ENGINEER_REVIEW, {
        operatorType: 'human',
      }),
      true,
    );
  });

  it('rejects transitions that are not in the transition table', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEW, InquiryStatus.READY_FOR_QUOTE, {
        operatorType: 'human',
      }),
      false,
    );
  });

  it('requires a reason when marking invalid', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEW, InquiryStatus.INVALID, {
        operatorType: 'human',
      }),
      false,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEW, InquiryStatus.INVALID, {
        operatorType: 'human',
        reason: 'Spam email.',
      }),
      true,
    );
  });

  it('requires a reason when closing an inquiry', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.READY_FOR_QUOTE, InquiryStatus.CLOSED, {
        operatorType: 'human',
      }),
      false,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.READY_FOR_QUOTE, InquiryStatus.CLOSED, {
        operatorType: 'human',
        reason: 'Customer cancelled the inquiry.',
      }),
      true,
    );
  });

  it('allows only human operators to enter ready_for_quote', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEED_ENGINEER_REVIEW, InquiryStatus.READY_FOR_QUOTE, {
        operatorType: 'system',
      }),
      false,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEED_ENGINEER_REVIEW, InquiryStatus.READY_FOR_QUOTE, {
        operatorType: 'ai',
      }),
      false,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.NEED_ENGINEER_REVIEW, InquiryStatus.READY_FOR_QUOTE, {
        operatorType: 'human',
      }),
      true,
    );
  });

  it('allows only a reasoned human operation to restore terminal states', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.INVALID, InquiryStatus.NEW, {
        operatorType: 'ai',
        reason: 'Changed assessment.',
      }),
      false,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.CLOSED, InquiryStatus.NEW, {
        operatorType: 'human',
        reason: 'Customer reopened the inquiry.',
      }),
      true,
    );
  });

  it('allows a sent quote event and requires a reasoned human correction', () => {
    assert.equal(
      stateMachine.canTransition(InquiryStatus.READY_FOR_QUOTE, InquiryStatus.QUOTED, {
        operatorType: 'system',
        reason: 'Approved quote email sent.',
      }),
      true,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.QUOTED, InquiryStatus.READY_FOR_QUOTE, {
        operatorType: 'system',
        reason: 'Correction.',
      }),
      false,
    );
    assert.equal(
      stateMachine.canTransition(InquiryStatus.QUOTED, InquiryStatus.READY_FOR_QUOTE, {
        operatorType: 'human',
        reason: 'Quotation needs correction.',
      }),
      true,
    );
  });

  it('returns allowed next statuses after applying guard rules', () => {
    assert.deepEqual(
      stateMachine.getAllowedNextStatuses(InquiryStatus.NEW, {
        operatorType: 'human',
        reason: 'Manual operation.',
      }),
      [
        InquiryStatus.INVALID,
        InquiryStatus.NEED_CLARIFICATION,
        InquiryStatus.NEED_ENGINEER_REVIEW,
        InquiryStatus.CLOSED,
      ],
    );
  });

  it('throws InvalidTransitionError when transition is not allowed', () => {
    assert.throws(
      () =>
        stateMachine.transition(InquiryStatus.NEW, InquiryStatus.READY_FOR_QUOTE, {
          operatorType: 'human',
        }),
      InvalidTransitionError,
    );
  });

  it('returns transition result when transition is allowed', () => {
    const result = stateMachine.transition(InquiryStatus.NEED_CLARIFICATION, InquiryStatus.WAITING_CUSTOMER, {
      operatorType: 'system',
    });

    assert.equal(result.fromStatus, InquiryStatus.NEED_CLARIFICATION);
    assert.equal(result.toStatus, InquiryStatus.WAITING_CUSTOMER);
    assert.ok(result.changedAt instanceof Date);
  });
});
