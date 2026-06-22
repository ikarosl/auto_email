# 项目目录结构规划

## 1. 文件定位

本文档用于规划邮件询盘自动处理系统当前阶段的项目目录结构。

当前阶段目标：

```text
不做前端。
不做 RAG。
不做 AI 自动回复。
不做报价。
不做研发评审。
重点完成：
1. 后端项目骨架
2. 询盘状态机
3. 邮件接收入口
4. 邮件转询盘的基础流程
5. 可选的数据持久化接口
```

本阶段核心不是把系统做完整，而是先搭好后端骨架，让后续模块能稳稳接上。

---

# 2. 当前阶段建设原则

## 2.1 状态机优先

询盘状态机是当前阶段最重要的模块。

状态机必须：

* 独立于数据库
* 独立于邮件服务
* 独立于 AI
* 独立于前端
* 可以单独写单元测试
* 不依赖 NestJS Controller
* 不依赖第三方邮件服务

也就是说，状态机应该是纯业务逻辑。

---

## 2.2 邮件接收可替换

第一版邮件接收不要绑死某一个邮箱服务。

可以先支持：

```text
POST /webhooks/email/inbound
```

用于模拟或接收外部邮件服务推送。

后续再接：

* Gmail API
* Outlook API
* IMAP
* Mailgun
* SendGrid Inbound Parse
* 企业邮箱 webhook

邮件接收模块只负责把外部邮件转换成系统内部统一格式。

---

## 2.3 数据库存储可选

当前阶段邮件是否入库都可以。

但代码结构上必须提前留好 Repository 接口。

第一版可以用：

```text
InMemoryInquiryRepository
InMemoryEmailMessageRepository
```

后续再替换为：

```text
MySqlInquiryRepository
MySqlEmailMessageRepository
```

这样不会因为后面接数据库而重写业务逻辑。

---

## 2.4 不做前端

当前阶段不建设 Vue 管理后台。

验证方式使用：

* curl
* Postman
* Swagger
* 单元测试
* 简单日志

---

# 3. 推荐项目结构

如果当前项目是 NestJS 后端，推荐结构如下：

```text
email-inquiry-system/
├── docs/
│   ├── 01-business-flow.md
│   ├── 02-implementation-plan.md
│   ├── 03-data-model.md
│   ├── 04-status-rules.md
│   ├── 05-ai-rules.md
│   ├── 06-current-task.md
│   └── 07-project-structure.md
│
├── apps/
│   └── api/
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   │
│       │   ├── config/
│       │   │   ├── app.config.ts
│       │   │   ├── mail.config.ts
│       │   │   └── database.config.ts
│       │   │
│       │   ├── common/
│       │   │   ├── errors/
│       │   │   │   ├── business-error.ts
│       │   │   │   └── invalid-transition.error.ts
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── guards/
│       │   │   ├── interceptors/
│       │   │   └── utils/
│       │   │
│       │   ├── modules/
│       │   │   ├── inquiry/
│       │   │   │   ├── inquiry.module.ts
│       │   │   │   │
│       │   │   │   ├── domain/
│       │   │   │   │   ├── entities/
│       │   │   │   │   │   └── inquiry-case.entity.ts
│       │   │   │   │   ├── enums/
│       │   │   │   │   │   ├── inquiry-status.enum.ts
│       │   │   │   │   │   ├── inquiry-event.enum.ts
│       │   │   │   │   │   └── inquiry-priority.enum.ts
│       │   │   │   │   ├── state-machine/
│       │   │   │   │   │   ├── inquiry-state-machine.ts
│       │   │   │   │   │   ├── inquiry-transitions.ts
│       │   │   │   │   │   ├── inquiry-transition.guard.ts
│       │   │   │   │   │   └── inquiry-state-machine.spec.ts
│       │   │   │   │   └── events/
│       │   │   │   │       └── inquiry-status-changed.event.ts
│       │   │   │   │
│       │   │   │   ├── application/
│       │   │   │   │   ├── use-cases/
│       │   │   │   │   │   ├── create-inquiry.use-case.ts
│       │   │   │   │   │   ├── create-inquiry-from-email.use-case.ts
│       │   │   │   │   │   ├── transition-inquiry-status.use-case.ts
│       │   │   │   │   │   ├── get-inquiry.use-case.ts
│       │   │   │   │   │   └── list-inquiries.use-case.ts
│       │   │   │   │   ├── ports/
│       │   │   │   │   │   ├── inquiry.repository.ts
│       │   │   │   │   │   └── inquiry-status-log.repository.ts
│       │   │   │   │   └── dto/
│       │   │   │   │       ├── create-inquiry.dto.ts
│       │   │   │   │       ├── transition-inquiry-status.dto.ts
│       │   │   │   │       └── inquiry-response.dto.ts
│       │   │   │   │
│       │   │   │   ├── infrastructure/
│       │   │   │   │   ├── repositories/
│       │   │   │   │   │   ├── in-memory-inquiry.repository.ts
│       │   │   │   │   │   └── in-memory-inquiry-status-log.repository.ts
│       │   │   │   │   └── mappers/
│       │   │   │   │       └── inquiry.mapper.ts
│       │   │   │   │
│       │   │   │   └── presentation/
│       │   │   │       └── inquiry.controller.ts
│       │   │   │
│       │   │   ├── email/
│       │   │   │   ├── email.module.ts
│       │   │   │   │
│       │   │   │   ├── domain/
│       │   │   │   │   ├── entities/
│       │   │   │   │   │   └── email-message.entity.ts
│       │   │   │   │   ├── value-objects/
│       │   │   │   │   │   └── inbound-email.vo.ts
│       │   │   │   │   └── enums/
│       │   │   │   │       ├── email-source.enum.ts
│       │   │   │   │       └── email-direction.enum.ts
│       │   │   │   │
│       │   │   │   ├── application/
│       │   │   │   │   ├── use-cases/
│       │   │   │   │   │   ├── receive-inbound-email.use-case.ts
│       │   │   │   │   │   ├── normalize-inbound-email.use-case.ts
│       │   │   │   │   │   └── get-email-message.use-case.ts
│       │   │   │   │   ├── ports/
│       │   │   │   │   │   └── email-message.repository.ts
│       │   │   │   │   └── dto/
│       │   │   │   │       ├── inbound-email-webhook.dto.ts
│       │   │   │   │       └── email-message-response.dto.ts
│       │   │   │   │
│       │   │   │   ├── infrastructure/
│       │   │   │   │   ├── repositories/
│       │   │   │   │   │   └── in-memory-email-message.repository.ts
│       │   │   │   │   └── adapters/
│       │   │   │   │       ├── generic-email-webhook.adapter.ts
│       │   │   │   │       └── mock-email.adapter.ts
│       │   │   │   │
│       │   │   │   └── presentation/
│       │   │   │       └── email-webhook.controller.ts
│       │   │   │
│       │   │   └── health/
│       │   │       ├── health.module.ts
│       │   │       └── health.controller.ts
│       │   │
│       │   └── test/
│       │       ├── inquiry-state-machine.e2e-spec.ts
│       │       └── email-inbound.e2e-spec.ts
│       │
│       ├── package.json
│       ├── tsconfig.json
│       └── nest-cli.json
│
├── packages/
│   └── shared/
│       └── src/
│           ├── types/
│           └── constants/
│
├── scripts/
│   ├── send-mock-email.http
│   └── transition-inquiry.http
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 4. 当前阶段最重要的模块

## 4.1 inquiry 模块

`inquiry` 是当前阶段的核心模块。

它负责：

* 创建询盘
* 查询询盘
* 修改询盘状态
* 校验状态流转是否合法
* 记录状态变化
* 提供状态机能力

当前阶段不负责：

* 报价
* 研发评审
* AI 回复
* RAG
* 前端展示

---

## 4.2 email 模块

`email` 模块负责接收邮件。

当前阶段只需要做到：

* 接收外部传入的邮件数据
* 统一转换为内部邮件格式
* 可选保存邮件
* 可选根据邮件创建询盘
* 返回处理结果

当前阶段不需要做到：

* 自动登录 Gmail
* 自动拉取 Outlook
* 复杂 IMAP 同步
* 附件深度解析
* 邮件发送
* 邮件回复

---

## 4.3 状态机模块

状态机建议放在：

```text
apps/api/src/modules/inquiry/domain/state-machine/
```

不要放在 controller 里。

不要放在 repository 里。

不要放在 database entity 里。

状态机应该只处理一件事：

```text
给定当前状态和目标状态，判断是否允许流转。
```

---

# 5. 状态机设计

## 5.1 第一版状态枚举

第一版只使用简化状态：

```text
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed
```

对应文件：

```text
apps/api/src/modules/inquiry/domain/enums/inquiry-status.enum.ts
```

示例：

```ts
export enum InquiryStatus {
  NEW = 'new',
  INVALID = 'invalid',
  NEED_CLARIFICATION = 'need_clarification',
  NEED_ENGINEER_REVIEW = 'need_engineer_review',
  WAITING_CUSTOMER = 'waiting_customer',
  READY_FOR_QUOTE = 'ready_for_quote',
  CLOSED = 'closed',
}
```

---

## 5.2 第一版状态流转

第一版推荐允许：

```text
new
  → invalid
  → need_clarification
  → need_engineer_review
  → closed

need_clarification
  → waiting_customer
  → need_engineer_review
  → closed

waiting_customer
  → need_clarification
  → need_engineer_review
  → ready_for_quote
  → closed

need_engineer_review
  → need_clarification
  → waiting_customer
  → ready_for_quote
  → closed

ready_for_quote
  → closed

closed
  不允许自动流转
```

注意：

```text
ready_for_quote 是 AI 停止接手的边界。
closed 默认不允许自动恢复。
```

---

## 5.3 状态机文件职责

### inquiry-status.enum.ts

定义状态枚举。

### inquiry-event.enum.ts

定义业务事件。

例如：

```text
MARK_INVALID
REQUEST_CLARIFICATION
SUBMIT_ENGINEER_REVIEW
WAIT_CUSTOMER
MARK_READY_FOR_QUOTE
CLOSE
```

### inquiry-transitions.ts

定义允许流转表。

### inquiry-transition.guard.ts

定义特殊规则。

例如：

* 进入 `invalid` 必须提供原因
* 进入 `closed` 必须提供原因
* 进入 `ready_for_quote` 必须人工操作
* `closed` 不允许系统自动恢复

### inquiry-state-machine.ts

暴露核心方法：

```ts
canTransition(from, to, context)
transition(from, to, context)
getAllowedNextStatuses(from, context)
```

---

# 6. 邮件接收设计

## 6.1 第一版接收方式

第一版先做通用 webhook：

```text
POST /webhooks/email/inbound
```

请求示例：

```json
{
  "messageId": "mock-message-001",
  "threadId": "mock-thread-001",
  "fromEmail": "buyer@example.com",
  "fromName": "John Smith",
  "toEmails": ["sales@company.com"],
  "ccEmails": [],
  "subject": "Inquiry for 12-15GHz microstrip circulator",
  "bodyText": "We need a 12-15GHz microstrip circulator, small size, 10 pcs.",
  "bodyHtml": null,
  "receivedAt": "2026-06-22T10:00:00.000Z",
  "source": "mock"
}
```

返回示例：

```json
{
  "success": true,
  "emailMessageId": "email_001",
  "inquiryCaseId": "inquiry_001",
  "inquiryStatus": "new"
}
```

---

## 6.2 邮件是否入库

当前阶段可以有两种模式。

### 模式 A：不接数据库

使用内存保存。

适合：

* 快速验证状态机
* 快速验证邮件接收
* 写单元测试
* 写接口测试

缺点：

* 重启后数据丢失

### 模式 B：接数据库

保存到：

```text
email_messages
inquiry_cases
inquiry_messages
```

适合：

* 需要真实留痕
* 需要后续接 AI
* 需要后续接后台

建议：

```text
第一版可以先用内存 Repository。
但目录结构必须保留 Repository 接口，方便后续替换成 MySQL。
```

---

# 7. 当前阶段推荐接口

## 7.1 健康检查

```text
GET /health
```

作用：

```text
检查服务是否启动。
```

---

## 7.2 接收邮件

```text
POST /webhooks/email/inbound
```

作用：

```text
接收一封外部邮件。
```

当前处理逻辑：

```text
接收邮件
↓
标准化邮件字段
↓
保存邮件，或暂存内存
↓
创建询盘
↓
询盘状态为 new
↓
返回 emailMessageId 和 inquiryCaseId
```

---

## 7.3 创建询盘

```text
POST /inquiries
```

作用：

```text
手动创建询盘。
```

---

## 7.4 查询询盘详情

```text
GET /inquiries/:id
```

---

## 7.5 查询询盘列表

```text
GET /inquiries
```

---

## 7.6 修改询盘状态

```text
POST /inquiries/:id/transitions
```

请求示例：

```json
{
  "toStatus": "need_clarification",
  "reason": "Customer did not provide power, isolation, VSWR and size requirements.",
  "operatorType": "human"
}
```

返回示例：

```json
{
  "success": true,
  "inquiryCaseId": "inquiry_001",
  "fromStatus": "new",
  "toStatus": "need_clarification"
}
```

---

## 7.7 查看允许的下一状态

```text
GET /inquiries/:id/allowed-transitions
```

返回示例：

```json
{
  "currentStatus": "new",
  "allowedNextStatuses": [
    "invalid",
    "need_clarification",
    "need_engineer_review",
    "closed"
  ]
}
```

---

# 8. 当前阶段不要建设的目录

当前阶段不要创建这些复杂目录：

```text
modules/ai/
modules/rag/
modules/quote/
modules/engineer-review/
modules/product-knowledge/
modules/reply-template/
modules/frontend/
```

这些后续再加。

否则第一版会失焦。

---

# 9. 最小可运行闭环

当前阶段最小闭环如下：

```text
启动后端服务
↓
POST 一封模拟邮件到 /webhooks/email/inbound
↓
系统接收邮件
↓
系统创建 inquiry_case
↓
inquiry_case 初始状态为 new
↓
调用 /inquiries/:id/allowed-transitions 查看可流转状态
↓
调用 /inquiries/:id/transitions 修改状态
↓
状态机校验是否合法
↓
合法则更新状态
↓
非法则返回错误
```

---

# 10. 当前阶段验收标准

完成后应满足：

```text
1. 后端服务可以启动。
2. 可以通过接口接收一封模拟邮件。
3. 系统可以根据邮件创建一条询盘。
4. 新询盘默认状态为 new。
5. 可以查询询盘详情。
6. 可以查询询盘列表。
7. 可以查看某个询盘允许流转到哪些状态。
8. 可以执行合法状态流转。
9. 非法状态流转会被拒绝。
10. 进入 invalid 或 closed 时必须提供 reason。
11. ready_for_quote 不能由 system 或 ai 自动进入，只能 human 操作。
12. closed 状态默认不可自动恢复。
13. 状态机有单元测试。
14. 邮件接收有基础接口测试。
15. 不包含前端代码。
16. 不包含 AI、RAG、报价、研发评审代码。
```

---

# 11. 推荐开发顺序

当前阶段建议按以下顺序开发：

```text
1. 初始化后端项目结构
2. 创建 inquiry 模块
3. 定义 InquiryStatus 枚举
4. 定义状态流转表
5. 实现 InquiryStateMachine
6. 编写状态机单元测试
7. 创建 InquiryCase 实体
8. 创建 InquiryRepository 接口
9. 实现 InMemoryInquiryRepository
10. 实现 CreateInquiryUseCase
11. 实现 TransitionInquiryStatusUseCase
12. 创建 InquiryController
13. 创建 email 模块
14. 定义 InboundEmail 输入 DTO
15. 实现 ReceiveInboundEmailUseCase
16. 实现 InMemoryEmailMessageRepository
17. 实现 EmailWebhookController
18. 写接口测试或 HTTP 测试文件
19. 补充 README 验证步骤
```

---

# 12. 给 AI 写代码时的任务边界

让 AI 写代码时应明确：

```text
本次只实现后端。
本次不做前端。
本次不做数据库也可以，优先用 InMemory Repository。
本次重点是状态机、邮件接收、邮件创建询盘。
本次不实现 AI 分类。
本次不实现 RAG。
本次不实现回复草稿。
本次不实现报价。
本次不实现研发评审。
```

---

# 13. 当前任务推荐描述

可以把 `docs/06-current-task.md` 调整为：

```text
本次开发任务：实现后端基础骨架、询盘状态机和邮件接收入口。

目标：
不做前端，不做 AI，不做 RAG，不做报价，不做研发评审。
先完成一个可运行的后端闭环：接收邮件 → 创建询盘 → 状态机管理询盘状态。

本次必须实现：
1. inquiry 模块
2. inquiry 状态机
3. email 模块
4. 通用邮件接收 webhook
5. 邮件创建询盘 use case
6. in-memory repository
7. 状态流转接口
8. 状态机单元测试

本次可以暂不实现：
1. MySQL 持久化
2. 邮件附件解析
3. AI 参数提取
4. AI 回复草稿
5. 前端页面
6. RAG
7. 报价流程
8. 研发评审

验收：
1. 可以 POST 一封模拟邮件。
2. 系统返回 emailMessageId 和 inquiryCaseId。
3. 新询盘状态为 new。
4. 可以查询询盘。
5. 可以修改询盘状态。
6. 非法状态流转会报错。
7. ready_for_quote 只能由 human 操作进入。
8. closed 状态默认不可自动恢复。
```

---

# 14. 总结

当前阶段项目目录应围绕三个核心建设：

```text
inquiry：询盘与状态机
email：邮件接收与标准化
common：通用错误、配置、工具
```

第一版不要把系统做大。

最小闭环是：

```text
收到邮件 → 创建询盘 → 状态机流转
```

这条线跑通后，再接数据库、AI、RAG、草稿、研发评审和报价交接。

当前阶段最重要的一句话：

```text
状态机是骨架，邮件接收是入口，数据库只是容器。
```
