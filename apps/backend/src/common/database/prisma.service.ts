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
        ('email_analysis_decision_id'),
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

    const inquiryRows = await this.$queryRaw<Array<{ missing: string[] | null }>>`
      SELECT ARRAY_AGG(required.column_name ORDER BY required.column_name)
        FILTER (WHERE actual.column_name IS NULL) AS missing
      FROM (VALUES
        ('business_stage'),
        ('action_owner'),
        ('lifecycle_status'),
        ('state_version'),
        ('processing_mode'),
        ('processing_mode_reason'),
        ('processing_mode_changed_at'),
        ('processing_mode_changed_by')
      ) AS required(column_name)
      LEFT JOIN information_schema.columns AS actual
        ON actual.table_schema = current_schema()
       AND actual.table_name = 'inquiry_cases'
       AND actual.column_name = required.column_name
    `;
    const missingInquiryColumns = inquiryRows[0]?.missing ?? [];
    if (missingInquiryColumns.length > 0) {
      throw new Error(
        `Database schema is outdated. Missing inquiry_cases columns: ${missingInquiryColumns.join(', ')}. ` +
        'Reset the development database with docs/initial-empty-postgres-schema.sql.',
      );
    }

    const schemaRows = await this.$queryRaw<Array<{ missing: string[] | null }>>`
      SELECT ARRAY_AGG(required.table_name ORDER BY required.table_name)
        FILTER (WHERE actual.table_name IS NULL) AS missing
      FROM (VALUES
        ('inquiry_processing_mode_transitions'),
        ('inquiry_replay_runs')
      ) AS required(table_name)
      LEFT JOIN information_schema.tables AS actual
        ON actual.table_schema = current_schema()
       AND actual.table_name = required.table_name
    `;
    const missingTables = schemaRows[0]?.missing ?? [];
    if (missingTables.length > 0) {
      throw new Error(
        `Database schema is outdated. Missing tables: ${missingTables.join(', ')}. ` +
        'Reset the development database with docs/initial-empty-postgres-schema.sql.',
      );
    }
  }
}
