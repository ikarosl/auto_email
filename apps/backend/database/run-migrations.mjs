import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

const connection = {
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
};

const database = process.env.POSTGRES_DATABASE ?? 'email_inquiry';

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

  await client.end();
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

await ensureDatabase();
await runMigrations();
