# 数据库持久化方案

## 1. 当前结论

当前阶段采用 PostgreSQL 作为主数据库，先用 SQL 迁移文件完成建表，再逐步接入 NestJS Repository 与 Prisma。

推荐版本：

```text
PostgreSQL: 18.4
ORM: Prisma 7.x
Node package:
  prisma@7.x
  @prisma/client@7.x
```

本阶段数据库连接：

```text
host: localhost
port: 5432
user: postgres
password: 123456
database: email_inquiry
schema: public
```

连接串：

```text
postgresql://postgres:123456@localhost:5432/email_inquiry?schema=public
```

## 2. 设计原则

邮件线程属于通信层，询盘属于业务层。不要把关系设计成：

```text
customer -> inquiry_case -> email_message -> thread
```

当前采用：

```text
customers
  -> inquiry_cases

email_threads
  -> email_messages

inquiry_cases
  -> inquiry_messages
      -> email_messages
```

这样可以支持：

```text
1. 一个客户有多个询盘。
2. 一个询盘包含多封邮件。
3. 一个询盘跨多个邮件线程。
4. 一个邮件线程混入多个产品需求。
5. 一封邮件拆分为多个询盘。
6. 入站邮件和我方出站邮件都进入上下文。
```

AI 的角色边界：

```text
AI 可以分析邮件。
AI 可以提取结构化事实。
AI 可以生成回复草稿。
AI 不直接发送邮件。
AI 不直接修改询盘状态。
```

## 3. 第一阶段核心表

```text
mailbox_accounts
mailbox_sync_states
customers
email_threads
email_messages
inquiry_cases
inquiry_messages
processed_emails
ai_decisions
inquiry_structured_facts
reply_drafts
ai_context_snapshots
inquiry_status_logs
```

### 3.1 mailbox_accounts

保存系统监听的邮箱账号。

| 字段 | 说明 |
| --- | --- |
| id | 主键，文本 ID |
| email_address | 邮箱地址 |
| provider | 邮箱服务商 |
| imap_host | IMAP 地址 |
| imap_port | IMAP 端口 |
| imap_secure | 是否 SSL |
| status | active / disabled |

### 3.2 mailbox_sync_states

保存 IMAP 同步进度。IMAP UID 只在同一 mailbox 与 uid_validity 下可靠。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| mailbox_account_id | 邮箱账号 |
| mailbox_name | INBOX 等 |
| uid_validity | IMAP UIDVALIDITY |
| last_seen_uid | 已看到的最大 UID |
| last_processed_uid | 已处理的最大 UID |

### 3.3 customers

保存客户基础信息。第一版按邮箱自动创建客户。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| email | 客户邮箱 |
| name | 联系人名称 |
| domain | 邮箱域名 |
| source | email / manual |

### 3.4 email_threads

保存邮件通信线程。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| mailbox_account_id | 邮箱账号 |
| thread_key | 系统计算的线程 key |
| subject_normalized | 归一化主题 |
| latest_message_at | 最新邮件时间 |

线程解析优先级：

```text
1. 外部服务商提供的 thread id。
2. In-Reply-To 命中已知邮件。
3. References 命中已知邮件。
4. 主题归一化 + 客户邮箱 + 时间窗口辅助匹配。
5. 无法命中则创建新线程。
```

### 3.5 email_messages

保存所有入站与出站邮件。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| mailbox_account_id | 邮箱账号 |
| email_thread_id | 邮件线程 |
| direction | inbound / outbound |
| mailbox_name | 邮箱文件夹 |
| uid_validity | IMAP UIDVALIDITY |
| uid | IMAP UID |
| message_id | 邮件 Message-ID |
| in_reply_to | 邮件 In-Reply-To |
| references_json | References |
| from_email | 发件人邮箱 |
| from_name | 发件人名称 |
| to_emails | 收件人数组 |
| cc_emails | 抄送数组 |
| subject | 原始主题 |
| body_text | 清洗后的正文 |
| body_html | 原始 HTML 正文 |
| raw_source | 原始邮件源，可按环境决定是否保存 |
| received_at | 收件或发件时间 |
| source | imap / webhook / manual |

### 3.6 inquiry_cases

保存业务询盘。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| customer_id | 客户 |
| status | new / invalid / need_clarification / need_engineer_review / waiting_customer / ready_for_quote / closed |
| subject | 询盘主题 |
| product_type | 产品类型快照 |
| latest_message_at | 最新关联邮件时间 |
| closed_at | 关闭时间 |

### 3.7 inquiry_messages

关联询盘与邮件。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| inquiry_case_id | 询盘 |
| email_message_id | 邮件 |
| relation_type | original / reply / related_context / manual_link |
| direction | inbound / outbound |

### 3.8 processed_emails

保存已处理邮件的幂等记录。

唯一约束：

```text
(mailbox_account_id, mailbox_name, uid_validity, uid)
```

这样可以避免服务重启后重复处理同一封邮件。

### 3.9 ai_decisions

保存 AI 对单次邮件的判断。它是审计记录，不是当前事实。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| email_message_id | 当前分析邮件 |
| inquiry_case_id | 所属询盘 |
| classification | valid_inquiry / invalid / unrelated_product / commercial / unknown |
| suggested_status | AI 建议状态 |
| confidence | 置信度 |
| risk_level | low / medium / high |
| missing_fields | 缺失字段 |
| extracted_requirements | 本次提取参数 |
| raw_result | AI 原始输出 |
| model_name | 模型 |

### 3.10 inquiry_structured_facts

保存当前询盘已沉淀的结构化事实。

这是后续上下文、研发评审、报价交接最重要的数据来源。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| inquiry_case_id | 唯一关联询盘 |
| product_type | 产品类型 |
| structure_type | 结构类型 |
| frequency_range | 频率 |
| power | 功率 |
| insertion_loss | 插损 |
| isolation | 隔离度 |
| vswr | 驻波 |
| connector | 连接器 |
| size_requirement | 尺寸要求 |
| quantity | 数量 |
| application | 应用 |
| delivery_requirement | 交期要求 |
| special_requirements | 其他要求 |
| missing_fields | 当前仍缺失字段 |
| confirmed_fields | 已确认字段 |
| uncertain_fields | 冲突或待确认字段 |
| source_email_message_ids | 参数来源邮件 |
| confidence | 当前事实置信度 |
| updated_from_email_message_id | 最近一次更新来源 |

规则：

```text
ai_decisions 记录单次判断。
inquiry_structured_facts 记录当前稳定事实。
新邮件进入后，先生成 ai_decisions，再合并 inquiry_structured_facts。
如果新旧信息冲突，不直接覆盖，进入 uncertain_fields 或人工确认。
```

### 3.11 reply_drafts

保存 AI 或系统生成的回复草稿。

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| inquiry_case_id | 询盘 |
| source_email_message_id | 草稿来源邮件 |
| sent_email_message_id | 管理人员实际发送后对应的 outbound 邮件 |
| draft_type | clarification_request / engineer_review_notice / quote_handoff_notice / invalid_notice |
| status | pending_review / approved / rejected / sent_manually / expired |
| subject | 回复主题 |
| body_text | 草稿正文 |

当前阶段真实发送方式：

```text
管理人员手动发送邮件，并抄送 AI 邮箱。
系统通过 IMAP 读取该抄送邮件，将其作为 outbound email_messages 入库。
系统再把 outbound 邮件和 reply_drafts.sent_email_message_id 关联。
```

### 3.12 ai_context_snapshots

保存每次发送给 AI 的上下文快照，便于调试和追溯。

### 3.13 inquiry_status_logs

保存询盘状态变化日志。

## 4. 场景模拟

### 4.1 首次客户询盘，参数不完整

客户邮件：

```text
We need an RF circulator. Please check.
```

email_messages

| id | direction | from_email | subject | body_text |
| --- | --- | --- | --- | --- |
| email_1 | inbound | buyer@example.com | RF circulator inquiry | We need an RF circulator. Please check. |

inquiry_cases

| id | customer_id | status | product_type |
| --- | --- | --- | --- |
| inquiry_1 | customer_1 | new | RF circulator |

ai_decisions

| id | email_message_id | inquiry_case_id | suggested_status | missing_fields |
| --- | --- | --- | --- | --- |
| decision_1 | email_1 | inquiry_1 | need_clarification | frequencyRange,power,quantity,application |

inquiry_structured_facts

| id | inquiry_case_id | product_type | frequency_range | power | quantity | application | missing_fields | source_email_message_ids |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| facts_1 | inquiry_1 | RF circulator | null | null | null | null | frequencyRange,power,quantity,application | email_1 |

reply_drafts

| id | inquiry_case_id | source_email_message_id | status | draft_type | body_text |
| --- | --- | --- | --- | --- | --- |
| draft_1 | inquiry_1 | email_1 | pending_review | clarification_request | Please confirm frequency range, power, quantity and application. |

### 4.2 管理人员发送澄清邮件并抄送 AI 邮箱

email_messages

| id | direction | from_email | to_emails | cc_emails | body_text |
| --- | --- | --- | --- | --- | --- |
| email_2 | outbound | manager@hzbeat.com | buyer@example.com | ai@hzbeat.com | Please confirm frequency range, power, quantity and application. |

reply_drafts

| id | status | sent_email_message_id |
| --- | --- | --- |
| draft_1 | sent_manually | email_2 |

inquiry_cases

| id | status |
| --- | --- |
| inquiry_1 | waiting_customer |

### 4.3 客户补充核心参数

客户邮件：

```text
Frequency 12-15GHz, power 20W CW, quantity 50 pcs.
```

ai_decisions

| id | email_message_id | inquiry_case_id | suggested_status | extracted_requirements | missing_fields |
| --- | --- | --- | --- | --- | --- |
| decision_2 | email_3 | inquiry_1 | need_clarification | frequencyRange=12-15GHz,power=20W CW,quantity=50 pcs | application,connector,sizeRequirement |

inquiry_structured_facts

| id | inquiry_case_id | product_type | frequency_range | power | quantity | connector | size_requirement | application | missing_fields | source_email_message_ids |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| facts_1 | inquiry_1 | RF circulator | 12-15GHz | 20W CW | 50 pcs | null | null | null | application,connector,sizeRequirement | email_1,email_3 |

reply_drafts

| id | inquiry_case_id | source_email_message_id | status | draft_type | body_text |
| --- | --- | --- | --- | --- | --- |
| draft_2 | inquiry_1 | email_3 | pending_review | clarification_request | Please confirm connector type, size requirement and application. |

### 4.4 客户补全剩余参数

客户邮件：

```text
SMA female connector, size below 20mm, application UAV data link.
```

inquiry_structured_facts

| id | inquiry_case_id | product_type | frequency_range | power | quantity | connector | size_requirement | application | missing_fields | source_email_message_ids |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| facts_1 | inquiry_1 | RF circulator | 12-15GHz | 20W CW | 50 pcs | SMA female | below 20mm | UAV data link |  | email_1,email_3,email_5 |

inquiry_cases

| id | status |
| --- | --- |
| inquiry_1 | need_engineer_review |

reply_drafts

| id | inquiry_case_id | source_email_message_id | status | draft_type | body_text |
| --- | --- | --- | --- | --- | --- |
| draft_3 | inquiry_1 | email_5 | pending_review | engineer_review_notice | Thank you. We have received the complete requirements and will check feasibility with our engineering team. |

### 4.5 研发确认后进入报价准备

inquiry_cases

| id | status |
| --- | --- |
| inquiry_1 | ready_for_quote |

inquiry_status_logs

| id | inquiry_case_id | from_status | to_status | changed_by_type | reason |
| --- | --- | --- | --- | --- | --- |
| status_log_1 | inquiry_1 | need_engineer_review | ready_for_quote | human | engineer confirmed feasibility and parameters are complete |

### 4.6 同一邮件提到另一个产品

客户邮件：

```text
Also, we need a 12-15GHz isolator, quantity 100 pcs.
```

inquiry_cases

| id | customer_id | status | product_type |
| --- | --- | --- | --- |
| inquiry_1 | customer_1 | ready_for_quote | RF circulator |
| inquiry_2 | customer_1 | new | RF isolator |

inquiry_messages

| id | inquiry_case_id | email_message_id | relation_type |
| --- | --- | --- | --- |
| inquiry_message_1 | inquiry_1 | email_6 | related_context |
| inquiry_message_2 | inquiry_2 | email_6 | original |

inquiry_structured_facts

| id | inquiry_case_id | product_type | frequency_range | power | quantity | connector | application | missing_fields | source_email_message_ids |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| facts_1 | inquiry_1 | RF circulator | 12-15GHz | 20W CW | 50 pcs | SMA female | UAV data link |  | email_1,email_3,email_5 |
| facts_2 | inquiry_2 | RF isolator | 12-15GHz | null | 100 pcs | null | null | power,connector,application | email_6 |

reply_drafts

| id | inquiry_case_id | source_email_message_id | status | draft_type | body_text |
| --- | --- | --- | --- | --- | --- |
| draft_4 | inquiry_2 | email_6 | pending_review | clarification_request | Please confirm power, connector type and application for the RF isolator. |

## 5. 实施顺序

```text
1. 创建数据库 email_inquiry。
2. 执行 SQL 迁移文件。
3. 添加 Prisma schema，使模型与 SQL 表保持一致。
4. 实现 Prisma repositories。
5. 将 EmailModule / InquiryModule / ContextModule 的生产 DI 切换到 Prisma repository。
6. 将 demo:poll-inbox 改成通过 Nest ApplicationContext 使用真实 DI。
7. 保留 InMemory repository 用于单元测试。
```

## 6. 2026-07-01 持久化联调修正

### 6.1 邮件线程字段分离

运行联调时发现，不能把邮件头里的线程线索直接写入 `email_messages.email_thread_id`。

字段语义必须分开：

```text
externalThreadId / threadId
来自邮件头，例如 In-Reply-To、References 或服务商 thread id。
它只是外部线程线索，不是数据库主键。

emailThreadId
数据库 email_threads.id。
email_messages.email_thread_id 必须写这个值。
```

后端领域对象当前采用：

```ts
interface EmailMessage {
  threadId?: string;      // 外部邮件线程线索
  emailThreadId?: string; // 数据库 email_threads.id
}
```

入库规则：

```text
1. 收到邮件后，先读取 messageId / In-Reply-To / References。
2. 如果 In-Reply-To 或 References 命中已有 email_messages.message_id，则复用该邮件的 email_thread_id。
3. 如果无法命中，则按 mailbox_account_id + thread_key 创建或复用 email_threads。
4. 保存 email_messages 时，只能把 email_threads.id 写入 email_messages.email_thread_id。
5. 询盘匹配优先使用 emailThreadId；内存测试环境可继续兼容旧 threadId。
```

原因：

```text
email_messages.email_thread_id 是外键，必须引用 email_threads.id。
外部邮件头字段不是数据库 ID，直接写入会触发外键错误。
```

### 6.2 IMAP 自动轮询安全开关

API 服务启动时默认不应自动连接真实邮箱。

新增配置：

```text
IMAP_POLL_ENABLED=false
```

规则：

```text
1. HTTP API 默认只启动接口和数据库连接。
2. 只有 IMAP_POLL_ENABLED=true 时，ImapPollService 才随 NestJS 生命周期自动启动。
3. demo:poll-inbox 命令不受此开关限制，它是显式轮询命令。
```

原因：

```text
开发或联调 API 时，如果 .env 中存在真实 IMAP 配置，自动轮询可能误处理真实邮件。
轮询邮箱必须是显式行为。
```

### 6.3 ProcessedEmailIdentity 幂等字段

`processed_emails` 的真实唯一键是：

```text
mailbox_account_id + mailbox_name + uid_validity + uid
```

因此应用层 identity 也必须携带这些字段：

```ts
interface ProcessedEmailIdentity {
  mailboxAccountId?: string;
  mailbox: string;
  uidValidity?: bigint;
  uid?: number;
  messageId?: string;
}
```

规则：

```text
1. IMAP 调度层负责解析 mailboxAccountId。
2. IMAP 调度层尽量读取 UIDVALIDITY 并传入 tracker。
3. PrismaProcessedEmailTracker 不应自行猜测邮箱账号。
4. 如果 uidValidity 暂时不可得，第一版允许 fallback 为 0，但后续应优先使用真实 UIDVALIDITY。
```

原因：

```text
IMAP UID 只在同一邮箱账号、同一 mailbox、同一 UIDVALIDITY 下可靠。
如果只用 mailbox + uid，会在多邮箱或 UIDVALIDITY 变化时误判重复。
```

### 6.4 默认启动配置

`.env.example` 当前推荐：

```text
API_PORT=3000
IMAP_POLL_ENABLED=false
IMAP_POLL_BOOTSTRAP_MODE=mark_existing_seen
```

含义：

```text
API_PORT=3000
保持 API 默认端口稳定。

IMAP_POLL_ENABLED=false
避免 API 启动时自动处理真实邮箱。

IMAP_POLL_BOOTSTRAP_MODE=mark_existing_seen
首次启动跳过历史邮件，只处理后续新邮件。需要全量导入时再显式改为 process_existing。
```
