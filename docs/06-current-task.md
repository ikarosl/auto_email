# 当前开发任务：IMAP 轮询新邮件与 AI 结构化状态建议

## 1. 文件定位

本文档定义当前下一阶段开发任务。

开发时以本文档为准，并且不得与：

```text
docs/high-priority-task.md
docs/04-status-rules.md
docs/05-ai-rules.md
```

中的边界冲突。

当前阶段已经完成的基础能力：

```text
1. 后端 monorepo 与 NestJS API 框架
2. IMAP 读取 demo
3. DeepSeek / OpenAI SDK 调用 demo
4. 询盘状态机
5. 邮件接收 HTTP 入口
6. 邮件转询盘基础流程
7. InMemory EmailMessageRepository
8. InMemory InquiryRepository
```

本次任务是在上述基础上继续推进：

```text
轮询新邮件
  ↓
发现未处理邮件
  ↓
读取邮件正文
  ↓
创建 EmailMessage 与 InquiryCase
  ↓
调用 AI 生成结构化分析结果
  ↓
系统校验 AI 输出
  ↓
保存或打印 AI 建议
```

注意：

```text
AI 只能建议。
AI 不自动修改询盘状态。
AI 不自动发送邮件。
AI 不自动进入报价、合同、付款、PI 等流程。
```

---

## 2. 本次任务名称

```text
IMAP 轮询新邮件与 AI 结构化状态建议
```

---

## 3. 本次任务目标

实现一个可验证的后端 demo 流程：

```text
系统每隔一段时间轮询 IMAP 邮箱。
如果发现新邮件，则读取邮件内容。
系统将邮件转换为内部 EmailMessage。
系统创建 InquiryCase，初始状态为 new。
系统调用 AI 分析邮件内容。
AI 返回严格 JSON。
系统用 schema 校验 AI 输出。
校验成功后输出或保存 AI 建议。
校验失败时标记为需要人工处理。
```

本次目标不是让 AI 自动处理询盘，而是先确认：

```text
邮件可以稳定被发现。
邮件可以稳定进入系统。
AI 可以读取邮件正文并给出结构化建议。
系统可以判断 AI 输出是否合规。
```

---

## 4. 本次推荐流程

推荐实现流程：

```text
启动 poll-inbox demo
  ↓
加载 .env 配置
  ↓
连接 IMAP
  ↓
读取 mailbox 状态
  ↓
记录当前已知 UID / Message-ID
  ↓
每隔 IMAP_POLL_INTERVAL_MS 轮询一次
  ↓
发现新的 UID / Message-ID
  ↓
拉取邮件 source
  ↓
使用 mailparser 解析正文
  ↓
转换为 InboundEmail
  ↓
调用 ReceiveInboundEmailUseCase
  ↓
创建 EmailMessage 与 InquiryCase(status = new)
  ↓
调用 AnalyzeEmailWithAiUseCase
  ↓
校验 AI JSON 输出
  ↓
输出结构化分析结果
```

---

## 5. 新增配置项

在 `.env.example` 中增加：

```text
IMAP_POLL_INTERVAL_MS=10000
IMAP_POLL_BOOTSTRAP_MODE=mark_existing_seen
AI_EMAIL_ANALYSIS_ENABLED=true
AI_EMAIL_ANALYSIS_MODEL=deepseek-v4-pro
```

说明：

```text
IMAP_POLL_INTERVAL_MS
轮询间隔，开发阶段可用 10000，即 10 秒。

IMAP_POLL_BOOTSTRAP_MODE
首次启动时如何处理邮箱已有邮件。
推荐第一版使用 mark_existing_seen，表示启动时先记录现有邮件，不立即全部处理。

AI_EMAIL_ANALYSIS_ENABLED
是否启用 AI 分析。

AI_EMAIL_ANALYSIS_MODEL
邮件分析使用的模型。
```

---

## 6. 新增模块与文件建议

### 6.1 轮询相关

建议新增：

```text
apps/backend/src/modules/email/application/ports/processed-email-tracker.ts
apps/backend/src/modules/email/infrastructure/repositories/in-memory-processed-email-tracker.ts
apps/backend/src/modules/email/application/use-cases/poll-email-inbox.use-case.ts
apps/backend/src/modules/email/infrastructure/adapters/imap-poll-inbox-demo.ts
```

职责：

```text
ProcessedEmailTracker
记录哪些邮件已经见过或处理过。

InMemoryProcessedEmailTracker
第一版用内存 Set 实现。

PollEmailInboxUseCase
负责轮询逻辑，不直接做 AI 判断。

imap-poll-inbox-demo.ts
临时命令入口，用于验证 10 秒轮询流程。
```

第一版可以记录：

```text
mailbox
uid
messageId
seenAt
processedAt
```

内存实现可简化为：

```ts
Set<string>
```

key 可使用：

```text
mailbox:uid
```

或：

```text
messageId
```

推荐同时保留 UID 与 Message-ID，便于后续持久化。

---

### 6.2 AI 分析相关

建议新增：

```text
apps/backend/src/modules/email/domain/value-objects/email-ai-analysis.vo.ts
apps/backend/src/modules/email/application/use-cases/analyze-email-with-ai.use-case.ts
apps/backend/src/modules/email/application/dto/email-ai-analysis.schema.ts
apps/backend/src/modules/email/infrastructure/adapters/deepseek-email-analysis.adapter.ts
```

职责：

```text
EmailAiAnalysis
定义系统内部认可的 AI 分析结果。

AnalyzeEmailWithAiUseCase
接收 EmailMessage 或邮件正文，调用 AI adapter，并校验结构化输出。

email-ai-analysis.schema.ts
使用 zod 定义结构化输出校验规则。

DeepseekEmailAnalysisAdapter
封装 OpenAI SDK / DeepSeek 调用。
```

---

## 7. AI 结构化输出要求

AI 必须只返回 JSON，不返回 Markdown，不返回解释性文本。

推荐结构：

```ts
{
  isInquiry: boolean;
  classification:
    | 'valid_inquiry'
    | 'invalid'
    | 'unrelated_product'
    | 'commercial'
    | 'unknown';

  suggestedStatus:
    | 'new'
    | 'invalid'
    | 'need_clarification'
    | 'need_engineer_review'
    | 'waiting_customer'
    | 'ready_for_quote'
    | 'closed';

  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';

  reason: string;
  missingFields: string[];

  extractedRequirements: {
    productType?: string;
    frequencyRange?: string;
    power?: string;
    quantity?: string;
    sizeRequirement?: string;
    application?: string;
  };

  quoteBoundaryDetected: boolean;
  humanReviewRequired: boolean;
  nextAction: string;
}
```

字段规则：

```text
confidence 必须在 0 到 1 之间。
reason 必须说明建议原因。
missingFields 可以为空数组。
quoteBoundaryDetected 为 true 时，humanReviewRequired 必须为 true。
suggestedStatus 为 ready_for_quote 时，humanReviewRequired 必须为 true。
suggestedStatus 为 closed 时，humanReviewRequired 必须为 true。
```

---

## 8. 系统提示词

推荐系统提示词：

```text
You are an assistant for an email inquiry management system.

Your task is to analyze one customer email and output a strict JSON object.

You may:
- identify whether the email is a valid product inquiry
- extract technical requirements
- identify missing information
- suggest the next inquiry status
- identify risk or quotation boundary signals

You must not:
- promise technical feasibility
- promise price, lead time, payment, contract, PI, or delivery
- decide final quotation readiness without human review
- suggest sending an external reply automatically
- output any text outside JSON

Allowed first-version statuses:
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed

Rules:
- If product requirements are missing, suggest need_clarification.
- If technical requirements are mostly clear but feasibility needs engineering confirmation, suggest need_engineer_review.
- If the email asks for price, quote, payment, invoice, contract, PI, purchase order, or commercial terms, set quoteBoundaryDetected=true and humanReviewRequired=true.
- Do not suggest ready_for_quote unless the email clearly indicates quotation readiness, and still set humanReviewRequired=true.
- Do not suggest closed unless the email is clearly not actionable.
- If unsure, suggest need_clarification or need_engineer_review and set humanReviewRequired=true.

Return only valid JSON matching the schema.
```

---

## 9. 系统校验规则

AI 输出后，系统必须执行：

```text
1. 提取 JSON。
2. JSON.parse。
3. 使用 zod schema 校验。
4. 校验 suggestedStatus 是否属于第一版状态。
5. 校验 suggestedStatus 是否不会越权。
6. 校验报价边界。
7. 校验 humanReviewRequired。
```

校验失败时：

```text
不得丢弃邮件。
不得自动改状态。
不得自动回复。
应输出 ai_parse_failed 或 ai_validation_failed。
应标记 humanReviewRequired=true。
```

校验成功时：

```text
可以保存或打印 AI 建议。
不得自动执行 suggestedStatus。
```

---

## 10. 状态机边界

本次 AI 只能建议：

```text
suggestedStatus
reason
confidence
riskLevel
missingFields
nextAction
```

AI 不允许直接调用：

```text
TransitionInquiryStatusUseCase
InquiryStateMachine.transition
POST /inquiries/:id/transitions
```

如果后续要把 AI 建议转为真实状态，必须单独设计人工确认流程。

---

## 11. 报价与人工接管规则

如果邮件或 AI 结果中出现以下内容，必须人工接管：

```text
price
quotation
quote
payment
invoice
contract
PI
purchase order
lead time confirmation
commercial terms
```

中文包括：

```text
价格
报价
付款
发票
合同
形式发票
采购订单
交期确认
商务条款
```

触发后要求：

```text
quoteBoundaryDetected=true
humanReviewRequired=true
不得自动回复
不得自动进入 ready_for_quote
不得自动进入 closed
```

---

## 12. 本次推荐实现顺序

```text
1. 新增 zod 依赖。
2. 定义 EmailAiAnalysis value object。
3. 定义 EmailAiAnalysis zod schema。
4. 实现 DeepseekEmailAnalysisAdapter。
5. 实现 AnalyzeEmailWithAiUseCase。
6. 实现 ProcessedEmailTracker 接口。
7. 实现 InMemoryProcessedEmailTracker。
8. 实现 PollEmailInboxUseCase。
9. 新增 demo:poll-inbox 命令。
10. 轮询发现新邮件后，创建询盘并执行 AI 分析。
11. 打印结构化分析结果。
12. 补充单元测试。
13. 更新 README 和 .env.example。
```

---

## 13. 本次验收标准

完成后应满足：

```text
1. 可以启动 poll-inbox demo。
2. 可以按 IMAP_POLL_INTERVAL_MS 轮询邮箱。
3. 启动时可以记录已有邮件，避免首次处理全量历史邮件。
4. 新邮件到达后可以被发现。
5. 新邮件可以转换为 InboundEmail。
6. 新邮件可以创建 EmailMessage。
7. 新邮件可以创建 InquiryCase，状态为 new。
8. AI 可以读取邮件正文。
9. AI 返回结构化 JSON。
10. 系统可以用 schema 校验 AI 输出。
11. 校验失败时不会自动推进流程。
12. 校验成功时只生成建议，不自动修改状态。
13. 报价、合同、付款、PI 等内容必须触发 humanReviewRequired。
14. 不自动发送邮件。
15. 不自动进入 ready_for_quote。
16. 不自动关闭询盘。
```

---

## 14. 本次明确不做

本次不要实现：

```text
AI 自动回复
邮件自动发送
AI 自动修改询盘状态
AI 自动进入 ready_for_quote
AI 自动关闭询盘
RAG
向量数据库
产品知识库检索
报价流程
研发评审流程
合同流程
付款流程
PI 流程
前端页面
数据库持久化
附件深度解析
```

---

## 15. 测试建议

### 15.1 单元测试

建议覆盖：

```text
AI JSON schema 校验成功。
AI JSON schema 校验失败。
quoteBoundaryDetected=true 时 humanReviewRequired 必须为 true。
ready_for_quote 建议必须 humanReviewRequired=true。
ProcessedEmailTracker 能识别已处理邮件。
PollEmailInboxUseCase 不重复处理同一封邮件。
```

### 15.2 手动测试

测试流程：

```text
1. 启动 poll-inbox demo。
2. 确认启动时记录已有邮件。
3. 向测试邮箱发送一封新询盘邮件。
4. 等待 10 秒轮询。
5. 确认系统发现新邮件。
6. 确认创建 inquiryCase。
7. 确认 inquiryCase.status=new。
8. 确认 AI 输出 JSON。
9. 确认系统校验通过。
10. 确认系统没有自动修改状态。
```

---

## 16. 总结

本次任务的核心不是“让 AI 接管邮件”，而是：

```text
让系统能持续发现新邮件。
让 AI 读取新邮件并给出结构化建议。
让系统有能力判断 AI 输出是否可信、是否越界。
```

当前阶段的安全边界：

```text
AI 可以建议。
系统必须校验。
人工最终决策。
状态机守住边界。
```
