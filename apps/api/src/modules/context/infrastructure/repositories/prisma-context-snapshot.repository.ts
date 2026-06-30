import { PrismaService } from '../../../../common/database/prisma.service.js';
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
