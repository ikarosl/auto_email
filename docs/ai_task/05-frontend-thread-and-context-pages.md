# 05 前端任务：邮件线程与上下文快照页面完善

## 背景

当前前端已有只读工作台雏形，但邮件线程和上下文快照页面还需要面向实际排查场景增强。

这两个页面是判断系统是否“吃对上下文”的关键。

## 整改目标

完善前端页面：

- 邮件线程页面显示询盘聚合时间线。
- 单封邮件能展开原文和清洗正文。
- 上下文快照页面同时展示：
  - 可读 `contextPayload`
  - 最终 Chat API `messages`
  - AI 输出
  - sourceReferences
- 明确高亮当前邮件和历史邮件。

## 整改思路

邮件线程页面服务业务人员和开发排查，上下文快照页面主要服务开发排查。

页面应避免把 JSON 全塞进一个大文本框。建议分区展示：

```text
contextPayload
  inquiryState
  threadSummary
  recentThreadMessages
  currentEmail
  ragReferences
  outputInstruction
```

## 邮件线程页面建议布局

```text
左侧：询盘列表
右侧：询盘详情 + 邮件时间线
```

每封邮件卡片显示：

- direction badge
- source badge
- from/to
- subject
- receivedAt
- bodyText preview
- relationType
- 操作按钮：查看详情、移动、查看上下文

## 上下文快照页面建议布局

```text
左侧：快照列表
右侧：
  Tab 1: 结构化上下文
  Tab 2: Chat messages
  Tab 3: AI 输出
  Tab 4: sourceReferences
```

## 建议实施步骤

1. 接入 `GET /inquiries/:id/thread`。
2. 接入 `GET /inquiries/:id/messages`。
3. 接入 `GET /messages/:id`。
4. 上下文快照详情优先展示 `contextPayload`，不要只展示转义 JSON 字符串。
5. 对 `recentThreadMessages` 按时间升序渲染。
6. `currentEmail` 单独渲染，并加高亮边框。
7. 对 `threadSummary` 单独渲染，不混入邮件列表。

## 验收标准

- 用户能在一个页面看清某询盘完整沟通时间线。
- 当前邮件不会混入历史邮件列表。
- 邮件顺序按 `receivedAt asc`。
- 上下文详情能清楚区分 system prompt、payload、messages。
- JSON 渲染可折叠或格式化，不出现大片不可读转义字符串。
- `pnpm.cmd --filter @email-inquiry/admin-web typecheck` 通过。
- `pnpm.cmd --filter @email-inquiry/admin-web build` 通过。

## 注意事项

- 不要用 `EmailMessage ID` 作为主视觉。
- 业务人员页面优先显示业务主题和客户信息。
- 开发调试字段可以折叠。
- 不要把 AI 建议状态当成已执行状态展示。
