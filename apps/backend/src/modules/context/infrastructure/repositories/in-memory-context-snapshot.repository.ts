import { ContextSnapshotRepository } from '../../application/ports/context-snapshot.repository.js';
import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity.js';

export class InMemoryContextSnapshotRepository implements ContextSnapshotRepository {
  private readonly snapshots = new Map<string, AiContextSnapshot>();

  async save(snapshot: AiContextSnapshot): Promise<AiContextSnapshot> {
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async findById(id: string): Promise<AiContextSnapshot | undefined> {
    return this.snapshots.get(id);
  }

  async listByInquiryCaseId(inquiryCaseId: string): Promise<AiContextSnapshot[]> {
    return Array.from(this.snapshots.values()).filter(
      (snapshot) => snapshot.inquiryCaseId === inquiryCaseId,
    );
  }
}
