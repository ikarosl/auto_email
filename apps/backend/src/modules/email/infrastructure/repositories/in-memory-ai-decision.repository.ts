import {
  AiDecisionRepository,
  SaveAiDecisionInput,
} from '../../application/ports/ai-decision.repository.js';

export class InMemoryAiDecisionRepository implements AiDecisionRepository {
  private readonly decisions: SaveAiDecisionInput[] = [];

  async save(input: SaveAiDecisionInput): Promise<string> {
    this.decisions.push(input);
    return `ai_decision_${this.decisions.length}`;
  }

  async list(): Promise<SaveAiDecisionInput[]> {
    return [...this.decisions];
  }
}
