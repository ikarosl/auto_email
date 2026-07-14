import fs from 'node:fs/promises';
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

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    console.log(`applied ${file}`);
  }

  await verifyCriticalSchema(client);

  await client.end();
}

async function verifyCriticalSchema(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'reply_drafts'
        AND column_name = 'context_snapshot_id'
    ) AS reply_drafts_ready
  `);
  if (!result.rows[0]?.reply_drafts_ready) {
    throw new Error('Migration verification failed: reply_drafts.context_snapshot_id is missing.');
  }
  console.log('verified critical schema columns');
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

await ensureDatabase();
await runMigrations();
