# AI 后续任务包索引

本文档目录用于把后续整改拆成多个可独立交付的任务包。每个任务文件都包含：

- 当前背景
- 整改目标
- 整改思路
- 建议实施步骤
- 验收标准
- 注意事项

## 当前已完成基线

截至当前提交，项目已经完成：

- PostgreSQL + Prisma 持久化基础。
- `organizations` 组织模型。
- `customers` 联系人模型，并支持 `organization_id`。
- `inquiry_cases` 业务主题字段：`raw_subject / business_subject / business_subject_source / business_subject_locked`。
- 企业邮箱域名自动组织归并第一版。
- 公共邮箱不作为自动组织归并键，但仍可创建客户和询盘。
- 人工校正后端接口第一版：
  - `PATCH /customers/:id`
  - `PATCH /inquiries/:id`
  - `POST /inquiries/:id/messages`
  - `POST /inquiry-messages/:id/move`
- AI 上下文已改为结构化 payload，并且 `inquiryState.subject` 优先读取 `business_subject`。
- 后端 `typecheck / test / build` 已通过。

## 推荐执行顺序

1. [01-backend-manual-email-import.md](./01-backend-manual-email-import.md)
2. [02-ai-business-subject-generation.md](./02-ai-business-subject-generation.md)
3. [03-inquiry-thread-read-api.md](./03-inquiry-thread-read-api.md)
4. [04-frontend-manual-correction-workbench.md](./04-frontend-manual-correction-workbench.md)
5. [05-frontend-thread-and-context-pages.md](./05-frontend-thread-and-context-pages.md)
6. [06-organization-customer-management.md](./06-organization-customer-management.md)
7. [07-historical-data-correction-tools.md](./07-historical-data-correction-tools.md)
8. [08-regression-and-acceptance-checklist.md](./08-regression-and-acceptance-checklist.md)

## 分工建议

- 后端 AI 优先执行 01、02、03、06、07。
- 前端 AI 优先执行 04、05。
- 测试/审计 AI 执行 08。

每个任务完成后应单独提交，避免一个提交里混合数据库、后端接口、前端页面和文档更新。
