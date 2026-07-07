import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  aiEmailAnalysisContextPayloadSchema,
} from '../../application/dto/ai-email-analysis-context.schema.js';
import type { AiEmailAnalysisContextPayload } from '../../application/dto/ai-email-analysis-context.schema.js';
import { ContextSnapshotRepository } from '../../application/ports/context-snapshot.repository.js';
import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { ContextSourceReference } from '../../domain/value-objects/context-source-reference.vo.js';

export class PrismaContextSnapshotRepository implements ContextSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(snapshot: AiContextSnapshot): Promise<AiContextSnapshot> {
    const data = {
      id: snapshot.id,
      inquiryCaseId: snapshot.inquiryCaseId,
      emailMessageId: snapshot.emailMessageId ?? null,
      purpose: snapshot.purpose,
      contextPayloadJson: JSON.parse(JSON.stringify(snapshot.contextPayload)),
      messagesJson: JSON.parse(JSON.stringify(snapshot.messages)),
      sourceReferences: JSON.parse(JSON.stringify(snapshot.sourceReferences)),
      estimatedTokens: snapshot.estimatedTokens,
      createdAt: snapshot.createdAt,
    };

    await this.prisma.aiContextSnapshot.upsert({
      where: { id: snapshot.id },
      create: data,
      update: data,
    });

    return snapshot;
  }

  async findById(id: string): Promise<AiContextSnapshot | undefined> {
    const record = await this.prisma.aiContextSnapshot.findUnique({ where: { id } });
    return record ? toDomain(record) : undefined;
  }

  async listByInquiryCaseId(inquiryCaseId: string): Promise<AiContextSnapshot[]> {
    const records = await this.prisma.aiContextSnapshot.findMany({
      where: { inquiryCaseId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toDomain);
  }
}

function toDomain(record: {
  id: string;
  inquiryCaseId: string | null;
  emailMessageId: string | null;
  purpose: string;
  contextPayloadJson: unknown;
  messagesJson: unknown;
  sourceReferences: unknown;
  estimatedTokens: number | null;
  createdAt: Date;
}): AiContextSnapshot {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId ?? '',
    emailMessageId: record.emailMessageId ?? undefined,
    purpose: record.purpose as ContextPurpose,
    contextPayload: parseContextPayload(record.contextPayloadJson, record.messagesJson),
    messages: Array.isArray(record.messagesJson)
      ? (record.messagesJson as AiChatMessage[])
      : [],
    sourceReferences: Array.isArray(record.sourceReferences)
      ? (record.sourceReferences as ContextSourceReference[])
      : [],
    estimatedTokens: record.estimatedTokens ?? 0,
    createdAt: record.createdAt,
  };
}

function parseContextPayload(
  contextPayloadJson: unknown,
  messagesJson: unknown,
): AiEmailAnalysisContextPayload {
  const direct = aiEmailAnalysisContextPayloadSchema.safeParse(contextPayloadJson);
  if (direct.success) {
    return direct.data;
  }

  const messages = Array.isArray(messagesJson) ? (messagesJson as AiChatMessage[]) : [];
  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }

    try {
      const parsed = JSON.parse(message.content);
      const fromMessage = aiEmailAnalysisContextPayloadSchema.safeParse(parsed);
      if (fromMessage.success) {
        return fromMessage.data;
      }
    } catch {
      // Older snapshots may contain natural language user content.
    }
  }

  throw new Error('AiContextSnapshot is missing a valid context payload.');
}
