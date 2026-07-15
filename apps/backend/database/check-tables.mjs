import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const client = new Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD ?? '123456',
      database: process.env.POSTGRES_DATABASE ?? 'email_inquiry',
    });

await client.connect();

const result = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

console.log(result.rows.map((row) => row.table_name).join('\n'));

const requiredReplyDraftColumns = [
  'context_snapshot_id',
  'ai_decision_id',
  'idempotency_key',
  'version',
  'sent_at',
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
  throw new Error(
    `Database schema is outdated. Missing reply_drafts columns: ${missingColumns.join(', ')}. ` +
    'Run pnpm --filter @email-inquiry/backend db:migrate.',
  );
}

console.log('verified reply_drafts send-workflow columns');

await client.end();
