# Context Manager 设计方案

## 1. 文件定位

本文档用于设计邮件询盘自动处理系统中的上下文管理模块。

本模块解决的问题是：

```text
AI API 每次调用都是一次独立请求。
模型不会自动记住历史邮件、询盘状态、人工判断、研发意见或我方回复。
因此必须由系统负责构造上下文。
```

Context Manager 的职责是：

```text
在每次调用 AI 前，选择、压缩、组织和校验上下文。
```

它不负责：

```text
拉取邮件
创建询盘
修改询盘状态
发送邮件
报价
研发评审
RAG 向量检索的具体实现
```

---

## 2. 核心原则

```text
原文永远保存。
摘要只作为压缩视图，不作为事实源。
结构化事实必须可追溯。
AI 输出必须校验。
AI 建议不能覆盖人工和研发判断。
AI 不自动修改状态。
AI 不自动回复邮件。
```

Context Manager 的目标不是把上下文塞得越多越好，而是：

```text
该出现的出现。
不该出现的闭嘴。
关键事实可追溯。
风险边界不丢失。
```

---

## 3. 当前背景

当前项目已经具备：

```text
1. IMAP 邮件读取
2. 邮件转 EmailMessage
3. 邮件创建 InquiryCase
4. 询盘状态机
5. DeepSeek / OpenAI SDK 调用
6. AI 结构化分析 JSON
7. zod schema 校验
```

当前 AI 分析链路仍然偏简单：

```text
当前邮件正文
  ↓
AI 分析
  ↓
结构化 JSON
```

后续需要升级为：

```text
当前邮件
  ↓
Context Manager 构造上下文
  ↓
AI 分析
  ↓
结构化 JSON
  ↓
系统校验
  ↓
保存 AI 建议与上下文快照
```

---

## 4. 推荐模块位置

不要把上下文管理塞进 `email` 模块，也不要塞进 AI adapter。

建议新增独立模块：

```text
apps/backend/src/modules/context/
```

原因：

```text
email 模块只负责邮件接收和标准化。
inquiry 模块只负责询盘和状态机。
context 模块负责为 AI 调用准备上下文。
后续 reply draft、engineer handoff、quote handoff 都会复用 context 能力。
```

---

## 5. 推荐目录结构

```text
apps/backend/src/modules/context/
  context.module.ts

  domain/
    entities/
      inquiry-context-summary.entity.ts
      inquiry-structured-facts.entity.ts
      ai-context-snapshot.entity.ts

    value-objects/
      context-window.vo.ts
      context-budget.vo.ts
      context-message-item.vo.ts
      context-source-reference.vo.ts
      structured-requirements.vo.ts

    enums/
      context-purpose.enum.ts
      context-source-type.enum.ts
      context-compression-status.enum.ts

  application/
    dto/
      build-ai-context.dto.ts
      context-snapshot-response.dto.ts
      structured-facts.schema.ts
      inquiry-summary.schema.ts

    ports/
      context-summary.repository.ts
      structured-facts.repository.ts
      context-snapshot.repository.ts
      token-estimator.ts
      context-compressor.adapter.ts
      rag-retriever.adapter.ts

    use-cases/
      build-ai-context.use-case.ts
      update-context-after-email.use-case.ts
      compress-inquiry-history.use-case.ts
      extract-structured-facts.use-case.ts
      save-context-snapshot.use-case.ts

  infrastructure/
    adapters/
      deepseek-context-compressor.adapter.ts
      deepseek-fact-extractor.adapter.ts
      simple-token-estimator.ts
      noop-rag-retriever.adapter.ts

    repositories/
      in-memory-context-summary.repository.ts
      in-memory-structured-facts.repository.ts
      in-memory-context-snapshot.repository.ts

  presentation/
    context-debug.controller.ts
```

第一版可以先只实现：

```text
ContextPurpose
ContextBudget
ContextSourceReference
BuildAiContextUseCase
SimpleTokenEstimator
NoopRagRetrieverAdapter
InMemoryContextSnapshotRepository
```

---

## 6. 上下文组成

原始设想包含 8 点：

```text
1. 固定 system prompt
2. 当前邮件线程 summary
3. 客户最新邮件原文
4. 最近一封我方回复
5. 已提取的需求参数 JSON
6. RAG 检索出的 3-5 条资料
7. 当前状态机阶段
8. 输出格式要求
```

建议调整为 10 点：

```text
1. 固定 system prompt
2. 当前任务目的 contextPurpose
3. 当前状态机阶段
4. 当前客户最新邮件原文
5. 最近邮件窗口，客户和我方都包含
6. 最近我方关键回复窗口
7. 滚动询盘摘要 inquiry summary
8. 已确认 / 待确认结构化事实 JSON
9. RAG 检索资料
10. 输出格式和禁止越权规则
```

---

## 7. 关于“最近一封我方回复”

只提供最近一封我方回复通常不够。

它可能漏掉：

```text
1. 我方之前是否已经问过某个参数。
2. 我方是否已经承诺交给工程师确认。
3. 我方是否已经拒绝过某个要求。
4. 我方是否已经提醒过报价、交期、付款需要人工确认。
5. 客户当前回复是在回答哪一封我方邮件。
6. 多轮沟通中我方是否曾改变过判断。
```

建议将该部分改为：

```text
最近我方关键回复窗口
```

内容包括：

```text
最近 1-3 封我方回复原文
最近一封我方回复摘要
我方已提出的问题列表
我方已承诺事项列表
我方明确未承诺事项列表
```

核心不是“最近一封够不够”，而是让 AI 明确：

```text
我方最近说了什么。
我方正在等客户回答什么。
哪些话不能被 AI 推翻。
哪些边界不能越过。
```

---

## 8. 邮件压缩分层

邮件上下文建议分为五层。

### 8.1 第一层：原始邮件记录

```text
永远保存。
不压缩。
作为事实源。
```

对应对象：

```text
EmailMessage
```

### 8.2 第二层：最近邮件窗口

```text
最近 3-5 封邮件保留原文。
客户邮件和我方邮件都要考虑。
当前邮件必须保留。
```

建议不要只按总数量取最近 5 封。

更稳的方式：

```text
当前客户邮件 1 封
最近客户邮件 3 封
最近我方邮件 1-3 封
```

### 8.3 第三层：滚动摘要

更早的邮件压缩成：

```text
InquiryContextSummary
```

摘要内容包括：

```text
客户意图
需求演变
我方立场
已问问题
客户已回答问题
未解决问题
风险点
关键决定
```

### 8.4 第四层：结构化事实

结构化事实包括：

```text
客户
产品
频段
功率
数量
应用场景
交期
认证要求
缺失字段
开放问题
风险提示
```

结构化事实必须 schema 校验。

### 8.5 第五层：语义检索记忆

后续通过 RAG 按需取回：

```text
历史邮件 chunk
产品文档 chunk
规格书 chunk
历史案例 chunk
```

当前阶段可以先实现：

```text
NoopRagRetrieverAdapter
```

即接口存在，但不实际检索。

---

## 9. 触发点设计

### 9.1 触发点一：邮件入库后

每收到一封新邮件：

```text
1. 保存原文。
2. 关联 InquiryCase。
3. 抽取结构化事实。
4. 更新当前 inquiry facts。
5. 判断是否需要压缩历史。
```

对应 use case：

```text
UpdateContextAfterEmailUseCase
ExtractStructuredFactsUseCase
```

### 9.2 触发点二：历史过长时

触发条件示例：

```text
当前询盘关联邮件超过 6 封。
最近邮件窗口估算 token 超过阈值。
滚动摘要覆盖范围落后于最新邮件。
```

对应 use case：

```text
CompressInquiryHistoryUseCase
```

### 9.3 触发点三：调用 AI 前

每次调用 AI 前最后构造上下文：

```text
1. 读取 system prompt。
2. 读取状态机阶段。
3. 读取当前邮件。
4. 读取最近邮件窗口。
5. 读取最近我方关键回复窗口。
6. 读取滚动摘要。
7. 读取结构化事实。
8. 按需读取 RAG 资料。
9. 做 token 预算分配。
10. 生成 messages。
11. 保存 AiContextSnapshot。
```

对应 use case：

```text
BuildAiContextUseCase
SaveContextSnapshotUseCase
```

---

## 10. Token 预算策略

初始建议：

```text
系统规则：1500 tokens
客户资料：500 tokens
结构化事实：1000 tokens
历史摘要：1500 tokens
最近邮件：3000 tokens
RAG 资料：3000 tokens
当前邮件：2000 tokens
输出空间：2000 tokens
```

预算应按任务动态调整。

例如：

```text
email_analysis
更重视当前邮件和结构化事实。

reply_draft
更重视最近我方回复、历史摘要和禁止越权规则。

engineer_handoff
更重视技术参数、附件、RAG 资料和未确认字段。

quote_handoff
更重视需求摘要、研发意见、风险点和客户意图。
```

---

## 11. ContextPurpose

上下文必须带任务目的。

建议枚举：

```ts
export enum ContextPurpose {
  EMAIL_ANALYSIS = 'email_analysis',
  REPLY_DRAFT = 'reply_draft',
  STATUS_SUGGESTION = 'status_suggestion',
  ENGINEER_HANDOFF = 'engineer_handoff',
  QUOTE_HANDOFF = 'quote_handoff',
  RISK_CHECK = 'risk_check',
}
```

不同 purpose 使用不同上下文预算和 system prompt。

---

## 12. 核心实体建议

### 12.1 InquiryStructuredFacts

```ts
interface InquiryStructuredFacts {
  inquiryCaseId: string;
  customerRequirements: {
    productType?: string;
    frequencyRange?: string;
    power?: string;
    quantity?: string;
    sizeRequirement?: string;
    application?: string;
    deliveryRequirement?: string;
    certificationRequirement?: string;
  };
  missingFields: string[];
  confirmedFields: string[];
  openQuestions: string[];
  constraints: string[];
  sourceEmailIds: string[];
  updatedAt: Date;
}
```

### 12.2 InquiryContextSummary

```ts
interface InquiryContextSummary {
  inquiryCaseId: string;
  summaryText: string;
  customerIntentSummary: string;
  ourLastPositionSummary: string;
  unresolvedQuestions: string[];
  keyDecisions: string[];
  riskNotes: string[];
  coveredEmailIds: string[];
  updatedAt: Date;
}
```

### 12.3 AiContextSnapshot

```ts
interface AiContextSnapshot {
  id: string;
  inquiryCaseId: string;
  emailMessageId?: string;
  purpose: ContextPurpose;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  sourceReferences: Array<{
    sourceType: 'email' | 'summary' | 'facts' | 'rag' | 'state';
    sourceId?: string;
  }>;
  estimatedTokens: number;
  createdAt: Date;
}
```

`AiContextSnapshot` 非常重要。

它用于追溯：

```text
当时 AI 看到了哪些上下文。
为什么 AI 得出这个判断。
是否因为上下文缺失导致误判。
```

---

## 13. 事实来源分级

结构化事实不能只有值，还应尽量保留来源和确认等级。

建议区分：

```text
customer_claimed
ai_extracted
human_confirmed
engineer_confirmed
```

原因：

```text
客户说“20W”只代表客户要求。
AI 提取“20W”只代表 AI 看到了这个要求。
人工确认“20W”代表业务已核对。
研发确认“20W”才代表技术可行性判断。
```

AI 不能把客户要求误写成我方承诺。

---

## 14. BuildAiContextUseCase

推荐入口：

```ts
BuildAiContextUseCase.execute({
  inquiryCaseId,
  currentEmailMessageId,
  purpose,
})
```

内部流程：

```text
1. 读取 InquiryCase。
2. 读取 current EmailMessage。
3. 读取同 inquiry 下最近邮件窗口。
4. 读取最近我方关键回复窗口。
5. 读取 InquiryContextSummary。
6. 读取 InquiryStructuredFacts。
7. 根据 purpose 调用 RagRetrieverAdapter。
8. 根据 token budget 裁剪。
9. 拼成 messages。
10. 保存 AiContextSnapshot。
11. 返回 messages、contextSnapshotId、sources、estimatedTokens。
```

返回结构：

```ts
interface BuildAiContextResult {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  contextSnapshotId: string;
  sources: ContextSourceReference[];
  estimatedTokens: number;
}
```

后续 `AnalyzeEmailWithAiUseCase` 不应直接拼单封邮件，而应接收：

```text
BuildAiContextUseCase 生成的 messages
```

---

## 15. 上下文链路

当前简单链路：

```text
新邮件
  ↓
EmailMessage
  ↓
InquiryCase(status = new)
  ↓
AI 分析当前邮件
  ↓
zod 校验
```

目标链路：

```text
新邮件入库
  ↓
找到或创建 InquiryCase
  ↓
UpdateContextAfterEmailUseCase
  ↓
抽取结构化事实
  ↓
判断是否需要压缩历史
  ↓
BuildAiContextUseCase
  ↓
AnalyzeEmailWithAiUseCase
  ↓
zod 校验
  ↓
保存 AIAnalysis
  ↓
保存 AiContextSnapshot
```

---

## 16. Repository 与 Adapter 边界

Context 模块应依赖接口，而不是具体实现。

建议 ports：

```text
ContextSummaryRepository
StructuredFactsRepository
ContextSnapshotRepository
TokenEstimator
ContextCompressorAdapter
RagRetrieverAdapter
```

第一版实现：

```text
InMemoryContextSummaryRepository
InMemoryStructuredFactsRepository
InMemoryContextSnapshotRepository
SimpleTokenEstimator
NoopRagRetrieverAdapter
```

后续替换：

```text
MySqlContextSummaryRepository
MySqlStructuredFactsRepository
MySqlContextSnapshotRepository
DeepseekContextCompressorAdapter
VectorRagRetrieverAdapter
```

---

## 17. 与现有模块的关系

### 17.1 email 模块

提供：

```text
EmailMessage
EmailMessageRepository
```

Context 模块读取邮件，但不负责拉取邮件。

### 17.2 inquiry 模块

提供：

```text
InquiryCase
InquiryRepository
InquiryStatus
InquiryStateMachine
```

Context 模块读取状态，但不负责修改状态。

### 17.3 AI 分析模块

当前 AI 分析在 email 模块内。

后续建议调整为：

```text
AI adapter 负责调用模型。
Context module 负责构造 messages。
Analyze use case 负责校验输出。
```

---

## 18. 当前不建议立即实现的内容

当前不要急着实现：

```text
完整 RAG
向量数据库
产品知识库后台
复杂摘要链
自动回复
自动状态流转
报价前交接
研发评审
```

可以先保留接口。

---

## 19. 分阶段落地建议

### 阶段一：Context Manager 骨架

目标：

```text
让 AI 调用不再直接吃单封邮件，而是通过 BuildAiContextUseCase 统一生成上下文。
```

实现：

```text
context 模块
ContextPurpose enum
ContextBudget
ContextSourceReference
BuildAiContextUseCase
SimpleTokenEstimator
NoopRagRetrieverAdapter
AiContextSnapshot
InMemoryContextSnapshotRepository
```

验收：

```text
调用邮件 AI 分析前，可以生成 context messages。
可以保存 context snapshot。
snapshot 能看到上下文来源。
```

### 阶段二：结构化事实与摘要

目标：

```text
每封邮件入库后更新结构化事实和滚动摘要。
```

实现：

```text
ExtractStructuredFactsUseCase
UpdateContextAfterEmailUseCase
InquiryStructuredFacts schema
InquiryContextSummary schema
InMemoryStructuredFactsRepository
InMemoryContextSummaryRepository
```

验收：

```text
新邮件进入后，结构化事实被更新。
历史邮件超过阈值后，摘要可以覆盖旧邮件。
```

### 阶段三：压缩与 RAG

目标：

```text
历史邮件过长时自动压缩。
根据任务目的检索产品资料或历史片段。
```

实现：

```text
CompressInquiryHistoryUseCase
DeepseekContextCompressorAdapter
RagRetrieverAdapter
产品资料检索
历史邮件 chunk 检索
```

验收：

```text
长线程不会超 token。
AI 可以看到相关产品资料。
RAG 引用可以追溯。
```

---

## 20. 总结

Context Manager 是 AI 能否稳定工作的基础设施。

它的核心职责是：

```text
把邮件、询盘、状态、摘要、结构化事实、我方回复、RAG 资料组织成一次可控的 AI 输入。
```

下一步最建议先实现：

```text
阶段一：Context Manager 骨架。
```

不要一开始就做完整 RAG 或复杂压缩。

先把：

```text
BuildAiContextUseCase
AiContextSnapshot
ContextPurpose
TokenBudget
```

打稳。
后续所有 AI 能力都会从这里受益。


---
旧设计：

## 上下文总共由以下8点组成：
1. 固定 system prompt
2. 当前邮件线程 summary
3. 客户最新邮件原文
4. 最近一封我方回复
5. 已提取的需求参数 JSON
6. RAG 检索出的 3-5 条资料
7. 当前状态机阶段
8. 输出格式要求

## 部分设计细节：
我希望系统的上下文管理中的邮件信息压缩管理做成这样（这里对应的结构化事实需要schema验证，保证特定步产出这些结构化数据，并作为存储）：

第一层：原始邮件记录
永远保存，不压缩，作为事实源。

第二层：最近邮件窗口
最近 3-5 封邮件保留原文。

第三层：滚动摘要
更早的邮件压缩成 inquiry summary。

第四层：结构化事实
客户、产品、频段、功率、数量、应用场景、交期、认证要求等。

第五层：语义检索记忆
历史邮件 chunk / 产品文档 chunk / 规格书 chunk，用 RAG 按需取回。


## 上下文压缩
触发点一：邮件入库后

每收到一封新邮件，先保存原文，然后抽取结构化事实：

触发点二：历史过长时

比如当前询盘邮件超过 6 封，或者 token 估算超过阈值：


触发点三：调用 AI 前

最后再做一次预算分配（这里可以动态调整参数）：

系统规则：1500 tokens
客户资料：500 tokens
结构化事实：1000 tokens
历史摘要：1500 tokens
最近邮件：3000 tokens
RAG资料：3000 tokens
当前邮件：2000 tokens
输出空间：2000 tokens

压缩不是为了“短”，而是为了“该出现的出现，不该出现的闭嘴”。