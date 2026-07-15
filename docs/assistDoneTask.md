# 已完成任务清单

## 1. 引用历史邮件补录（Quoted Email Recovery）

### 背景
当系统收到回复/转发邮件时，`EmailContentSanitizer` 会检测并移除正文中的历史引用部分。这些被移除的引用内容中可能包含系统从未直接收到的邮件（如 CC 遗漏）。

### 改动文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `email-source.enum.ts` | 修改 | 新增 `SYSTEM_DETECTED = 'system_detected'` |
| `inbound-email.vo.ts` | 修改 | 新增 `inReplyTo`、`references` 字段 |
| `email-content-sanitizer.ts` | 修改 | `sanitize()` 返回 `{ cleaned, quotedHistory }` 结构体，`stripQuotedHistory` 同时返回被移除的引用文本 |
| `email-content-sanitizer.spec.ts` | 修改 | 适配新返回类型，补充 `quotedHistory` 断言 |
| `imap-poll.service.ts` | 修改 | 构建 InboundEmail 时传入 `inReplyTo`、`references` |
| `email-quote-recovery.service.ts` | **新增** | 引用文本解析器，从 QQ 邮箱/英文格式的归属行提取发件人、时间、正文 |
| `receive-inbound-email.use-case.ts` | 修改 | 集成恢复流程：`tryRecoverMissingEmail()` → 查库 → `recoverParentEmailFromQuote()` → 入库 → `linkRecoveredEmailsToInquiry()` |
| `own-email-address.ts` | — | 已有 `isOwnEmail()` 判断恢复邮件的方向 |
| `docs/TODO.md` | 修改 | 追加 Phase 1 调试日志清理 + `node --watch` 冲突方案 |

### 核心流程
```
当前邮件.inReplyTo → 查 email_messages.message_id
  ├─ 命中 → 已记录，跳过
  └─ 未命中 → recoverParentEmailFromQuote()
       ├─ 解析引用文本首行（发件人、时间）
       ├─ 提取 > 正文
       └─ save as system_detected + link RELATED_CONTEXT
```

### 关键修复
- `emailThreadId: thread.id` 替代 `threadId: thread.id`，避免 Prisma 仓库 upsert 创建孤儿线程
- 恢复邮件不设 `threadId`，通过 `externalMessageId(=inReplyTo)` 自动匹配已存在线程

---

## 2. API 接口拆分（前端）

### 改动
| 文件 | 说明 |
|------|------|
| `src/api/backend.ts` | 改为统一 re-export 入口 |
| `src/api/health.ts` | 新增 |
| `src/api/inquiry.ts` | 新增 |
| `src/api/customer.ts` | 新增 |
| `src/api/thread.ts` | 新增 |
| `src/api/context.ts` | 新增 |
| `src/api/ai-record.ts` | 新增 |
| `src/api/shared.ts` | 新增（`ListParams`、`fetchPage`、`fetchItem`） |

拆分规则：按前端路由一对一映射。所有 `.vue` 的导入路径 `@/api/backend` 保持不变。

---

## 3. 引用历史评分规则文档化

更新 `docs/邮件处理数据流转流程图.md`：
- 流程图 `ReceiveInboundEmailUseCase.execute()` 中展开"清洗正文"为三步骤（HTML→纯文本、引用历史评分移除、签名移除）
- 函数清单中补充 `scoreQuoteBoundary` 阈值 70 的备注

---

## 4. 前端 3D 状态模型整改

### 新增文件
| 文件 | 说明 |
|------|------|
| `src/types/inquiry-state.ts` | 本地 3D 状态类型定义（`InquiryBusinessStage`、`InquiryActionOwner`、`InquiryLifecycleStatus`） |
| `src/api/inquiry-state.ts` | 状态决策 API 封装（`fetchStateDecisions`、`applyStateDecision`、`rejectStateDecision`、`submitStateCorrection`、`fetchBusinessEvents`、`fetchStateTransitions`） |

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/api/backend.ts` | 新增 re-export |
| `src/views/InquiryListView.vue` | 移除旧 `status` 筛选，替换为 `businessStage`/`actionOwner`/`lifecycleStatus` 三组筛选；表格列从"状态"改为三列 |
| `src/views/InquiryDetailView.vue` | 移除旧 `allowedTransitions`/`doTransition()`；侧栏展示三维状态 + 校正按钮；聚合视图展示最新状态决策 + 状态流转记录 + 业务事件；状态记录 Tab 展示全部决策 |
| `src/stores/workbench.store.ts` | 适配 3D 状态字段 |
| `src/views/WorkbenchView.vue` | 替换 `StatusPill` 为生命周期 Badge |
| `src/lib/format.ts` | `jsonPreview` 新增递归 JSON 解码 + 200 字符行限制 |

### 待共享类型补齐
用户自行补齐 `packages/shared` 后需更新：
- `InquiryBusinessStage` / `InquiryActionOwner` / `InquiryLifecycleStatus` 类型
- 对应的标签映射（可迁移 `src/types/inquiry-state.ts` 内容）
- `InquiryListItem` 中 `status` 替换为 `businessStage`/`actionOwner`/`lifecycleStatus`/`stateVersion`
- `counts` 中 `aiDecisions` → `analysisDecisions`，`statusLogs` → `stateTransitions`
