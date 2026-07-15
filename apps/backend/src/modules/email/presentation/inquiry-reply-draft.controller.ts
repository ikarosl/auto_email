import { Body, Controller, Param, Post } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { itemResponse } from '../../../common/http/api-response.js';
import { GenerateReplyDraftUseCase } from '../application/use-cases/generate-reply-draft.use-case.js';

@Controller(API_ROUTE_SEGMENTS.inquiries)
export class InquiryReplyDraftController {
  constructor(private readonly generateReplyDraftUseCase: GenerateReplyDraftUseCase) {}

  @Post(':id/reply-drafts')
  async create(
    @Param('id') inquiryCaseId: string,
    @Body() body: {
      sourceEmailMessageId?: string;
      emailAnalysisDecisionId?: string;
      commercialTerms?: string;
      operator?: string;
    } = {},
  ) {
    return itemResponse(await this.generateReplyDraftUseCase.execute({
      inquiryCaseId,
      sourceEmailMessageId: body.sourceEmailMessageId,
      emailAnalysisDecisionId: body.emailAnalysisDecisionId,
      commercialTerms: body.commercialTerms,
      initiatedBy: body.operator,
    }));
  }
}
