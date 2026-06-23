import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity.js';

export interface ContextSnapshotRepository {
  save(snapshot: AiContextSnapshot): Promise<AiContextSnapshot>;
  findById(id: string): Promise<AiContextSnapshot | undefined>;
  listByInquiryCaseId(inquiryCaseId: string): Promise<AiContextSnapshot[]>;
}
