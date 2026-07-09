# 07 后端任务：历史数据校正工具

## 背景

自动归并规则完善前，数据库里可能已经存在：

- 同一公司多个联系人被拆成多个询盘。
- 广告邮件创建了客户和询盘。
- 某个询盘下混入无关邮件。
- 网站表单标题作为业务主题。

当前计划不做自动合并历史脏数据，但需要工具支持人工逐步校正。

## 整改目标

提供历史校正工具：

- 查找疑似同组织重复询盘。
- 查找公共邮箱但可能属于某组织的联系人。
- 查找无效客户和无效询盘。
- 批量补充 `raw_subject/business_subject`。
- 生成校正建议报告，但不自动执行破坏性操作。

## 整改思路

先做“报告型工具”，不做自动修改。

推荐命令：

```text
pnpm --filter @email-inquiry/backend data:audit
```

输出：

```text
docs/reports/data-audit-YYYYMMDD.md
```

或 `apps/backend/logs/data-audit.jsonl`。

## 建议检查项

1. 同企业域名 2 个月内多个打开询盘。
2. 业务主题等于网站表单通用标题。
3. `customers.status = invalid` 但仍有打开询盘。
4. `inquiry_messages` 中同一邮件关联多个询盘。
5. 公共邮箱联系人正文/签名中出现公司域名。
6. 没有 `business_subject` 的询盘。

## 验收标准

- 能运行命令生成报告。
- 报告只读，不修改数据库。
- 报告包含 inquiryCaseId、customerEmail、organizationId、原因、建议操作。
- 能帮助人工定位需要移动邮件或合并询盘的记录。
- `pnpm.cmd --filter @email-inquiry/backend typecheck` 通过。

## 注意事项

- 不要自动合并询盘。
- 不要自动删除客户。
- 不要自动修改历史邮件关联。
- 后续如果做自动修复，必须另开任务并增加确认参数。
