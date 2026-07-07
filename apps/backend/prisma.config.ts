import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:123456@localhost:5432/email_inquiry?schema=public',
  },
});
