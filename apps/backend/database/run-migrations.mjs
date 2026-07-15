import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;

const connection = {
  host: process.env.POSTGRES_HOST ?? databaseUrl?.hostname ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? databaseUrl?.port ?? 5432),
  user: process.env.POSTGRES_USER ?? (decodeURIComponent(databaseUrl?.username ?? '') || 'postgres'),
  password: process.env.POSTGRES_PASSWORD ?? (decodeURIComponent(databaseUrl?.password ?? '') || '123456'),
};

const database = process.env.POSTGRES_DATABASE
  ?? (decodeURIComponent(databaseUrl?.pathname.replace(/^\//, '') ?? '') || 'email_inquiry');

async function ensureDatabase() {
  const client = new Client({ ...connection, database: 'postgres' });
  await client.connect();

  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    console.log(`created database ${database}`);
  } else {
    console.log(`database ${database} already exists`);
  }

  await client.end();
}

async function runMigrations() {
  const client = new Client({ ...connection, database });
  await client.connect();

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await ensureMigrationTable(client);

  const appliedRows = await client.query('SELECT name, checksum FROM app_schema_migrations');
  const applied = new Map(appliedRows.rows.map((row) => [row.name, row.checksum]));
  const hasApplicationSchema = await tableExists(client, 'inquiry_cases');

  // A schema restored from docs/initial-empty-postgres-schema.sql has no ledger.
  // Validate it before adopting the current migration baseline.
  if (hasApplicationSchema && applied.size === 0) {
    try {
      await verifyCriticalSchema(client);
    } catch (error) {
      throw new Error(
        `Existing database schema is not compatible with the current baseline. `
        + `Reset it with docs/initial-empty-postgres-schema.sql before starting the backend. Cause: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await recordMigration(client, file, checksum(sql));
      console.log(`adopted existing schema as ${file}`);
    }
    await client.end();
    return;
  }

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const sqlChecksum = checksum(sql);
    const appliedChecksum = applied.get(file);
    if (appliedChecksum) {
      if (appliedChecksum !== sqlChecksum) {
        throw new Error(
          `Applied migration ${file} was modified. Reset the development database with `
          + `docs/initial-empty-postgres-schema.sql or restore the original migration file.`,
        );
      }
      console.log(`skipped ${file} (already applied)`);
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await recordMigration(client, file, sqlChecksum);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log(`applied ${file}`);
  }

  await verifyCriticalSchema(client);

  await client.end();
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function tableExists(client, tableName) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = $1
    ) AS exists
  `, [tableName]);
  return Boolean(result.rows[0]?.exists);
}

async function recordMigration(client, name, sqlChecksum) {
  await client.query(
    `INSERT INTO app_schema_migrations (name, checksum)
     VALUES ($1, $2)
     ON CONFLICT (name) DO NOTHING`,
    [name, sqlChecksum],
  );
}

function checksum(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function verifyCriticalSchema(client) {
  const requiredReplyDraftColumns = [
    'context_snapshot_id',
    'email_analysis_decision_id',
    'idempotency_key',
    'original_subject',
    'original_body_text',
    'language',
    'used_facts_json',
    'unresolved_questions_json',
    'warnings_json',
    'requires_commercial_review',
    'prompt_version',
    'version',
    'approved_by',
    'approved_at',
    'rejected_by',
    'rejected_at',
    'rejection_reason',
    'sent_at',
    'last_send_error',
  ];
  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'reply_drafts'
  `);
  const actualColumns = new Set(columns.rows.map((row) => row.column_name));
  const missingColumns = requiredReplyDraftColumns.filter((column) => !actualColumns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Migration verification failed: missing reply_drafts columns: ${missingColumns.join(', ')}.`);
  }

  const result = await client.query(`
    SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'email_analysis_decisions'
    ) AS email_analysis_decisions_ready,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'inquiry_business_events'
    ) AS inquiry_business_events_ready,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'inquiry_state_decisions'
    ) AS inquiry_state_decisions_ready,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'inquiry_state_transitions'
    ) AS inquiry_state_transitions_ready,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'email_recovery_records'
    ) AS email_recovery_records_ready,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'inquiry_processing_mode_transitions'
    ) AS inquiry_processing_mode_transitions_ready,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'inquiry_replay_runs'
    ) AS inquiry_replay_runs_ready
  `);
  const requiredTables = [
    'email_analysis_decisions',
    'inquiry_business_events',
    'inquiry_state_decisions',
    'inquiry_state_transitions',
    'email_recovery_records',
    'inquiry_processing_mode_transitions',
    'inquiry_replay_runs',
  ];
  const missingTables = requiredTables.filter((table) => !result.rows[0]?.[`${table}_ready`]);
  if (missingTables.length > 0) {
    throw new Error(`Migration verification failed: missing tables: ${missingTables.join(', ')}.`);
  }

  const inquiryColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'inquiry_cases'
  `);
  const actualInquiryColumns = new Set(inquiryColumns.rows.map((row) => row.column_name));
  const requiredInquiryColumns = [
    'business_stage',
    'action_owner',
    'lifecycle_status',
    'state_version',
    'processing_mode',
    'processing_mode_reason',
    'processing_mode_changed_at',
    'processing_mode_changed_by',
  ];
  const missingInquiryColumns = requiredInquiryColumns.filter((column) => !actualInquiryColumns.has(column));
  if (missingInquiryColumns.length > 0) {
    throw new Error(`Migration verification failed: missing inquiry_cases columns: ${missingInquiryColumns.join(', ')}.`);
  }

  const analysisColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'email_analysis_decisions'
  `);
  const actualAnalysisColumns = new Set(analysisColumns.rows.map((row) => row.column_name));
  const requiredAnalysisColumns = [
    'is_inquiry',
    'inquiry_scope',
    'scope_relationship',
    'inquiry_scope_confidence',
    'detected_products',
    'replay_run_id',
    'is_effective',
  ];
  const missingAnalysisColumns = requiredAnalysisColumns.filter(
    (column) => !actualAnalysisColumns.has(column),
  );
  if (missingAnalysisColumns.length > 0) {
    throw new Error(
      `Migration verification failed: missing email_analysis_decisions columns: ${missingAnalysisColumns.join(', ')}.`,
    );
  }

  console.log('verified three-dimensional inquiry schema');
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

await ensureDatabase();
await runMigrations();
