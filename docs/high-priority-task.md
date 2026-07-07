当前项目已经从“验证邮件 + AI 可用性”的阶段，正式进入 **数据库持久化与真实后端服务化阶段**。

前面已经完成的是：

```text
1. Monorepo + NestJS API 框架
2. IMAP 邮件读取 demo
3. DeepSeek / OpenAI SDK 调用 demo
4. 询盘状态机
5. 邮件接收 HTTP 入口
6. IMAP 轮询新邮件
7. AI 邮件分析与结构化输出校验
8. Context Manager 骨架
9. 邮件归并 / 询盘匹配初版
10. 邮件正文解析、HTML 清洗、引用历史清洗
11. 数据库方案设计
12. PostgreSQL 建表
13. Prisma 7 schema 与 client 生成基础配置
```

现在项目所处阶段：

```text
阶段：持久化落地阶段
目标：把当前 InMemory 流程迁移为真实 PostgreSQL 存储，让邮件、询盘、上下文、AI 分析结果、结构化事实、回复草稿都能在服务重启后保留。
```

### 架构变更说明（阶段 3 完成时）

`imap-poll.service.ts` 已被重写为 NestJS `OnApplicationBootstrap` 生命周期服务，**与 HTTP 服务器在同一进程中运行**。`pnpm dev` 启动后：

```
启动 NestJS → Prisma 连接 DB → HTTP 监听 :3000 → 同时 IMAP 异步连接
→ 首次启动拉取全网箱 UID → 与 DB 比对去重 → UID 升序逐封入库 → AI 分析
→ 后续按 IMAP_POLL_INTERVAL_MS 定时轮询新邮件
```

不再有"独立进程"的设计 —— 整个后端是统一服务。

---

**阶段 1：DatabaseModule 基础接入** ✅ 已完成

目标：让 NestJS 可以通过 DI 使用 Prisma。

小点：

```text
1. 安装 @prisma/adapter-pg
2. 实现 PrismaService
3. 实现 DatabaseModule
4. AppModule 引入 DatabaseModule
5. 增加数据库连接健康检查
6. 确认 typecheck / build 通过
```

验收：

```text
NestJS 启动时可以连接 PostgreSQL。
PrismaClient 可以通过 DI 注入。
```

---

**阶段 2：Repository 持久化迁移** ✅ 已完成

目标：把当前 InMemory repository 替换为 Prisma repository。

优先顺序：

```text
1. PrismaEmailMessageRepository
2. PrismaInquiryRepository
3. PrismaInquiryMessageRepository
4. PrismaProcessedEmailTracker
5. PrismaContextSnapshotRepository
```

小点：

```text
1. 保留现有 Repository Port 不变
2. 新增 Prisma 实现
3. EmailModule / InquiryModule / ContextModule 切换 provider
4. 单元测试继续使用 InMemory
5. 集成测试或手动测试使用 Prisma
```

验收：

```text
邮件入库进入 email_messages。
询盘进入 inquiry_cases。
邮件询盘关联进入 inquiry_messages。
已处理邮件进入 processed_emails。
AI 上下文快照进入 ai_context_snapshots。
```

---

**阶段 3：IMAP 轮询命令服务化** ✅ 已完成

目标：让 `demo:poll-inbox` 不再手工 new InMemory，而是使用 Nest DI 和真实数据库。

小点：

```text
1. 改造 imap-poll-inbox-demo.ts
2. 使用 Nest ApplicationContext 启动
3. 从容器中获取 PollEmailInboxUseCase
4. 使用 Prisma repository
5. 使用 processed_emails 做 UID 幂等
6. 使用 mailbox_sync_states 保存同步进度
```

验收：

```text
服务重启后不会重复处理旧邮件。
新邮件可以持续入库。
同一封邮件不会重复创建询盘。
```

---

**阶段 4：结构化事实模块**

目标：把 AI 每次提取的参数沉淀到 `inquiry_structured_facts`。

模块建议：

```text
apps/backend/src/modules/inquiry/application/ports/inquiry-structured-facts.repository.ts
apps/backend/src/modules/inquiry/application/use-cases/update-inquiry-structured-facts.use-case.ts
apps/backend/src/modules/inquiry/infrastructure/repositories/prisma-inquiry-structured-facts.repository.ts
```

小点：

```text
1. 定义 InquiryStructuredFacts domain entity
2. 定义 repository port
3. 实现 Prisma repository
4. AI 分析成功后合并 extractedRequirements
5. 更新 missingFields / confirmedFields / sourceEmailMessageIds
6. 遇到冲突写入 uncertainFields，不直接覆盖
```

验收：

```text
第一次邮件只提取 productType。
第二次补参数后 facts 被合并。
第三次补 connector/application 后 facts 完整。
```

---

**阶段 5：AI Decision 持久化**

目标：每次 AI 判断都落库，作为审计记录。

模块建议：

```text
apps/backend/src/modules/email/application/ports/ai-decision.repository.ts
apps/backend/src/modules/email/infrastructure/repositories/prisma-ai-decision.repository.ts
```

小点：

```text
1. 成功分析写入 ai_decisions
2. schema 校验失败也写入失败记录
3. 保存 rawResult / errorCode / errorMessage
4. 保存 suggestedStatus，但不自动执行
```

验收：

```text
每封被 AI 分析过的邮件都有 ai_decisions 记录。
失败也有记录。
```

---

**阶段 6：Reply Draft 回复草稿模块**

目标：AI 不直接发邮件，但可以生成待审核回复草稿。

模块建议：

```text
apps/backend/src/modules/reply/domain/entities/reply-draft.entity.ts
apps/backend/src/modules/reply/application/ports/reply-draft.repository.ts
apps/backend/src/modules/reply/application/use-cases/create-reply-draft.use-case.ts
apps/backend/src/modules/reply/infrastructure/repositories/prisma-reply-draft.repository.ts
```

小点：

```text
1. 根据 AI 分析结果生成 reply_drafts
2. 缺参数时生成 clarification_request
3. 参数完整时生成 engineer_review_notice
4. 无效询盘生成 invalid_notice
5. 草稿状态为 pending_review
6. 不自动发送
```

验收：

```text
客户询盘缺参数 -> 生成澄清草稿。
客户补齐参数 -> 生成研发确认通知草稿。
广告邮件 -> 可生成不处理或 invalid_notice 草稿。
```

---

**阶段 7：Outbound 邮件入库与草稿关联**

目标：管理人员手动发送邮件并抄送 AI 邮箱后，系统能识别为我方回复。

小点：

```text
1. 识别 from_email 是否属于我方邮箱
2. 将邮件 direction 标记为 outbound
3. 匹配原 inquiry_case
4. 写入 email_messages
5. 写入 inquiry_messages
6. 如果内容匹配 pending reply_draft，则更新为 sent_manually
7. 状态推进到 waiting_customer
```

验收：

```text
管理发送邮件并抄送 AI 邮箱后，系统能把这封邮件纳入上下文。
reply_drafts.sentEmailMessageId 被填充。
询盘状态进入 waiting_customer。
```

---

**阶段 8：状态变更日志**

目标：所有状态变化都有记录。

小点：

```text
1. 实现 inquiry_status_logs repository
2. 状态机 transition 成功后写日志
3. 记录 fromStatus / toStatus / reason / changedByType
4. AI 建议不写状态日志，只有真实状态变化才写
```

验收：

```text
new -> waiting_customer 有日志。
waiting_customer -> need_engineer_review 有日志。
need_engineer_review -> ready_for_quote 有日志。
```

---

**阶段 9：Context Manager 增强**

目标：让 AI 上下文从“邮件窗口拼接”升级为“结构化上下文”。

顺序：

```text
1. 将 inquiry_structured_facts 加入上下文
2. 将最近 outbound 邮件加入上下文
3. 将 reply_drafts 状态加入上下文
4. 执行 token budget 分区裁剪
5. 加入滚动摘要 inquiry_context_summaries
```

验收：

```text
AI 能看到当前已确认参数。
AI 能看到我方最近回复。
AI 能避免重复询问已经确认过的字段。
```

---

**阶段 10：初始化历史邮箱映射**

目标：运行一条命令，把邮箱历史邮件归纳入库。

小点：

```text
1. 新增 init-mailbox 命令
2. 扫描历史邮件
3. 按 UID / Message-ID 去重
4. 解析客户
5. 解析线程
6. 创建或匹配询盘
7. 提取结构化事实
8. 生成上下文快照和 AI 判断记录
```

验收：

```text
已有历史邮件可以一次性入库。
客户、线程、询盘、邮件关系完整。
重复运行不会重复建数据。
```

---

**推荐下一步**

最合理的下一步是：

```text
阶段 1：DatabaseModule 基础接入
```

因为后面的所有 Prisma Repository 都依赖它。

在这之前你需要先安装：

```bash
pnpm --filter @email-inquiry/backend add @prisma/adapter-pg
```

装完后，我就可以继续实现：

```text
PrismaService
DatabaseModule
数据库健康检查
```

然后进入 Repository 持久化迁移。