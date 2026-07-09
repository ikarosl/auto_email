# 02 后端任务：AI 生成业务主题

## 背景

当前 `inquiry_cases` 已经有：

```text
raw_subject
business_subject
business_subject_source
business_subject_locked
business_subject_updated_at
```

AI 上下文中的 `inquiryState.subject` 已经优先读取 `business_subject`。

但目前 `business_subject` 仍然主要由原始邮件标题兜底，没有 AI 生成逻辑。网站表单邮件常见标题如“你有一个网站表单提交的新询盘”，会降低前端和 AI 上下文可读性。

## 整改目标

实现 AI 业务主题生成：

- 新询盘创建后，如果业务主题未锁定，允许 AI 根据邮件正文和上下文生成简短业务主题。
- AI 生成结果写入 `inquiry_cases.business_subject`。
- `business_subject_source = ai_generated`。
- 人工锁定后，AI 不再覆盖。

## 整改思路

业务主题不是询盘状态，不涉及状态机流转，可以作为 AI 辅助更新字段。但仍需要边界：

- 只生成标题，不改变询盘状态。
- 不覆盖 `business_subject_locked = true` 的记录。
- 原始标题保留在 `raw_subject` 和 `email_messages.subject`。

推荐单独抽象：

```text
BusinessSubjectGeneratorPort
  └── DeepseekBusinessSubjectGenerator

GenerateBusinessSubjectUseCase
  └── 输入 inquiryCase + currentEmail + recentThreadMessages
  └── 输出 string
```

## 提示词建议

系统提示词：

```text
You generate concise business subjects for RF/microwave product inquiry cases.
Return only JSON.
Do not include customer private data unless required.
Do not infer unsupported product details.
The subject should describe the actual business need, not the email transport title.
```

用户 payload 示例：

```json
{
  "rawSubject": "你有一个网站表单提交的新询盘",
  "currentEmailBody": "We need a 12-15GHz microstrip isolator, 20W CW, quantity 50 pcs.",
  "knownFacts": {
    "productType": "microstrip isolator",
    "frequencyRange": "12-15GHz",
    "quantity": "50 pcs"
  }
}
```

输出 schema：

```json
{
  "businessSubject": "12-15GHz microstrip isolator inquiry",
  "confidence": 0.92,
  "reason": "Subject derived from product type and frequency range in the email body."
}
```

## 建议实施步骤

1. 新增 Zod schema 校验 AI 输出。
2. 新增 generator port 和 Deepseek adapter。
3. 新增 use case：`GenerateBusinessSubjectUseCase`。
4. 在邮件 AI 分析成功后调用，或在新询盘创建后调用。
5. 如果 `businessSubjectLocked = true`，直接跳过。
6. 如果 AI 输出为空、过长或校验失败，保留原主题不报错。
7. 写入数据库：
   - `business_subject`
   - `business_subject_source = ai_generated`
   - `business_subject_updated_at = now`
8. Debug 日志中记录生成输入和输出，但不提交真实日志。

## 验收标准

- 网站表单标题不会继续作为前端主业务主题。
- `business_subject` 能变成类似 `12-15GHz microstrip isolator inquiry`。
- 人工锁定后，后续新邮件不会覆盖该字段。
- AI 生成失败不阻断邮件入库和询盘分析。
- `raw_subject` 保留原始标题。
- `pnpm.cmd --filter @email-inquiry/backend typecheck` 通过。
- `pnpm.cmd --filter @email-inquiry/backend test` 通过。

## 注意事项

- 不要把 `recentThreadMessages[].subject` 改成 AI 生成标题，邮件标题是证据字段。
- 不要让 AI 业务主题生成修改询盘状态。
- 不要生成营销式标题，保持业务对象描述即可。
