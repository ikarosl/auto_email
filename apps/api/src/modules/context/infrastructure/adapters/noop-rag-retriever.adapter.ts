import {
  RagReference,
  RagRetrieveInput,
  RagRetrieverAdapter,
} from '../../application/ports/rag-retriever.adapter.js';

export class NoopRagRetrieverAdapter implements RagRetrieverAdapter {
  async retrieve(_input: RagRetrieveInput): Promise<RagReference[]> {
    return [];
  }
}
