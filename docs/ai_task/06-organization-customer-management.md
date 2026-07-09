# 06 全栈任务：组织与客户管理增强

## 背景

当前已经有组织模型和客户模型：

```text
organizations
  └── customers
        └── inquiry_cases
```

但组织管理目前主要是只读，公共邮箱联系人也需要人工绑定组织。

## 整改目标

增强组织和客户管理：

- 组织列表和详情。
- 组织下联系人列表。
- 组织下询盘列表。
- 创建/编辑组织。
- 将联系人绑定到组织。
- 公共邮箱联系人支持人工归属组织。
- 联系人备注和公司信息维护。

## 整改思路

公共邮箱联系人不能自动用域名归并，但可以人工绑定组织。

操作链路：

```text
客户详情 -> 修改所属组织 -> 选择已有组织/新建组织 -> 保存
```

## 后端建议接口

```text
GET /organizations
GET /organizations/:id
POST /organizations
PATCH /organizations/:id
GET /organizations/:id/customers
GET /organizations/:id/inquiries
PATCH /customers/:id
```

其中 `PATCH /customers/:id` 已有基础能力，可继续扩展。

## 前端建议页面

```text
客户管理
  ├── 组织视图
  │   ├── 组织列表
  │   └── 组织详情
  └── 联系人视图
      ├── 联系人列表
      └── 联系人详情
```

## 验收标准

- 企业邮箱联系人能自动看到所属组织。
- 公共邮箱联系人默认没有组织，但可人工绑定。
- 组织详情能显示联系人和询盘。
- 联系人详情能显示所属组织、询盘、状态、备注。
- 修改联系人组织后，刷新仍保持。
- `pnpm.cmd --filter @email-inquiry/backend typecheck` 通过。
- `pnpm.cmd --filter @email-inquiry/admin-web typecheck` 通过。

## 注意事项

- 不要自动把 `gmail.com` 下所有联系人归为一个组织。
- 允许同一组织存在多个公共邮箱联系人。
- 组织名称不能只依赖域名，后续应允许人工改名。
