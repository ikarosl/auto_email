import { randomUUID } from 'node:crypto';

import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';
import {
  InquiryTransitionContext,
  InquiryTransitionOperatorType,
} from '../../domain/state-machine/inquiry-transition.guard.js';
import { InquiryStateMachine } from '../../domain/state-machine/inquiry-state-machine.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';
import { InquiryStatusLogRepository } from '../ports/inquiry-status-log.repository.js';
import { GetInquiryUseCase } from './get-inquiry.use-case.js';

export interface TransitionInquiryStatusInput {
  inquiryCaseId: string;
  toStatus: InquiryStatus;
  reason?: string;
  operatorType?: InquiryTransitionOperatorType;
}

export interface TransitionInquiryStatusResult {
  inquiryCase: InquiryCase;
  fromStatus: InquiryStatus;
  toStatus: InquiryStatus;
}

export class TransitionInquiryStatusUseCase {
  constructor(
    private readonly inquiryRepository: InquiryRepository,
    private readonly getInquiryUseCase: GetInquiryUseCase,
    private readonly inquiryStateMachine: InquiryStateMachine,
    private readonly inquiryStatusLogRepository: InquiryStatusLogRepository,
  ) {}

  async execute(input: TransitionInquiryStatusInput): Promise<TransitionInquiryStatusResult> {
    const inquiryCase = await this.getInquiryUseCase.execute(input.inquiryCaseId);
    const context: InquiryTransitionContext = {
      operatorType: input.operatorType ?? 'human',
      reason: input.reason,
    };
    const transition = this.inquiryStateMachine.transition(inquiryCase.status, input.toStatus, context);
    const updatedInquiryCase: InquiryCase = {
      ...inquiryCase,
      status: transition.toStatus,
      updatedAt: transition.changedAt,
    };

    const saved = await this.inquiryRepository.save(updatedInquiryCase);

    await this.inquiryStatusLogRepository.save({
      inquiryCaseId: input.inquiryCaseId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      reason: input.reason,
      changedByType: input.operatorType ?? 'human',
      changedBy: input.changedBy ?? undefined,
    });

    return {
      inquiryCase: saved,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
    };
  }
}
