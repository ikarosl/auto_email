import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateInquiryDto } from '../application/dto/create-inquiry.dto.js';
import { TransitionInquiryStatusDto } from '../application/dto/transition-inquiry-status.dto.js';
import { CreateInquiryUseCase } from '../application/use-cases/create-inquiry.use-case.js';
import { GetInquiryUseCase } from '../application/use-cases/get-inquiry.use-case.js';
import { ListAllowedTransitionsUseCase } from '../application/use-cases/list-allowed-transitions.use-case.js';
import { ListInquiriesUseCase } from '../application/use-cases/list-inquiries.use-case.js';
import { TransitionInquiryStatusUseCase } from '../application/use-cases/transition-inquiry-status.use-case.js';

@Controller('inquiries')
export class InquiryController {
  constructor(
    private readonly createInquiryUseCase: CreateInquiryUseCase,
    private readonly getInquiryUseCase: GetInquiryUseCase,
    private readonly listInquiriesUseCase: ListInquiriesUseCase,
    private readonly listAllowedTransitionsUseCase: ListAllowedTransitionsUseCase,
    private readonly transitionInquiryStatusUseCase: TransitionInquiryStatusUseCase,
  ) {}

  @Post()
  async create(@Body() body: CreateInquiryDto) {
    const inquiryCase = await this.createInquiryUseCase.execute({
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      subject: body.subject,
      latestMessageAt: body.latestMessageAt ? new Date(body.latestMessageAt) : undefined,
    });

    return {
      success: true,
      inquiryCase,
    };
  }

  @Get()
  async list() {
    return {
      success: true,
      inquiryCases: await this.listInquiriesUseCase.execute(),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return {
      success: true,
      inquiryCase: await this.getInquiryUseCase.execute(id),
    };
  }

  @Get(':id/allowed-transitions')
  async allowedTransitions(@Param('id') id: string) {
    return this.listAllowedTransitionsUseCase.execute(id);
  }

  @Post(':id/transitions')
  async transition(@Param('id') id: string, @Body() body: TransitionInquiryStatusDto) {
    const result = await this.transitionInquiryStatusUseCase.execute({
      inquiryCaseId: id,
      toStatus: body.toStatus,
      reason: body.reason,
      operatorType: body.operatorType,
    });

    return {
      success: true,
      inquiryCaseId: result.inquiryCase.id,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      inquiryCase: result.inquiryCase,
    };
  }
}
