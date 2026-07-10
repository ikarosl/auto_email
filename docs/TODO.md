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
