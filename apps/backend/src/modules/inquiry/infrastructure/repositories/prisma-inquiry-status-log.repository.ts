import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  InquiryStatusLogInput,
  InquiryStatusLogRepository,
} from '../../application/ports/inquiry-status-log.repository.js';

export class PrismaInquiryStatusLogRepository implements InquiryStatusLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(input: InquiryStatusLogInput): Promise<void> {
    await this.prisma.inquiryStatusLog.create({
      data: {
        id: `status_log_${randomUUID()}`,
        inquiryCaseId: input.inquiryCaseId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason ?? null,
        changedBy: input.changedBy ?? null,
        changedByType: input.changedByType,
      },
    });
  }
}
