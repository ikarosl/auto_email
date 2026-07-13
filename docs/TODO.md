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
