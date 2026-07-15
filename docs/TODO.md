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

## 询盘状态模型与双向邮件流转整改

### 已确认的问题

- 入站 AI 决策和出站邮件事件都可以修改 `inquiry_cases.status`，但两条策略并不对称。
- 入站自动流转策略拒绝了合理的业务前进：
  - `need_engineer_review -> ready_for_quote`
  - `waiting_customer -> ready_for_quote`
- 同一策略却允许 `waiting_customer -> need_engineer_review`，导致客户接受价格或回传签署合同时，询盘可能自动退回工程评审。
- 出站策略目前把 `humanReviewRequired` 和 `commercialBoundaryDetected` 当作提示字段；满足置信度、风险和状态机条件时仍可能直接执行状态变更。
- 前端已分开展示“客户入站分析”和“我方出站事件”，但人工审核能力仍不对称：
  - 出站 `email_workflow_decisions` 有独立的应用/拒绝入口。
  - 入站 `ai_decisions` 尚无对称的人工应用/拒绝入口。
  - “人工状态校正”是独立的通用状态机操作，不代表应用某一条 AI 建议。

### 状态建模待决策

- 评估是否继续用单一 `status` 同时表达“业务阶段”和“当前等待方”。
- 推荐评估拆分：
  - `business_stage`: technical_review / quotation / contract / completed。
  - `action_owner`: us / customer / none。
- 如果短期仍保留单一状态，至少需要：
  - 禁止 AI 自动执行无明确依据的阶段回退。
  - 为合理的 `waiting_customer -> ready_for_quote` 增加受控策略。
  - 明确技术方案、交期确认、价格确认、正式报价、合同发送、合同签署对应的状态语义。
  - 为合同签署或成交增加明确状态，例如 `contract_signed` / `won`；避免使用含义模糊的 `closed`。
  - 明确 `ready_for_quote -> waiting_customer` 等“业务阶段前进但等待方变化”的表达方式。

### 执行策略整改

- 入站和出站决策都需要保存：决策来源、分析时状态、建议状态、执行状态和执行原因。
- 自动执行前增加阶段回退保护；回退默认转为待人工确认。
- 正式报价、合同发送、合同签署、关闭和无效等高影响事件应有明确的人工/自动边界。
- 入站 `ai_decisions` 增加应用/拒绝接口和前端操作，与出站事件审核保持对称。
- 保留“人工状态校正”作为独立能力，仍必须经过状态机、填写原因并记录审计日志。
- 决策应用继续使用条件更新，避免覆盖并发到达的邮件或人工操作。

### 回归验收场景

使用已复现的 9 封邮件时间线建立集成测试：

1. 客户提交完整参数。
2. 我方发送技术方案。
3. 客户确认产品。
4. 我方询问交期接受情况。
5. 客户接受交期。
6. 我方发送价格并要求确认。
7. 客户接受方案和价格。
8. 我方发送合同并要求签署。
9. 客户回传已签合同。

验收要求：

- 状态不得在客户接受价格或回传合同时退回 `need_engineer_review`。
- 每封参与状态判断的邮件都有对应决策记录。
- 状态日志能还原业务时间线，而不仅是系统处理时间线。
- 最终状态与合同已签署的业务事实一致。

## 历史邮件事件补偿与状态时间线恢复（暂缓，独立阶段）

### 当前缺口

- 本阶段只处理功能上线后新进入系统的邮件，没有扫描和重放数据库中的历史邮件事件。
- 从引用历史恢复的邮件使用 `source=system_detected`、`relation_type=related_context` 入库，目前只进入上下文，不进入统一事件处理。
- 已存在的历史出站邮件可能没有 `email_workflow_decisions`。
- 历史入站邮件可能有 `ai_decisions`，但分析时使用的是后来的询盘状态，无法保证符合邮件发生时的真实状态。
- 人工补录且早于 `latestMessageAt` 的邮件目前标记为 `historical_backfill`，不会自动修正当前状态；历史状态链仍可能缺段。

### 补偿方案设计要求

- 单独实现历史补偿服务，不把批量重放逻辑继续堆入 IMAP 轮询用例。
- 先提供只读扫描/报告模式，列出：
  - 缺失入站 AI 决策的邮件。
  - 缺失出站工作流决策的邮件。
  - `system_detected` 恢复邮件。
  - 决策执行顺序与 `received_at` 不一致的记录。
  - 状态日志缺失、回退异常和当前状态不一致的询盘。
- 重放必须严格按 `email_messages.received_at ASC`，相同时间再使用稳定次序。
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
- 补偿后 `inquiry_status_logs`、决策表和 `inquiry_cases.status` 相互一致。
