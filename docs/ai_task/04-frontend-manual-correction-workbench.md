# 04 前端任务：人工校正工作台

## 背景

后端已经提供基础人工校正接口：

- `PATCH /customers/:id`
- `PATCH /inquiries/:id`
- `POST /inquiries/:id/messages`
- `POST /inquiry-messages/:id/move`
- `POST /inquiries/:id/transitions`

前端目前主要是只读工作台，缺少操作入口。

## 整改目标

在前端实现询盘人工校正能力：

- 编辑业务主题。
- 锁定业务主题。
- 修改主联系人。
- 修改联系人所属组织。
- 关联已有邮件。
- 移动错误关联邮件。
- 修改询盘状态。

## 整改思路

优先在询盘详情页做操作，不要一开始做复杂全局管理后台。

推荐页面结构：

```text
询盘详情
  ├── 基本信息
  │   ├── 业务主题 [编辑] [锁定]
  │   ├── 状态 [流转]
  │   ├── 组织 [修改]
  │   └── 主联系人 [修改]
  ├── 邮件时间线
  │   ├── 每封邮件 [移动到其他询盘]
  │   └── [关联已有邮件]
  └── AI 上下文 / AI 决策 / 草稿入口
```

## 建议组件

```text
InquirySubjectEditor.vue
InquiryStatusTransitionDialog.vue
CustomerOrganizationEditor.vue
LinkExistingEmailDialog.vue
MoveInquiryMessageDialog.vue
```

## 建议实施步骤

1. 在 `apps/admin-web/src/api/backend.ts` 增加对应请求函数。
2. 在 shared 类型中补充请求/响应类型。
3. 在询盘详情页增加：
   - 编辑主题按钮。
   - 锁定开关。
   - 状态流转按钮。
   - 主联系人选择入口。
   - 组织选择入口。
4. 在邮件时间线每封邮件上增加“移动”按钮。
5. 增加“关联已有邮件”弹窗：
   - 可按邮箱、主题、时间搜索邮件。
   - 选择后调用 `POST /inquiries/:id/messages`。
6. 操作完成后刷新当前详情和邮件时间线。
7. 加载、错误、空状态都要处理。

## 验收标准

- 能在前端编辑业务主题，并刷新后保持。
- 锁定业务主题后显示锁定状态。
- 能执行状态流转，并显示状态变化。
- 能把联系人绑定到组织。
- 能把一封邮件从询盘 A 移动到询盘 B。
- 移动后询盘 A 时间线不再显示该邮件。
- 失败请求能显示错误提示。
- `pnpm.cmd --filter @email-inquiry/admin-web typecheck` 通过。
- `pnpm.cmd --filter @email-inquiry/admin-web build` 通过。

## 注意事项

- 不要在前端直接修改状态字段，状态流转必须调用 `transitions` 接口。
- 删除/移动邮件必须有确认弹窗。
- 移动邮件不是删除邮件，必须保留审计信息。
- 当前阶段不做自动发邮件。
