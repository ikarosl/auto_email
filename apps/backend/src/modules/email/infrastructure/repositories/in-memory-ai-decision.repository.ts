import {
  AiDecisionRepository,
  SaveAiDecisionInput,
} from '../../application/ports/ai-decision.repository.js';

export class InMemoryAiDecisionRepository implements AiDecisionRepository {
  private readonly decisions: SaveAiDecisionInput[] = [];

  async save(input: SaveAiDecisionInput): Promise<void> {
    this.decisions.push(input);
  }

  async list(): Promise<SaveAiDecisionInput[]> {
    return [...this.decisions];
  }
}
