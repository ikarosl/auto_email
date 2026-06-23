import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';

export interface RagRetrieveInput {
  inquiryCaseId: string;
  emailMessageId?: string;
  purpose: ContextPurpose;
  query: string;
  limit: number;
}

export interface RagReference {
  sourceId?: string;
  sourceTitle: string;
  content: string;
  score?: number;
}

export interface RagRetrieverAdapter {
  retrieve(input: RagRetrieveInput): Promise<RagReference[]>;
}
