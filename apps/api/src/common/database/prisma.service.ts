import { env } from 'node:process';

import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');
  }

  async onApplicationShutdown(_signal?: string): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /** Quick health check — returns true if the database is reachable. */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
