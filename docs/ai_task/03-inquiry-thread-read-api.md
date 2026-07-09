# 03 后端任务：询盘线程聚合读取接口

## 背景

当前已有邮件线程和询盘基础查询接口，但前端要做“询盘详情时间线”时，还需要更直接的聚合接口。

目标页面需要看清：

- 当前询盘信息。
- 联系人和组织信息。
- 所有关联邮件，按时间升序。
- AI 最新判断。
- 上下文快照。
- 草稿。
- 允许的状态流转。

## 整改目标

实现以下查询接口：

```text
GET /api/inquiries/:id/messages
GET /api/messages/:id
GET /api/inquiries/:id/thread
```

后端实际路由不带 `/api` 前缀。

## 整改思路

三个接口层次不同：

```text
/inquiries/:id/messages
  只返回该询盘关联邮件列表，适合时间线分页。

/messages/:id
  返回单封邮件完整详情，适合查看原文、清洗正文、元数据。

/inquiries/:id/thread
  返回询盘页面聚合数据，减少前端多次请求。
```

## 建议响应字段

### GET /inquiries/:id/messages

```json
{
  "success": true,
  "data": [
    {
      "inquiryMessageId": "inquiry_message_xxx",
      "emailMessageId": "email_xxx",
      "relationType": "reply",
      "relationReason": "manual correction reason",
      "direction": "inbound",
      "source": "imap",
      "fromEmail": "buyer@example.com",
      "fromName": "Buyer",
      "toEmails": [],
      "ccEmails": [],
      "subject": "RF inquiry",
      "bodyTextPreview": "We need...",
      "receivedAt": "2026-07-09T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

### GET /messages/:id

包含：

- 邮件基础字段。
- `bodyText`
- `bodyHtml`
- `rawSource`
- 关联的询盘列表。
- 最近 AI 判断。

### GET /inquiries/:id/thread

包含：

```json
{
  "inquiry": {},
  "organization": {},
  "customer": {},
  "primaryCustomer": {},
  "messages": [],
  "latestAiDecision": {},
  "latestContextSnapshot": {},
  "latestDraft": {},
  "allowedTransitions": []
}
```

## 建议实施步骤

1. 在 shared routes 中补充：
   - `messages`
   - `inquiryMessages`
   - 函数型路径可选。
2. 新增 `MessageController` 或在 email presentation 下扩展。
3. 在 `InquiryController` 新增：
   - `GET :id/messages`
   - `GET :id/thread`
4. 列表接口支持：
   - `page`
   - `limit`
   - `direction`
   - 默认按 `emailMessage.receivedAt asc`
5. 使用统一响应格式。
6. 更新 `packages/shared/src/types/api.ts`。

## 验收标准

- 询盘详情页只需调用 `/inquiries/:id/thread` 即可渲染核心信息。
- 邮件时间线按真实邮件时间升序。
- 被移动到其他询盘的邮件不再出现在原询盘 messages 中。
- 手动补录邮件也能出现在 messages 中。
- 单封邮件详情能看到清洗正文和原始 HTML。
- `pnpm.cmd --filter @email-inquiry/backend typecheck` 通过。
- `pnpm.cmd --filter @email-inquiry/backend test` 通过。

## 注意事项

- 不要把 `email_threads` 和 `inquiry_messages` 混为一个概念。
- 一个询盘可以跨多个邮件线程。
- 一个邮件线程也可能被人工拆分到不同询盘。
