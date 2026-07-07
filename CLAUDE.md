# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

**邮件自动回复** — B2B 邮件询盘自动处理系统，主营 RF/microwave 无源器件产品（环形器、隔离器等）。实现邮件自动接入、分类、参数提取和回复草稿生成，同时保持严格的人工审核机制。

- **框架**: NestJS 11 + Express
- **语言**: TypeScript 5.8 (ESM, ES2022)
- **数据库**: PostgreSQL 18 + Prisma 7 ORM
- **AI**: DeepSeek API（OpenAI 兼容 SDK）
- **邮件协议**: IMAP（imapflow）、SMTP（nodemailer）
- **包管理**: pnpm workspace（monorepo）
- **架构**: DDD 六边形架构（Ports & Adapters）

## 核心业务流程

`pnpm dev` 启动后，HTTP 服务器和 IMAP 邮件轮询 **在同一 Node.js 进程中同时运行**，整个系统是统一的后端服务，不存在独立进程。

### 启动流程

```
pnpm dev 启动 NestJS
  ↓
ConfigModule 加载 .env（自动向上搜索到仓库根目录）
  ↓
PrismaService 连接 PostgreSQL
  ↓
HTTP 服务器开始监听 :3000
  ↓
ImapPollService.onApplicationBootstrap() 异步启动（不阻塞 HTTP）
  ↓
连接 IMAP 邮箱
```

### 邮件处理流水线

```
IMAP 连接成功
  ↓
拉取邮箱 UID 列表
  ↓
与数据库 processed_emails 比对，找出新 UID
  ↓
新 UID 按升序排列（从旧到新逐封处理）
  ↓
逐封拉取邮件源文 → mailparser 解析
  ↓
┌─ ReceiveInboundEmailUseCase ─────────────────┐
│  1. EmailContentSanitizer 清洗正文           │
│     (HTML→纯文本、移除历史引用/签名)          │
│  2. EmailMessageRepository.save() → 邮件入库  │
│  3. Customer 自动创建（按邮箱去重）            │
│  4. FindInquiryForInboundEmailUseCase 匹配询盘 │
│     • 优先: threadId 命中 → 归入同一询盘       │
│     • 次选: 同客户唯一 open 询盘 → 合并        │
│     • 兜底: 创建新 InquiryCase (status=new)    │
│  5. InquiryMessageRepository.save() 关联      │
└──────────────────────────────────────────────┘
  ↓
┌─ AnalyzeEmailWithAiUseCase ──────────────────┐
│  1. BuildAiContextUseCase 组装 AI 上下文       │
│     (询盘状态 + 近期邮件 + RAG + 系统提示词)   │
│  2. DeepseekEmailAnalysisAdapter 调用 AI      │
│  3. 解析 JSON → zod 校验                     │
│  4. 返回结构化分析:                           │
│     { classification, suggestedStatus,       │
│       confidence, missingFields, ... }       │
└──────────────────────────────────────────────┘
  ↓
processed_emails 记录处理完成（幂等）
  ↓
mailbox_sync_states 更新 lastSeenUid（断点续传）
  ↓
定时轮询（IMAP_POLL_INTERVAL_MS，默认 30s）
```

### 两种启动模式

| 模式 | IMAP_POLL_BOOTSTRAP_MODE | 行为 |
|------|--------------------------|------|
| `process_existing`（默认） | 首次启动时拉取全网箱邮件，与 DB 比对后逐封入库 + AI 分析 |
| `mark_existing_seen` | 首次启动时跳过所有已有邮件，只处理后续到达的新邮件 |

### AI 权限边界

```
AI 可以: 分类邮件、提取参数、判断缺失字段、建议状态
AI 不可以: 自动修改询盘状态、自动发送邮件、自动报价、进入 ready_for_quote
```

## 启动命令

```bash
# 安装依赖（根目录）
pnpm install

# 复制环境变量
cp .env.example .env
# 然后编辑 .env，填入 DEEPSEEK_API_KEY、IMAP_HOST/USER/PASS、DATABASE_URL

# 初始化数据库（需要先手动创建 email_inquiry 数据库）
pnpm --filter @email-inquiry/backend db:migrate

# 生成 Prisma 客户端
pnpm --filter @email-inquiry/backend db:generate

# 启动开发服务器（tsx watch 热重载，默认 http://0.0.0.0:3003）
pnpm dev:backend
# 或兼容别名（效果相同）
pnpm dev:api

# 生产启动
pnpm start:backend
pnpm start:api    # 兼容别名
```

## 构建命令

```bash
# 构建 API 应用（tsc 编译到 apps/backend/dist/）
pnpm --filter @email-inquiry/backend build

# 构建 shared 包
pnpm --filter @email-inquiry/shared build

# 按依赖顺序构建所有包（从依赖到依赖者）
pnpm --filter @email-inquiry/shared build
pnpm --filter @email-inquiry/backend build

# 类型检查（不输出文件）
pnpm --filter @email-inquiry/backend typecheck
pnpm --filter @email-inquiry/shared typecheck

# 清理 dist 目录
pnpm --filter @email-inquiry/backend clean
pnpm --filter @email-inquiry/shared clean
```

## 测试命令

```bash
# 运行所有测试
pnpm --filter @email-inquiry/backend test

# 运行单个测试文件
pnpx --package tsx tsx --test "src/modules/inquiry/domain/state-machine/inquiry-state-machine.spec.ts"

# 按名称模式过滤测试（Node 22+）
pnpm --filter @email-inquiry/backend test -- --test-name-pattern="canTransition"
```

测试框架：Node.js 原生 `node:test` + `node:assert/strict`，无 Jest/Vitest。

当前测试文件清单：

| 文件 | 覆盖内容 |
|------|---------|
| `inquiry-state-machine.spec.ts` | 状态机流转规则、守卫、异常流转 |
| `email-ai-analysis.schema.spec.ts` | AI 输出 zod schema 校验（成功/失败/报价边界） |
| `analyze-email-with-ai.use-case.spec.ts` | AI 分析用例（JSON 解析、校验失败回退） |
| `receive-inbound-email.use-case.spec.ts` | 邮件入库、内容清洗、询盘匹配/创建/合并 |
| `email-content-sanitizer.spec.ts` | HTML 转文本、历史引用移除、签名清理 |
| `in-memory-processed-email-tracker.spec.ts` | 已处理邮件幂等追踪 |
| `build-ai-context.use-case.spec.ts` | 上下文组装、快照持久化 |

## Demo 脚本

```bash
# 测试 DeepSeek API 调用
pnpm --filter @email-inquiry/backend demo:deepseek

# 测试 IMAP 拉取邮件（需配置 IMAP_* 环境变量）
pnpm --filter @email-inquiry/backend demo:imap

# 测试 IMAP 拉取 → 创建询盘
pnpm --filter @email-inquiry/backend demo:imap-to-inquiry

# 测试 IMAP 轮询 + AI 分析（核心 demo）
pnpm --filter @email-inquiry/backend demo:poll-inbox
```

## 目录结构

```
邮件自动回复/
├── apps/
│   └── backend/                      # NestJS 应用（包名 @email-inquiry/backend）
│       ├── src/
│       │   ├── main.ts               # 应用入口（NestFactory.create）
│       │   ├── app.module.ts          # 根模块（导入所有子模块）
│       │   ├── common/
│       │   │   ├── errors/            # BusinessError, InvalidTransitionError
│       │   │   ├── filters/           # BusinessErrorFilter（全局异常过滤器）
│       │   │   ├── guards/            # （预留）
│       │   │   ├── decorators/        # （预留）
│       │   │   ├── interceptors/      # （预留）
│       │   │   └── utils/             # （预留）
│       │   ├── config/
│       │   │   └── deepseek-chat-demo.ts  # DeepSeek API 调用 demo
│       │   └── modules/
│       │       ├── email/             # 邮件模块（详见下方）
│       │       ├── inquiry/           # 询盘模块（详见下方）
│       │       ├── context/           # 上下文模块（详见下方）
│       │       └── health/            # 健康检查模块
│       ├── database/                  # SQL 迁移脚本
│       │   └── migrations/
│       │       └── 001_initial_persistence.sql
│       ├── prisma/
│       │   └── schema.prisma          # Prisma schema（13 个模型）
│       └── test/                      # （预留）
├── packages/
│   └── shared/                       # 共享类型/常量（当前内容较少）
├── docs/                             # 业务与设计文档
│   ├── 01-business-flow.md           # 业务流程参考
│   ├── 02-implementation-plan.md     # 实施计划
│   ├── 03-data-model.md              # 数据模型设计
│   ├── 04-status-rules.md            # 状态机规则
│   ├── 05-ai-rules.md                # AI 规则与边界
│   ├── 06-current-task.md            # 当前开发任务
│   └── 07-database-persistence-design.md  # 数据库持久化方案
├── pnpm-workspace.yaml               # pnpm workspace 配置
├── tsconfig.base.json                # 全局 TypeScript 配置
├── .env.example                      # 环境变量模板
├── .gitignore
└── CLAUDE.md                         # 本文件
```

### 模块内部结构（DDD 六边形架构）

每个模块按以下结构组织：

```
src/modules/<domain>/
├── domain/                            # 核心业务逻辑（零外部依赖）
│   ├── entities/                      # 实体接口（InquiryCase, EmailMessage）
│   ├── value-objects/                 # 值对象（InboundEmail, EmailAiAnalysis 等）
│   ├── enums/                         # 枚举（InquiryStatus, EmailDirection 等）
│   ├── matching/                      # 领域匹配策略（InquiryMatchingPolicy）
│   └── state-machine/                 # 状态机（InquiryStateMachine + 守卫 + 流转表）
├── application/
│   ├── use-cases/                     # 业务用例（协调 domain + ports）
│   ├── ports/                         # 接口定义（Repository, Adapter, Estimator）
│   ├── dto/                           # 输入/输出 DTO + zod schema
│   ├── services/                      # 应用服务（EmailContentSanitizer）
│   └── prompts/                       # AI 系统提示词
├── infrastructure/
│   ├── adapters/                      # 外部服务实现（DeepSeek, IMAP, RAG）
│   └── repositories/                  # 仓库实现（InMemory / 将来 Prisma）
└── presentation/                      # HTTP 控制器（Controller）
```

### 三大核心模块详解

**1. EmailModule** (`src/modules/email/`)

| 层级 | 关键文件 | 职责 |
|------|---------|------|
| domain | `EmailMessage`, `InboundEmail`, `EmailAiAnalysis` | 邮件实体、入站邮件值对象、AI 分析结果 |
| application | `ReceiveInboundEmailUseCase` | 邮件入库 + 创建询盘 |
| application | `AnalyzeEmailWithAiUseCase` | 调用 AI + JSON 解析 + zod 校验 |
| application | `PollEmailInboxUseCase` | IMAP 轮询 + 幂等处理 |
| application | `EmailContentSanitizer` | HTML 转纯文本、移除历史引用/签名 |
| ports | `EmailMessageRepository` | 邮件仓库接口 |
| ports | `EmailAiAnalysisAdapter` | AI 分析适配器接口 |
| ports | `ProcessedEmailTracker` | 已处理邮件追踪接口 |
| infrastructure | `DeepseekEmailAnalysisAdapter` | DeepSeek API 调用实现 |
| infrastructure | `InMemoryEmailMessageRepository` | 内存邮件仓库 |
| infrastructure | `InMemoryProcessedEmailTracker` | 内存幂等追踪器 |
| presentation | `EmailWebhookController` | POST /webhooks/email/inbound |

**2. InquiryModule** (`src/modules/inquiry/`)

| 层级 | 关键文件 | 职责 |
|------|---------|------|
| domain | `InquiryCase` | 询盘实体 |
| domain | `InquiryStateMachine` | 状态机（流转、守卫、允许下一个状态） |
| domain | `InquiryTransitionGuard` | 流转守卫（ready_for_quote 仅 human） |
| domain | `InquiryMatchingPolicy` | 询盘匹配策略（14 天窗口、不自动合并） |
| application | `CreateInquiryUseCase` | 创建询盘 |
| application | `CreateInquiryFromEmailUseCase` | 从邮件创建询盘 |
| application | `FindInquiryForInboundEmailUseCase` | 匹配入站邮件到现有询盘 |
| infrastructure | `InMemoryInquiryRepository` | 内存询盘仓库 |
| presentation | `InquiryController` | 询盘 CRUD + 状态流转 API |

**3. ContextModule** (`src/modules/context/`)

| 层级 | 关键文件 | 职责 |
|------|---------|------|
| domain | `AiContextSnapshot`, `AiChatMessage` | 上下文快照实体、聊天消息 |
| domain | `ContextPurpose`, `ContextSourceType` | 目的枚举、来源枚举 |
| application | `BuildAiContextUseCase` | 组装完整 AI 上下文（状态+邮件+RAG+提示词） |
| ports | `ContextSnapshotRepository` | 快照仓库接口 |
| ports | `RagRetrieverAdapter` | RAG 检索接口（当前为 Noop） |
| ports | `TokenEstimator` | Token 估算接口 |
| infrastructure | `InMemoryContextSnapshotRepository` | 内存快照仓库 |
| infrastructure | `NoopRagRetrieverAdapter` | 空 RAG 实现 |
| infrastructure | `SimpleTokenEstimator` | 基于字符数的 Token 估算 |

### HTTP API 端点

| 方法 | 路径 | 控制器 | 用途 |
|------|------|--------|------|
| GET | `/health` | HealthController | 健康检查 |
| POST | `/webhooks/email/inbound` | EmailWebhookController | Webhook 接收邮件 |
| POST | `/inquiries` | InquiryController | 创建询盘 |
| GET | `/inquiries` | InquiryController | 列出询盘 |
| GET | `/inquiries/:id` | InquiryController | 查询单个询盘 |
| GET | `/inquiries/:id/allowed-transitions` | InquiryController | 查询允许流转的状态 |
| POST | `/inquiries/:id/transitions` | InquiryController | 执行状态流转 |

## 代码规范

### 导入规范

- 所有本地导入使用 `.js` 扩展名（ESM 要求）
- 按顺序：`node:*` 内置模块 → 第三方包 → 项目内部模块
- 每类之间空行分隔

```typescript
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';

import { InquiryRepository } from './application/ports/inquiry.repository.js';
```

### 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `email-content-sanitizer.ts` |
| 类/接口 | PascalCase | `InquiryStateMachine`, `EmailMessage` |
| 方法/变量 | camelCase | `canTransition()`, `emailMessageRepository` |
| 枚举 | PascalCase + UPPER 值 | `EmailDirection.INBOUND` |
| 类型/接口 | PascalCase | `AnalyzeEmailWithAiResult` |
| DTO 接口 | PascalCase + `Dto` 后缀 | `CreateInquiryDto` |
| Token 常量 | UPPER_SNAKE_CASE | `INQUIRY_REPOSITORY` |
| Use Case 文件 | kebab-case | `create-inquiry.use-case.ts` |
| 仓库文件 | kebab-case | `in-memory-inquiry.repository.ts` |

### 错误处理

- 业务异常继承 `BusinessError` 基类，携带 `code` 字符串
- 全局 `BusinessErrorFilter` 捕获并返回 `{ success, code, message }`
- 对外 HTTP 响应统一使用 `{ success, ...data }` 格式

### 依赖注入模式

- 端口接口定义在 `application/ports/` 目录
- 注入 Token 定义为 `Symbol`，集中存放在 `*.tokens.ts`
- 模块提供者使用 `useFactory` + `inject` 显式注入

### 枚举用法

- 状态枚举使用字符串枚举：`InquiryStatus.NEW = 'new'`
- 不允许魔数字符串直接出现在业务逻辑中（使用枚举引用）

### 测试规范

- 使用 `describe` / `it` 组织测试用例
- 测试文件与被测文件同目录，后缀 `.spec.ts`
- 仓库测试直接实例化 InMemory 实现，不启动 NestJS 容器
- Use Case 测试手动实例化依赖（构造函数注入），不涉及 NestJS DI

## 数据库相关

### Prisma 命令

```bash
# Prisma 相关
pnpm --filter @email-inquiry/backend db:generate   # 重新生成 Prisma 客户端（到 src/generated/prisma/）
pnpm --filter @email-inquiry/backend db:push       # 推送 schema 到数据库
pnpm --filter @email-inquiry/backend db:pull       # 从数据库拉取 schema
pnpm --filter @email-inquiry/backend db:studio     # Prisma Studio GUI

# 自定义 SQL 迁移
pnpm --filter @email-inquiry/backend db:migrate    # 运行 database/migrations/ 下的 SQL
pnpm --filter @email-inquiry/backend db:check      # 验证数据库表是否存在
```

### 数据库模型（Prisma schema 中的 13 个模型）

`mailbox_accounts` → `mailbox_sync_states` / `email_threads` / `email_messages` / `processed_emails`
`customers` → `inquiry_cases`
`inquiry_cases` → `inquiry_messages` / `ai_decisions` / `inquiry_structured_facts` / `reply_drafts` / `ai_context_snapshots` / `inquiry_status_logs`
`email_messages` → ai_decisions / reply_drafts / context_snapshots / inquiry_structured_facts

注意：Prisma schema 已定义但所有仓库当前使用 InMemory 实现，尚未切换到 Prisma 生产仓库。

重要：ID 使用可读前缀模式 — `inquiry_<uuid>`、`email_<uuid>`、`customer_<uuid>`、`thread_<uuid>` 等。

## 禁止随意改动的文件

以下文件改动需要特别注意，修改前应确认不影响现有业务逻辑：

| 文件 | 风险说明 |
|------|---------|
| `apps/backend/prisma/schema.prisma` | 数据库模型定义，增删改影响迁移和数据类型 |
| `apps/backend/database/migrations/*.sql` | 已有迁移不可修改（只能新增），否则破坏环境一致性 |
| `.env.example` | 环境变量模板，增减变量需同步更新文档和代码 |
| `.env` | 已 gitignore，但本地配置依赖此文件 |
| `apps/backend/src/modules/inquiry/domain/state-machine/inquiry-transitions.ts` | 状态流转表，修改需同步更新业务文档和设备代码 |
| `apps/backend/src/modules/inquiry/domain/state-machine/inquiry-transition.guard.ts` | 流转守卫规则，涉及 AI/人工权限边界 |
| `apps/backend/src/modules/inquiry/domain/enums/inquiry-status.enum.ts` | 状态枚举，增删改影响状态机和所有引用 |
| `apps/backend/src/modules/email/application/prompts/email-analysis.prompt.ts` | AI 系统提示词，影响整个 AI 分析质量 |
| `apps/backend/src/modules/email/application/dto/email-ai-analysis.schema.ts` | AI 输出 zod schema，校验规则影响系统安全边界 |
| `apps/backend/src/modules/inquiry/domain/matching/inquiry-matching-policy.ts` | 询盘匹配策略常量 |
| `apps/backend/src/config/deepseek-chat-demo.ts` | API Key 配置文件（但 Key 来自环境变量） |
| `apps/backend/src/main.ts` | 应用入口，全局过滤器、启动配置 |
| `apps/backend/src/app.module.ts` | 根模块，模块导入结构 |
| `package.json` (各层) | 依赖版本和 scripts |
| `pnpm-workspace.yaml` | workspace 配置 |
| `tsconfig.base.json` | 全局 TypeScript 配置 |

### 含 `.gitkeep` 的占位目录（尚未实现功能，新增文件需同步移除 `.gitkeep`）

- `apps/backend/src/common/decorators/`
- `apps/backend/src/common/guards/`
- `apps/backend/src/common/interceptors/`
- `apps/backend/src/common/utils/`
- `apps/backend/src/modules/inquiry/domain/events/`
- `apps/backend/src/modules/inquiry/infrastructure/mappers/`
- `apps/backend/test/`
- `packages/shared/src/types/`
- `packages/shared/src/constants/`

## 重要开发规则

- AI **仅能建议** — 永远不能自动变更状态、发送邮件、报价或关闭询盘
- `ready_for_quote` 是 **硬性人工关卡** — 代码阻止 AI 越过此边界
- 所有仓库当前为 **InMemory 实现** — 切换到 Prisma 时，保留 InMemory 实现用于单元测试
- 报价/价格/合同字段 **绝对不能** 添加到 `inquiry_cases` 表
- 不要随意新增表、状态或字段，需先查阅 `docs/` 中相关文档
- 业务文档以 `docs/06-current-task.md` 为当前任务准绳，`01-business-flow.md` 为业务背景参考
- NestJS 源文件中必须使用 `.js` 扩展名导入
- ID 生成使用 `randomUUID()` 配合可读前缀（如 `inquiry_`、`email_`）
- 所有控制器返回统一格式 `{ success: true, ... }

## 文档参考

`docs/` 目录中的关键文档：

| 文档 | 内容 | 何时查阅 |
|------|------|---------|
| `01-business-flow.md` | 完整 B2B 邮件询盘业务流程 | 理解业务背景 |
| `02-implementation-plan.md` | 分阶段实现计划 | 了解整体路线 |
| `03-data-model.md` | 7 阶段数据表设计 | 需要新增表或字段时 |
| `04-status-rules.md` | 状态机规则和 AI 边界 | 修改状态流转时 |
| `05-ai-rules.md` | AI 能力约束和安全护栏 | 修改 AI 相关代码时 |
| `06-current-task.md` | **当前开发任务** | **始终优先查看** |
| `07-database-persistence-design.md` | 数据库持久化方案 | 切换到 Prisma 仓库时 |
