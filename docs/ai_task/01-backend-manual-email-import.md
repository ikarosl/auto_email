# 01 后端任务：手动补录邮件完整链路

## 背景

当前后端已经预留：

- `EmailSource.MANUAL`
- `InquiryMessageRelationType.MANUAL_IMPORT`
- `POST /inquiries/:id/messages` 中 `mode = create_manual_email` 的入口，但目前会返回预留错误。

还没有真正实现“业务人员手动补录一封真实沟通邮件”的完整链路。

## 整改目标

实现手动补录邮件：

- 写入 `email_messages`。
- `source = manual`。
- 不写入 `processed_emails`。
- 不影响 IMAP 同步游标。
- 必须绑定目标询盘。
- 能进入后续 AI 上下文时间线。

## 整改思路

手动补录邮件不是 IMAP 邮件，所以不要复用 IMAP processed 逻辑。它应该被视为一个人工创建的 `EmailMessage`，并通过 `InquiryMessage` 关联到指定询盘。

推荐链路：

```text
POST /inquiries/:id/messages
  mode = create_manual_email
    -> validate inquiry exists
    -> create email_messages(source=manual)
    -> create inquiry_messages(relation_type=manual_import)
    -> update inquiry.latest_message_at
```

## 建议接口

复用已有接口：

```http
POST /api/inquiries/:id/messages
```

请求示例：

```json
{
  "mode": "create_manual_email",
  "direction": "inbound",
  "fromEmail": "buyer@example.com",
  "fromName": "Buyer",
  "toEmails": ["sales@hzbeat.com"],
  "ccEmails": [],
  "subject": "Manual imported RF inquiry note",
  "bodyText": "Customer confirmed the quantity by phone: 50 pcs.",
  "receivedAt": "2026-07-09T10:00:00.000Z",
  "relationReason": "电话沟通后人工补录",
  "changedBy": "operator@example.com"
}
```

响应使用统一格式：

```json
{
  "success": true,
  "data": {
    "emailMessage": {},
    "inquiryMessage": {}
  },
  "total": 1,
  "page": 1,
  "limit": 1
}
```

## 建议实施步骤

1. 扩展 `LinkInquiryMessageDto`，增加 `create_manual_email` 所需字段。
2. 在 `InquiryController.linkMessage` 中实现 `create_manual_email` 分支。
3. 创建 `email_messages` 时：
   - `source = manual`
   - `message_id` 可使用 `manual_${uuid}` 或空值。
   - `mailbox_account_id` 可用当前系统 mailbox，或允许为空，优先沿用现有 repository 的保存习惯。
   - `email_thread_id` 可为空，或者后续再补线程解析。
4. 创建 `inquiry_messages`：
   - `relation_type = manual_import`
   - `created_by_type = human`
   - `created_by = changedBy`
   - `relation_reason = relationReason`
5. 更新目标询盘：
   - `latest_message_at = max(existing latest, receivedAt)`
   - `updated_at = now`
6. 更新 `docs/router.md` 和 `packages/shared` 类型。

## 验收标准

- 手动补录邮件后，`email_messages.source = manual`。
- `processed_emails` 没有新增记录。
- `mailbox_sync_states` 没有变化。
- `inquiry_messages.relation_type = manual_import`。
- 询盘详情能查到该邮件。
- 后续构建 AI 上下文时，该邮件出现在 `recentThreadMessages`。
- `pnpm.cmd --filter @email-inquiry/backend typecheck` 通过。
- `pnpm.cmd --filter @email-inquiry/backend test` 通过。

## 注意事项

- 不要调用 IMAP processed tracker。
- 不要伪造 UID / uidValidity。
- 不要让手动邮件触发“新询盘自动创建”。
- 当前阶段不实现附件补录，附件后续独立任务处理。
