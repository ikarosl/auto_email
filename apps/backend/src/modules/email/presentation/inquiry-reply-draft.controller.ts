import { Body, Controller, Param, Post } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { itemResponse } from '../../../common/http/api-response.js';
import { InquiryStatus } from '../../inquiry/domain/enums/inquiry-status.enum.js';
import { GenerateReplyDraftUseCase } from '../application/use-cases/generate-reply-draft.use-case.js';

@Controller(API_ROUTE_SEGMENTS.inquiries)
export class InquiryReplyDraftController {
  constructor(private readonly generateReplyDraftUseCase: GenerateReplyDraftUseCase) {}

  @Post(':id/reply-drafts')
  async create(
    @Param('id') inquiryCaseId: string,
    @Body() body: {
      sourceEmailMessageId?: string;
      aiDecisionId?: string;
      targetStatus?: InquiryStatus;
      commercialTerms?: string;
      operator?: string;
    } = {},
  ) {
    return itemResponse(await this.generateReplyDraftUseCase.execute({
      inquiryCaseId,
      sourceEmailMessageId: body.sourceEmailMessageId,
      aiDecisionId: body.aiDecisionId,
      targetStatus: body.targetStatus,
      commercialTerms: body.commercialTerms,
      initiatedBy: body.operator,
    }));
  }
}
