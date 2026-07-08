import { Controller, Get, Inject } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbOk = await this.prisma.healthCheck();

    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'email-inquiry-system',
      database: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
