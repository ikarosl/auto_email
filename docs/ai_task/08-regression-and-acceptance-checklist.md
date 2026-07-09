# 08 回归与验收清单

## 目标

为后续每个 AI 任务提供统一验收标准，避免改动破坏邮件入库、AI 上下文、询盘状态和前端工作台。

## 后端基础命令

每个后端任务至少执行：

```powershell
pnpm.cmd --filter @email-inquiry/backend db:generate
pnpm.cmd --filter @email-inquiry/backend typecheck
pnpm.cmd --filter @email-inquiry/backend test
pnpm.cmd --filter @email-inquiry/backend build
```

如果涉及数据库迁移，还需执行：

```powershell
pnpm.cmd --filter @email-inquiry/backend db:migrate
```

## 前端基础命令

每个前端任务至少执行：

```powershell
pnpm.cmd --filter @email-inquiry/admin-web typecheck
pnpm.cmd --filter @email-inquiry/admin-web build
```

## 核心业务验收场景

### 1. 企业域名归并

场景：

```text
dykim@rfhic.com 首次询盘
hshan@rfhic.com 后续补充同一主题
```

预期：

- 两个联系人属于同一 organization。
- 如果 2 个月内只有一个打开询盘，第二封归并到原询盘。
- AI 上下文包含前一封邮件。

### 2. 公共邮箱真实客户

场景：

```text
buyer-a@gmail.com 首次询盘
buyer-b@gmail.com 另一封询盘
```

预期：

- 两者都可创建客户和询盘。
- 不因为 gmail.com 相同而自动归并。
- 可人工绑定到组织。

### 3. 多候选冲突

场景：

```text
同企业域名下 2 个月内有两个打开询盘
第三个联系人发来新邮件
```

预期：

- 不自动归并到任意一个。
- 后续可人工移动/关联邮件。

### 4. 网站表单标题

场景：

```text
subject = 你有一个网站表单提交的新询盘
body = We need a 12-15GHz microstrip isolator...
```

预期：

- `raw_subject` 保存原始标题。
- `business_subject` 应是业务主题。
- AI 上下文 `inquiryState.subject` 使用业务主题。

### 5. 手动补录邮件

预期：

- `email_messages.source = manual`。
- 不写入 `processed_emails`。
- 不改变 IMAP 同步游标。
- 进入目标询盘上下文。

### 6. 移动错误邮件

预期：

- 邮件从询盘 A 移动到询盘 B。
- 询盘 A 后续上下文不再包含该邮件。
- `inquiry_messages` 保留人工操作原因。

### 7. 状态流转

预期：

- 状态修改必须走状态机。
- AI 建议不能直接变更状态。
- `ready_for_quote` 仍需人工操作。

## 日志检查

开发环境应检查：

```text
apps/backend/logs/ai-interactions-dev.jsonl
apps/backend/logs/email-sanitizer-debug.jsonl
apps/backend/logs/email.txt
```

确认：

- AI debug log 中 `contextPayload` 可读。
- 当前邮件和历史邮件分离。
- 邮件顺序按时间升序。
- 引用历史没有大面积污染上下文。

## 提交要求

- 每个任务单独提交。
- 提交前 `git status --short` 确认没有日志和 `.env`。
- 不提交 `apps/backend/logs/*`。
- 数据库结构变更必须同步：
  - Prisma schema
  - SQL migration
  - `docs/initial-empty-postgres-schema.sql`
  - 必要文档
