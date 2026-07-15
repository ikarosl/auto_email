# TODO

## Phase 1 调试日志清理

文件 `apps/backend/src/modules/email/application/use-cases/receive-inbound-email.use-case.ts` 中：

- `writeQuotedRecoveryDebugLog()` 函数（第 ~69 行调用 + 底部函数定义）
- `QUOTED_RECOVERY_DEBUG_LOG_PATH` 常量
- `QuotedRecoveryDebugEntry` 接口
- `extractMessageIdsFromText()` 函数
- `truncatePreview()` 函数

以上均为 Phase 1 调试所用，Phase 2 实现完成后应移除。
日志文件 `apps/backend/logs/quoted-recovery-debug.jsonl` 也可清理。

清理时机：确认恢复逻辑稳定运行后。

## `node --watch` 两个进程冲突

### 问题

`dev` 脚本使用 `tsc build && node --watch dist/main.js`。文件变更 → tsc 重编译 → `node --watch` 检测到 dist 变化就拉起新进程，此时旧进程尚未释放端口/IMAP 连接，导致两个进程冲突。

### 解决方案

在 `apps/backend/package.json` 中新增 `predev` 钩子，每次 `dev` 启动前先杀掉占用 3003 端口的旧进程：

```jsonc
{
  "scripts": {
    "predev": "powershell -Command \"Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process $_.OwningProcess -Force }\"",
    "dev": "pnpm --filter @email-inquiry/shared build && tsc -p tsconfig.build.json && node --watch dist/main.js"
  }
}
```

`predev` 是 pnpm 生命周期钩子，每次 `dev` 运行前自动执行。

### 注意事项

- 只杀 3003 端口（NestJS HTTP），IMAP 连接随进程一起释放
- 如果 API_PORT 改了，需要同步修改 LocalPort 值
- Windows 专用（`Get-NetTCPConnection` + `Stop-Process`），Linux/Mac 需改用 `lsof -ti:3003 | xargs kill`

## 历史邮件事件补偿与状态时间线恢复

### 当前缺口

- 在线入站、出站、人工补录和系统发送已经统一写入 `email_analysis_decisions`、`inquiry_business_events`、`inquiry_state_decisions` 和 `inquiry_state_transitions`。
- 引用历史只缺少一个可信直接父邮件时，已经支持按 `parent -> child` 即时回放，并通过 `email_recovery_records.replay_run_id` 关联两次决策。
- 不满足即时回放安全条件的恢复邮件只进入上下文，并将当前决策标记为 `baselineIncomplete=true`。
- 已新增询盘级 `ReplayInquiryTimelineUseCase`，首先用于多产品误判后从 `manual` 恢复 `automatic`。
- 回放按单个 `inquiryCaseId` 执行；不需要全库扫描或全库调度。
- 尚未把邮件人工移动后的源/目标询盘，以及多封缺失引用邮件恢复接入该回放入口。
- 人工补录且早于 `latestMessageAt` 的邮件会生成 `historical_backfill` 决策，但不会直接覆盖当前三维状态。

### 补偿方案设计要求

- 复用询盘级历史补偿服务，不把重放逻辑继续堆入 IMAP 轮询或邮件移动接口。
- 后续为单个询盘提供差异报告，列出：
  - 缺失入站 AI 决策的邮件。
  - 缺失出站工作流决策的邮件。
  - `system_detected` 恢复邮件。
  - 决策执行顺序与 `received_at` 不一致的记录。
  - 状态日志缺失、回退异常和当前状态不一致的询盘。
- 重放排序优先保证引用关系 `parent -> child`，再按 `email_messages.received_at ASC` 和稳定键排序。
- 每次历史分析只能读取该邮件时间点及之前的上下文，禁止看到未来邮件。
- 补偿使用独立幂等键和版本号，重复执行不得重复创建决策或状态日志。
- 默认只生成补偿建议和模拟状态时间线，不直接覆盖线上 `inquiry_cases.status`。
- 人工确认后再以事务方式修复状态日志和最终状态，并保存补偿批次、操作者、前后值和原因。
- 已人工修改、已锁定或存在并发新邮件的询盘必须跳过自动修复。

### `system_detected` 邮件处理

- 明确引用恢复邮件是否足以作为真实业务事件；正文、发件人和时间可信度不足时只能作为上下文。
- 可信度满足要求时生成工作流决策，但历史恢复邮件默认标记 `historical_backfill`，不直接改变当前状态。
- 增加恢复来源、父邮件、解析置信度和引用证据审计，避免伪造一封并不存在的完整邮件事件。

### 补偿阶段验收标准

- 可按询盘生成“原状态日志”和“按邮件时间重建的建议状态线”对比报告。
- 可解释每一个偏差来自缺失事件、AI 判断、策略拒绝、状态机拒绝还是人工修改。
- 只读扫描可重复执行且不修改业务数据。
- 人工批准的补偿可重复执行且保持幂等。
- 补偿后 `inquiry_state_transitions`、决策表和 `inquiry_cases` 三维状态相互一致。
