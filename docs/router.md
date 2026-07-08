# API 路由规划

本文档作为后续前后端联调的接口蓝图。前端请求统一走 `/api` 前缀，后端 NestJS Controller 本身不包含 `/api` 前缀，由 Vite proxy 或生产反向代理完成转发。

## 1. 设计原则

- **前端统一 `/api` 前缀**：前端 axios 实例 `baseURL: '/api'`，因此前端调用路径形如 `/api/inquiries`。
- **后端路由不带 `/api`**：后端实际收到 `/inquiries`，由代理剥离 `/api`。
- **暂不实现手动创建询盘**：当前询盘仍由邮件入库链路自动创建，前端不提供“手动新增询盘”能力。
- **列表统一分页**：所有列表接口统一支持 `page / limit / sort / order`。
- **响应格式统一**：成功响应统一使用 `{ success: true, data, total?, page?, limit? }`。
- **路由常量抽公共包**：建立 `packages/shared` 保存路由常量和公共类型，前后端共同引用，避免路径散落。
- **实现优先级**：邮件线程 > 客户管理 > AI 上下文 > AI 回复草稿。

## 2. 统一响应格式

### 单条数据

```ts
{
  success: true,
  data: {
    id: '...'
  }
}
```

### 列表数据

```ts
{
  success: true,
  data: [],
  total: 0,
  page: 1,
  limit: 20
}
```

### 错误响应

```ts
{
  success: false,
  code: 'CUSTOMER_NOT_FOUND',
  message: 'Customer not found.'
}
```

### 前端适配要求

当前前端如果存在读取 `response.data.inquiryCases` 的旧写法，后续需要统一调整为：

```ts
const response = await http.get<ApiListResponse<InquiryCase>>('/inquiries');
return response.data.data;
```

## 3. 分页与筛选参数

所有 `GET` 列表接口统一支持：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码，从 1 开始 |
| `limit` | number | 20 | 每页条数，最大 100 |
| `sort` | string | `createdAt` | 排序字段 |
| `order` | `asc` \| `desc` | `desc` | 排序方向 |

示例：

```text
GET /api/inquiries?page=1&limit=20&sort=latestMessageAt&order=desc
GET /api/customers?page=1&limit=20&status=active&keyword=dattilo
GET /api/inquiries/:id/messages?page=1&limit=50&sort=receivedAt&order=asc
```

## 4. 路由总表

以下路由均列出前端调用路径和后端实际路径。

### 4.1 系统

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| GET | `/api/health` | `/health` | 健康检查，包含数据库状态 | 已有 |
| POST | `/api/webhooks/email/inbound` | `/webhooks/email/inbound` | Webhook 接收邮件 | 已有 |

### 4.2 询盘

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| GET | `/api/inquiries` | `/inquiries` | 询盘列表，分页 | 已有，需统一响应格式和分页 |
| GET | `/api/inquiries/:id` | `/inquiries/:id` | 询盘详情 | 已有，需统一响应格式 |
| GET | `/api/inquiries/:id/allowed-transitions` | `/inquiries/:id/allowed-transitions` | 查询允许的下一步状态 | 已有，需统一响应格式 |
| POST | `/api/inquiries/:id/transitions` | `/inquiries/:id/transitions` | 人工执行状态流转 | 已有，需统一响应格式 |

### 暂不实现

| 方法 | 前端路径 | 后端路径 | 说明 |
|---|---|---|---|
| POST | `/api/inquiries` | `/inquiries` | 手动创建询盘暂不开放。当前询盘由邮件入库自动创建 |

> 注：如果当前后端已有 `POST /inquiries`，可以先保留内部能力，但前端不接入口。后续若确实需要人工新建询盘，再单独设计表单、校验和业务规则。

### 4.3 邮件线程

邮件线程接口保留两个层次：`messages` 是纯邮件列表，`thread` 是业务聚合视图。

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| GET | `/api/inquiries/:id/messages` | `/inquiries/:id/messages` | 获取某个询盘下的邮件列表 | 需新增 |
| GET | `/api/messages/:id` | `/messages/:id` | 获取单封邮件详情 | 需新增 |
| GET | `/api/inquiries/:id/thread` | `/inquiries/:id/thread` | 获取询盘线程聚合视图 | 需新增 |

#### `GET /api/inquiries/:id/messages`

用途：返回该询盘关联的邮件列表，适合表格、时间线、分页加载。

建议查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码 |
| `limit` | number | 50 | 每页数量 |
| `sort` | string | `receivedAt` | 默认按邮件时间排序 |
| `order` | `asc` \| `desc` | `asc` | 时间线默认升序 |
| `direction` | `inbound` \| `outbound` \| `internal` | 可选 | 按方向筛选 |

响应示例：

```ts
{
  success: true,
  data: [
    {
      id: 'email_001',
      inquiryCaseId: 'inquiry_001',
      threadId: 'thread_001',
      direction: 'inbound',
      from: 'buyer@example.com',
      to: 'sales@hzbeat.com',
      subject: 'RF isolator inquiry',
      cleanBodyPreview: 'We need a 12-15GHz isolator...',
      receivedAt: '2026-07-03T02:13:25.000Z'
    }
  ],
  total: 1,
  page: 1,
  limit: 50
}
```

#### `GET /api/messages/:id`

用途：查看单封邮件完整详情，包括原文、清洗正文、解析元数据、附件信息和规则命中情况。

响应示例：

```ts
{
  success: true,
  data: {
    id: 'email_001',
    inquiryCaseId: 'inquiry_001',
    threadId: 'thread_001',
    direction: 'inbound',
    from: 'buyer@example.com',
    to: 'sales@hzbeat.com',
    cc: [],
    subject: 'RF isolator inquiry',
    cleanBody: 'We need a 12-15GHz isolator...',
    rawText: '...',
    rawHtml: '...',
    receivedAt: '2026-07-03T02:13:25.000Z',
    parserDiagnostics: {
      quoteRemoved: true,
      matchedRules: ['on_wrote']
    }
  }
}
```

#### `GET /api/inquiries/:id/thread`

用途：返回前端线程详情页所需的完整聚合数据，减少前端多次请求。

建议包含：

```ts
{
  success: true,
  data: {
    inquiry: {},
    customer: {},
    messages: [],
    latestAiDecision: {},
    latestContextSnapshot: {},
    latestDraft: {},
    allowedTransitions: []
  }
}
```

## 5. 客户管理

### 5.1 路由

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| GET | `/api/customers` | `/customers` | 客户列表，分页和筛选 | 需新增 |
| GET | `/api/customers/:id` | `/customers/:id` | 客户详情 | 需新增 |
| GET | `/api/customers/:id/inquiries` | `/customers/:id/inquiries` | 客户关联询盘列表 | 需新增 |
| PATCH | `/api/customers/:id` | `/customers/:id` | 更新客户信息 | 需新增 |
| GET | `/api/customers/:id/status-log` | `/customers/:id/status-log` | 客户状态变更记录 | 需新增 |

### 5.2 `GET /api/customers` 筛选参数

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码 |
| `limit` | number | 20 | 每页数量 |
| `status` | `unknown` \| `active` \| `invalid` | 可选 | 客户状态 |
| `email` | string | 可选 | 精确或模糊匹配邮箱 |
| `keyword` | string | 可选 | 搜索邮箱、名称、公司、备注 |
| `sort` | string | `updatedAt` | 排序字段 |
| `order` | `asc` \| `desc` | `desc` | 排序方向 |

响应示例：

```ts
{
  success: true,
  data: [
    {
      id: 'customer_001',
      email: 'buyer@example.com',
      name: 'Reynaldo Dattilo',
      company: 'Example RF',
      status: 'active',
      invalidReason: null,
      inquiryCount: 2,
      latestMessageAt: '2026-07-03T02:29:42.000Z',
      updatedAt: '2026-07-03T02:29:42.000Z'
    }
  ],
  total: 1,
  page: 1,
  limit: 20
}
```

### 5.3 客户状态说明

| 状态 | 含义 |
|---|---|
| `unknown` | 邮件已入库，但还不能确认是否有效客户 |
| `active` | 有真实询盘，或被人工确认为有效 |
| `invalid` | 广告、垃圾邮件、无关产品或其他无效来源 |

## 6. AI 上下文快照

### 6.1 路由

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| GET | `/api/inquiries/:id/context-snapshots` | `/inquiries/:id/context-snapshots` | 某询盘的上下文快照列表 | 需新增 |
| GET | `/api/context-snapshots/:id` | `/context-snapshots/:id` | 单条上下文快照详情 | 需新增 |

### 6.2 `GET /api/inquiries/:id/context-snapshots`

建议查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码 |
| `limit` | number | 20 | 每页数量 |
| `purpose` | string | 可选 | `email_analysis` / `reply_draft` 等 |
| `sort` | string | `createdAt` | 排序字段 |
| `order` | `asc` \| `desc` | `desc` | 排序方向 |

响应示例：

```ts
{
  success: true,
  data: [
    {
      id: 'context_001',
      inquiryCaseId: 'inquiry_001',
      emailMessageId: 'email_001',
      purpose: 'email_analysis',
      estimatedTokens: 3200,
      sourceReferenceCount: 4,
      createdAt: '2026-07-03T02:29:42.000Z'
    }
  ],
  total: 1,
  page: 1,
  limit: 20
}
```

### 6.3 `GET /api/context-snapshots/:id`

详情必须同时返回 `contextPayload` 和 `messages`。

```ts
{
  success: true,
  data: {
    id: 'context_001',
    inquiryCaseId: 'inquiry_001',
    emailMessageId: 'email_001',
    purpose: 'email_analysis',
    contextPayload: {
      inquiryState: {},
      recentThreadMessages: [],
      ragReferences: [],
      currentEmail: {},
      outputInstruction: {}
    },
    messages: [
      { role: 'system', content: '...' },
      { role: 'user', content: '{...}' }
    ],
    sourceReferences: [],
    estimatedTokens: 3200,
    aiDecision: {
      classification: 'valid_inquiry',
      suggestedStatus: 'ready_for_quote',
      confidence: 0.91,
      reason: '...'
    },
    createdAt: '2026-07-03T02:29:42.000Z'
  }
}
```

## 7. AI 回复草稿

### 7.1 当前阶段查询接口

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| GET | `/api/inquiries/:id/drafts` | `/inquiries/:id/drafts` | 某询盘的回复草稿列表 | 需新增 |
| GET | `/api/drafts/:id` | `/drafts/:id` | 单篇草稿详情 | 需新增 |

### 7.2 未来预留生成接口

| 方法 | 前端路径 | 后端路径 | 说明 | 状态 |
|---|---|---|---|---|
| POST | `/api/inquiries/:id/drafts` | `/inquiries/:id/drafts` | 根据当前上下文生成回复草稿 | 预留，当前不实现 |

说明：

```text
当前阶段不自动发送邮件。
AI 回复草稿必须经过人工确认。
生成接口后续实现时，需要绑定 contextSnapshotId，保证草稿可追溯。
```

## 8. 公共包路由常量

建议直接建立公共包：

```text
packages/shared/
  package.json
  tsconfig.json
  src/
    index.ts
    constants/
      api-routes.ts
    types/
      api-response.ts
```

### 8.1 路由常量

路由常量使用后端实际路径，不包含 `/api` 前缀。前端通过 axios `baseURL: '/api'` 自动补齐。

```ts
export const ROUTES = {
  HEALTH: 'health',
  WEBHOOK_EMAIL_INBOUND: 'webhooks/email/inbound',

  INQUIRIES: 'inquiries',
  INQUIRY_BY_ID: (id: string) => `inquiries/${id}`,
  INQUIRY_MESSAGES: (id: string) => `inquiries/${id}/messages`,
  INQUIRY_THREAD: (id: string) => `inquiries/${id}/thread`,
  INQUIRY_ALLOWED_TRANSITIONS: (id: string) => `inquiries/${id}/allowed-transitions`,
  INQUIRY_TRANSITIONS: (id: string) => `inquiries/${id}/transitions`,

  CUSTOMERS: 'customers',
  CUSTOMER_BY_ID: (id: string) => `customers/${id}`,
  CUSTOMER_INQUIRIES: (id: string) => `customers/${id}/inquiries`,
  CUSTOMER_STATUS_LOG: (id: string) => `customers/${id}/status-log`,

  MESSAGES: 'messages',
  MESSAGE_BY_ID: (id: string) => `messages/${id}`,

  CONTEXT_SNAPSHOTS: 'context-snapshots',
  INQUIRY_CONTEXT_SNAPSHOTS: (id: string) => `inquiries/${id}/context-snapshots`,
  CONTEXT_SNAPSHOT_BY_ID: (id: string) => `context-snapshots/${id}`,

  DRAFTS: 'drafts',
  INQUIRY_DRAFTS: (id: string) => `inquiries/${id}/drafts`,
  DRAFT_BY_ID: (id: string) => `drafts/${id}`,
} as const;
```

### 8.2 公共响应类型

```ts
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiListResponse<T> {
  success: true;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

### 8.3 是否会影响现有项目

直接抽公共包影响较小，原因是：

```text
1. 路由常量是纯 TS，不涉及运行时服务。
2. 前后端可以逐步迁移，不需要一次性改完。
3. 先建立 shared 包，不会改变现有接口行为。
4. 最大风险是 tsconfig / workspace 引用配置，需要一次 typecheck 验证。
```

建议实施时先只放：

```text
api-routes.ts
api-response.ts
```

不要一开始把大量业务 DTO 都塞进 shared，等接口稳定后再抽。

## 9. 分阶段实施建议

```text
阶段一：公共包与响应格式
  - 建立 packages/shared
  - 抽 ROUTES
  - 抽 ApiSuccessResponse / ApiListResponse / ApiErrorResponse
  - 调整前端 fetchInquiries 读取 data
  - 后端列表接口逐步统一 data/total/page/limit

阶段二：邮件线程
  - GET /api/inquiries/:id/messages
  - GET /api/messages/:id
  - GET /api/inquiries/:id/thread

阶段三：客户管理
  - GET /api/customers
  - GET /api/customers/:id
  - GET /api/customers/:id/inquiries
  - PATCH /api/customers/:id
  - GET /api/customers/:id/status-log

阶段四：AI 上下文
  - GET /api/inquiries/:id/context-snapshots
  - GET /api/context-snapshots/:id

阶段五：AI 回复草稿
  - GET /api/inquiries/:id/drafts
  - GET /api/drafts/:id
  - POST /api/inquiries/:id/drafts 预留，暂不实现
```

