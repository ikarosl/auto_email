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
    await this.assertRequiredSchema();
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

  private async assertRequiredSchema(): Promise<void> {
    const rows = await this.$queryRaw<Array<{ missing: string[] | null }>>`
      SELECT ARRAY_AGG(required.column_name ORDER BY required.column_name)
        FILTER (WHERE actual.column_name IS NULL) AS missing
      FROM (VALUES
        ('context_snapshot_id'),
        ('ai_decision_id'),
        ('idempotency_key'),
        ('version'),
        ('sent_at')
      ) AS required(column_name)
      LEFT JOIN information_schema.columns AS actual
        ON actual.table_schema = current_schema()
       AND actual.table_name = 'reply_drafts'
       AND actual.column_name = required.column_name
    `;
    const missing = rows[0]?.missing ?? [];
    if (missing.length > 0) {
      throw new Error(
        `Database schema is outdated. Missing reply_drafts columns: ${missing.join(', ')}. ` +
        'Run pnpm --filter @email-inquiry/backend db:migrate before starting the backend.',
      );
    }
  }
}
