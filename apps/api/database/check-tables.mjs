import pg from 'pg';

const { Client } = pg;

const client = new Client({
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

await client.end();
