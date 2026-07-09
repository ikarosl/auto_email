# 项目文档入口

当前 `docs` 目录只保留仍然可以指导实现和联调的基线文档。早期任务规划、临时规则、阶段清单和旧约束已清理，避免后续开发继续被过期描述影响。

## 当前有效文档

| 文件 | 用途 |
|---|---|
| `context/上下文格式参照.md` | AI 上下文 payload 与 Chat API 入参格式参照 |
| `database/07-database-persistence-design.md` | 当前 PostgreSQL 数据模型与持久化设计 |
| `database/initial-empty-postgres-schema.sql` | 可用于重置/初始化数据库的空表 SQL 样本 |
| `frontend/router.md` | 前后端接口路由与统一响应格式规划 |
| `frontend/frontUI.md` | 管理工作台文字 UI 与页面信息架构 |
| `attachments/attachment-plan.md` | 邮件附件读取、解析、入上下文的后续方案 |

## 维护原则

- 新任务以代码和当前有效文档为准，不再引用已删除的阶段性任务文档。
- AI 状态建议、询盘归并、人工校正等规则允许继续迭代，不被旧文档中的限制锁死。
- 若新增长期有效设计文档，请在本文件登记；临时讨论和一次性任务不要长期留在 `docs` 根目录。
