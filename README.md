# 邮件询盘自动处理系统

当前仓库是 pnpm monorepo，现阶段只搭建后端与 TypeScript 工程框架，不提前填写业务代码。

## 当前范围

- 后端 API：`apps/backend`
- 共享类型包：`packages/shared`
- 后端目录骨架：`config`、`common`、`health`、`inquiry`、`email`
- 暂不包含前端、AI、RAG、报价、研发评审和数据库实现

## 环境

- Node.js >= 22
- pnpm >= 11

Windows PowerShell 如遇到 `npm.ps1` 或 `pnpm.ps1` 执行策略限制，可使用 `npm.cmd` / `pnpm.cmd`。

## 常用命令

```bash
pnpm install
pnpm dev:backend
pnpm --filter @email-inquiry/backend demo:imap
pnpm --filter @email-inquiry/backend demo:imap-to-inquiry
pnpm --filter @email-inquiry/backend demo:poll-inbox
pnpm --filter @email-inquiry/backend demo:deepseek
pnpm build
pnpm typecheck
pnpm test
```

API 默认启动在 `http://localhost:3000`。

## HTTP 接口

启动 API：

```bash
pnpm dev:backend
```

当前已支持：

```text
GET  /health
POST /webhooks/email/inbound
POST /inquiries
GET  /inquiries
GET  /inquiries/:id
GET  /inquiries/:id/allowed-transitions
POST /inquiries/:id/transitions
```

当前使用内存 Repository，服务重启后数据会清空。

## IMAP 拉取 Demo

复制 `.env.example` 为 `.env`，补充 `IMAP_HOST`、`IMAP_USER`、`IMAP_PASS` 等配置后运行：

```bash
pnpm --filter @email-inquiry/backend demo:imap
```

该命令只用于验证邮箱可连接、可打开邮箱目录、可读取最近邮件摘要，不会写入数据库或创建询盘。

## IMAP 转询盘 Demo

补充 `.env` 中的 IMAP 配置后运行：

```bash
pnpm --filter @email-inquiry/backend demo:imap-to-inquiry
```

该命令会读取邮箱中的最新一封邮件，转换为内部 `EmailMessage`，再创建一条初始状态为 `new` 的 `InquiryCase`。当前使用内存 Repository，不会写入数据库。

## IMAP 轮询与 AI 结构化建议 Demo

补充 `.env` 中的 IMAP 与 DeepSeek 配置后运行：

```bash
pnpm --filter @email-inquiry/backend demo:poll-inbox
```

默认按 `IMAP_POLL_INTERVAL_MS=10000` 每 10 秒轮询一次。`IMAP_POLL_BOOTSTRAP_MODE=mark_existing_seen` 时，启动会先把邮箱已有邮件标记为已见，只处理启动后的新邮件。

只执行一次轮询检查可运行：

```bash
pnpm --filter @email-inquiry/backend demo:poll-inbox -- --once
```

新邮件处理流程：

```text
IMAP 新邮件 -> EmailMessage -> InquiryCase(status = new) -> AI 结构化分析 -> zod 校验 -> 打印建议
```

AI 分析只生成建议，不会自动修改询盘状态，也不会自动回复邮件。

## Context Manager

邮件 AI 分析已接入基础 Context Manager 骨架。当前会在调用 AI 前构造：

```text
system prompt
context purpose
当前询盘状态
当前邮件原文
最近邮件窗口
最近我方回复窗口
RAG 占位区
输出格式要求
```

同时会保存内存版 `AiContextSnapshot`，用于后续替换为数据库留痕。当前 RAG 使用 `NoopRagRetrieverAdapter`，只保留接口，不执行真实检索。

## DeepSeek 读取回复 Demo

补充 `.env` 中的 `DEEPSEEK_API_KEY` 后运行：

```bash
pnpm --filter @email-inquiry/backend demo:deepseek
```

该命令只用于验证 OpenAI SDK 兼容接口可调用，不接入询盘状态机，也不会自动回复邮件。
