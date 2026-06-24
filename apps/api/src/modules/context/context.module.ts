import { Module } from '@nestjs/common';

import { ContextSnapshotRepository } from './application/ports/context-snapshot.repository.js';
import { RagRetrieverAdapter } from './application/ports/rag-retriever.adapter.js';
import { TokenEstimator } from './application/ports/token-estimator.js';
import { BuildAiContextUseCase } from './application/use-cases/build-ai-context.use-case.js';
import { NoopRagRetrieverAdapter } from './infrastructure/adapters/noop-rag-retriever.adapter.js';
import { SimpleTokenEstimator } from './infrastructure/adapters/simple-token-estimator.js';
import { InMemoryContextSnapshotRepository } from './infrastructure/repositories/in-memory-context-snapshot.repository.js';
import {
  CONTEXT_SNAPSHOT_REPOSITORY,
  RAG_RETRIEVER_ADAPTER,
  TOKEN_ESTIMATOR,
} from './context.tokens.js';

@Module({
  providers: [
    {
      provide: CONTEXT_SNAPSHOT_REPOSITORY,
      useClass: InMemoryContextSnapshotRepository,
    },
    {
      provide: TOKEN_ESTIMATOR,
      useClass: SimpleTokenEstimator,
    },
    {
      provide: RAG_RETRIEVER_ADAPTER,
      useClass: NoopRagRetrieverAdapter,
    },
    {
      provide: BuildAiContextUseCase,
      useFactory: (
        contextSnapshotRepository: ContextSnapshotRepository,
        tokenEstimator: TokenEstimator,
        ragRetrieverAdapter: RagRetrieverAdapter,
      ) => new BuildAiContextUseCase(contextSnapshotRepository, tokenEstimator, ragRetrieverAdapter),
      inject: [CONTEXT_SNAPSHOT_REPOSITORY, TOKEN_ESTIMATOR, RAG_RETRIEVER_ADAPTER],
    },
  ],
  exports: [
    BuildAiContextUseCase,
    CONTEXT_SNAPSHOT_REPOSITORY,
    TOKEN_ESTIMATOR,
    RAG_RETRIEVER_ADAPTER,
  ],
})
export class ContextModule {}
