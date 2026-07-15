import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { simpleParser } from 'mailparser';

import { PrismaClient } from '../generated/prisma/client.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(scriptDirectory, '../../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function run(): Promise<void> {
  const records = await prisma.emailMessage.findMany({
    where: {
      rawSource: { not: null },
      OR: [
        { inReplyTo: null },
        { referencesJson: { equals: [] } },
      ],
    },
    select: {
      id: true,
      rawSource: true,
      inReplyTo: true,
      referencesJson: true,
    },
    orderBy: { receivedAt: 'asc' },
  });

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const parsed = await simpleParser(decodeRawSource(record.rawSource!));
      const inReplyTo = normalizeMessageId(parsed.inReplyTo);
      const references = normalizeReferences(parsed.references);
      const currentReferences = readStringArray(record.referencesJson);
      const data: { inReplyTo?: string; referencesJson?: string[] } = {};

      if (!record.inReplyTo && inReplyTo) data.inReplyTo = inReplyTo;
      if (currentReferences.length === 0 && references.length > 0) data.referencesJson = references;

      if (Object.keys(data).length === 0) {
        unchanged += 1;
        continue;
      }

      await prisma.emailMessage.update({
        where: { id: record.id },
        data: { ...data, updatedAt: new Date() },
      });
      updated += 1;
    } catch (error) {
      failed += 1;
      console.warn(`Failed to parse ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Email header backfill complete: scanned=${records.length} updated=${updated} unchanged=${unchanged} failed=${failed}`);
}

function normalizeMessageId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function decodeRawSource(value: string): Buffer | string {
  if (!value.startsWith('base64:')) return value;
  return Buffer.from(value.slice('base64:'.length), 'base64');
}

function normalizeReferences(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

run()
  .catch((error) => {
    console.error('Email header backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
