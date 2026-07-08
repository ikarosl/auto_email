import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ContextSnapshotRepository } from './application/ports/context-snapshot.repository.js';
import { InquiryContextSummaryGenerator } from './application/ports/inquiry-context-summary-generator.js';
import { InquiryContextSummaryRepository } from './application/ports/inquiry-context-summary.repository.js';
import { RagRetrieverAdapter } from './application/ports/rag-retriever.adapter.js';
import { TokenEstimator } from './application/ports/token-estimator.js';
import { BuildAiContextUseCase } from './application/use-cases/build-ai-context.use-case.js';
import { DeepseekInquiryContextSummaryGenerator } from './infrastructure/adapters/deepseek-inquiry-context-summary.generator.js';
import { NoopRagRetrieverAdapter } from './infrastructure/adapters/noop-rag-retriever.adapter.js';
import { TiktokenTokenEstimator } from './infrastructure/adapters/tiktoken-token-estimator.js';
import { PrismaContextSnapshotRepository } from './infrastructure/repositories/prisma-context-snapshot.repository.js';
import { PrismaInquiryContextSummaryRepository } from './infrastructure/repositories/prisma-inquiry-context-summary.repository.js';
import {
  CONTEXT_SNAPSHOT_REPOSITORY,
  INQUIRY_CONTEXT_SUMMARY_GENERATOR,
  INQUIRY_CONTEXT_SUMMARY_REPOSITORY,
  RAG_RETRIEVER_ADAPTER,
  TOKEN_ESTIMATOR,
} from './context.tokens.js';

@Module({
  providers: [
    {
      provide: CONTEXT_SNAPSHOT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaContextSnapshotRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INQUIRY_CONTEXT_SUMMARY_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInquiryContextSummaryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: TOKEN_ESTIMATOR,
      useClass: TiktokenTokenEstimator,
    },
    {
      provide: INQUIRY_CONTEXT_SUMMARY_GENERATOR,
      useClass: DeepseekInquiryContextSummaryGenerator,
    },
    {
      provide: RAG_RETRIEVER_ADAPTER,
      useClass: NoopRagRetrieverAdapter,
    },
    {
      provide: BuildAiContextUseCase,
      useFactory: (
        contextSnapshotRepository: ContextSnapshotRepository,
        inquiryContextSummaryRepository: InquiryContextSummaryRepository,
        inquiryContextSummaryGenerator: InquiryContextSummaryGenerator,
        tokenEstimator: TokenEstimator,
        ragRetrieverAdapter: RagRetrieverAdapter,
      ) => new BuildAiContextUseCase(
        contextSnapshotRepository,
        inquiryContextSummaryRepository,
        inquiryContextSummaryGenerator,
        tokenEstimator,
        ragRetrieverAdapter,
      ),
      inject: [
        CONTEXT_SNAPSHOT_REPOSITORY,
        INQUIRY_CONTEXT_SUMMARY_REPOSITORY,
        INQUIRY_CONTEXT_SUMMARY_GENERATOR,
        TOKEN_ESTIMATOR,
        RAG_RETRIEVER_ADAPTER,
      ],
    },
  ],
  exports: [
    BuildAiContextUseCase,
    CONTEXT_SNAPSHOT_REPOSITORY,
    INQUIRY_CONTEXT_SUMMARY_REPOSITORY,
    INQUIRY_CONTEXT_SUMMARY_GENERATOR,
    TOKEN_ESTIMATOR,
    RAG_RETRIEVER_ADAPTER,
  ],
})
export class ContextModule {}
