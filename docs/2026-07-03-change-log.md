# 2026-07-03 改动日志

## 建议提交信息

```text
增强 AI 上下文结构、邮件清洗与 IMAP 源数据调试
```

## 改动概览

今天主要完成三类改动：将 AI 输入上下文从多段自然语言窗口改为结构化 JSON；增强邮件历史引用清洗规则；增加 IMAP 拉取源数据日志，便于对照后端设计和排查解析问题。

## 主要改动

### 1. AI 上下文结构化

- 将发送给 AI 的上下文从 7 段自然语言消息改为 2 段消息：
  - `system`：系统规则、身份、输出要求。
  - `user`：结构化 JSON payload。
- 新增 AI 输入上下文 schema 与 TS 类型：
  - `AiEmailAnalysisContextPayload`
  - `AiEmailThreadMessageContext`
  - `AiEmailCurrentMessageContext`
  - `AiEmailRagReferenceContext`
- 新结构包含：
  - `inquiryState`
  - `recentThreadMessages`
  - `ragReferences`
  - `currentEmail`
  - `outputInstruction`
- `recentThreadMessages` 统一按 `receivedAt` 升序排列，并排除当前邮件。
- 移除 AI prompt 中的内部噪音字段：
  - `EmailMessage ID`
  - `inquiryCaseId`
  - `approximate budget tokens`
  - `Context section`
- 内部 ID 仍保留在 snapshot / debug metadata / sourceReferences 中，便于追踪。

### 2. 邮件历史引用清洗增强

- 增强邮件正文清洗器对历史引用的识别能力。
- 新增“回复归因行”组合判断：
  - 同一行包含邮箱地址。
  - 同一行包含日期或时间信号。
  - 同一行包含回复动词信号。
- 覆盖常见回复标志：
  - `wrote`
  - `写道`
  - `ha scritto`
  - `a écrit`
  - `escribió`
  - `escreveu`
  - `schrieb`
  - `napisał / napisała`
  - `schreef`
  - `書きました`
  - `작성`
- 保留“宁可多保留历史，不误删正文”的原则：
  - 单独出现邮箱和日期不会直接截断。
  - 必须组合命中回复归因特征。

### 3. IMAP 源数据调试日志

- 新增 IMAP 源数据日志 helper。
- 每次后端从 IMAP 拉取邮件后，追加写入：
  - `apps/api/logs/email.txt`
- 日志内容包含：
  - `rawSourceBase64`
  - `rawSourceUtf8LossyForDebug`
  - `parsedEmail`
  - `uid`
  - `uidValidity`
  - `mailbox`
  - `rawSizeBytes`
- 该日志用于判断：
  - 原始 MIME 数据是否正常。
  - `mailparser` 解析后的正文是否正常。
  - 清洗前的数据是否已经出现乱码或历史引用残留。

## 测试覆盖

- 新增 AI 上下文 payload schema 测试：
  - 合法 payload 可通过。
  - 非法 `direction` 会被拒绝。
  - 缺少 `currentEmail.cleanBody` 会被拒绝。
- 调整 AI 上下文构建测试：
  - 校验最终消息数量为 2。
  - 校验 `user.content` 可 JSON.parse。
  - 校验 payload 可通过 schema。
  - 校验历史线程按时间升序。
  - 校验当前邮件不会重复进入历史线程。
  - 校验 prompt 不包含内部 ID、预算文案和自然语言 section 标记。
- 增强邮件清洗测试：
  - 覆盖中文、英文、意大利语回复归因行。
  - 覆盖“有邮箱和日期但不是历史引用”的反例。

## 验证结果

已通过：

```text
pnpm.cmd --filter @email-inquiry/api typecheck
pnpm.cmd --filter @email-inquiry/api test
```

测试结果：

```text
49 tests
8 suites
49 pass
0 fail
```

## 涉及范围

- Context 模块：
  - AI 上下文构建逻辑
  - AI 输入 payload schema
  - 上下文构建单测
- Email 模块：
  - 邮件正文清洗器
  - 清洗器单测
  - IMAP 正式轮询入口
  - IMAP demo 入口
  - 源数据调试日志 helper

## 注意事项

- `apps/api/logs/email.txt`、AI debug log、sanitizer debug log 都可能包含真实邮件内容，仅用于本地开发调试，不应提交到仓库。
- 当前 AI 输出 schema 未改变，仍保持原有状态建议、置信度、缺失字段和结构化需求字段。
- 本次改动只优化 AI 输入上下文与调试能力，不实现 AI 自动发邮件，也不自动执行询盘状态流转。
