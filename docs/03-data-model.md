# 邮件询盘自动处理系统数据模型设计

## 1. 文件定位

本文档用于描述邮件询盘自动处理系统涉及的 SQL 数据表设计，包括：

* 表名
* 表用途
* 字段设计
* 字段类型建议
* 状态枚举
* 表之间的关系
* 分阶段建设范围

本文档是数据模型参考文件，不代表所有表都需要在第一阶段一次性实现。

实际开发时，应以：

```text
docs/06-current-task.md
```

中的当前任务为准。

---

## 2. 数据库设计原则

本项目采用轻量化设计，优先保证：

* 表结构清晰
* 字段语义明确
* 方便后续扩展
* 不过度拆表
* 不提前做复杂 CRM
* 不把报价、合同、ERP 功能提前塞进来
* AI 判断必须留痕
* 对外回复必须可追溯

命名建议：

```text
数据库表名：snake_case
数据库字段：snake_case
后端 DTO：camelCase
```

时间字段统一使用：

```text
created_at
updated_at
deleted_at
```

如无特殊说明，主键统一使用：

```text
id BIGINT PRIMARY KEY AUTO_INCREMENT
```

字符集建议：

```text
utf8mb4
```

---

# 3. 表分阶段总览

## 3.1 第一阶段核心表

第一阶段建议实现这些表：

```text
email_messages
customers
inquiry_cases
inquiry_messages
email_attachments
```

作用是先完成：

```text
邮件入库 → 客户识别 → 创建询盘 → 邮件关联询盘 → 后台查看
```

---

## 3.2 第二阶段 AI 初筛表

```text
ai_decisions
```

作用是保存 AI 对邮件和询盘的判断结果。

---

## 3.3 第三阶段 AI 草稿表

```text
reply_drafts
```

作用是保存 AI 生成的回复草稿和审核状态。

---

## 3.4 第四阶段模板与规则表

```text
reply_templates
keyword_rules
```

作用是约束 AI 回复内容，防止越权承诺。

---

## 3.5 第五阶段知识库与 RAG 表

```text
product_knowledge
rag_references
```

作用是为 AI 提供产品资料、历史案例和可引用依据。

---

## 3.6 第六阶段研发评审表

```text
engineer_reviews
```

作用是记录研发对客户需求的技术判断。

---

## 3.7 第七阶段报价前交接表

```text
quote_handoffs
```

作用是进入报价阶段前，生成并保存交接摘要。

---

## 3.8 后续可选表

```text
inquiry_status_logs
reply_send_logs
ai_prompt_logs
```

这些表用于更完整的留痕、审计和复盘，第一版可以暂缓。

---

# 4. 第一阶段核心表

---

## 4.1 email_messages 邮件表

### 作用

保存进入系统的原始邮件信息。

一封客户邮件，无论是否有效，都应先进入该表。

### 表名

```sql
email_messages
```

### 字段设计

| 字段名             | 类型建议         | 是否必填 | 说明                                           |
| --------------- | ------------ | ---- | -------------------------------------------- |
| id              | BIGINT       | 是    | 主键                                           |
| message_id      | VARCHAR(255) | 是    | 邮件唯一 ID，来自邮箱系统                               |
| thread_id       | VARCHAR(255) | 否    | 邮件线程 ID                                      |
| from_email      | VARCHAR(255) | 是    | 发件人邮箱                                        |
| from_name       | VARCHAR(255) | 否    | 发件人名称                                        |
| to_emails       | TEXT         | 否    | 收件人邮箱，多个可用 JSON 字符串或逗号分隔                     |
| cc_emails       | TEXT         | 否    | 抄送邮箱                                         |
| subject         | VARCHAR(500) | 否    | 邮件主题                                         |
| body_text       | LONGTEXT     | 否    | 纯文本正文                                        |
| body_html       | LONGTEXT     | 否    | HTML 正文                                      |
| received_at     | DATETIME     | 是    | 邮件接收时间                                       |
| language        | VARCHAR(50)  | 否    | 邮件语言，如 en / zh / ko                          |
| source          | VARCHAR(50)  | 否    | 来源，如 gmail / outlook / manual / website_form |
| raw_type        | VARCHAR(50)  | 否    | 原始分类，如 inquiry / reply / unknown             |
| has_attachments | TINYINT      | 是    | 是否有附件，0/1                                    |
| is_processed    | TINYINT      | 是    | 是否已处理，0/1                                    |
| created_at      | DATETIME     | 是    | 创建时间                                         |
| updated_at      | DATETIME     | 是    | 更新时间                                         |
| deleted_at      | DATETIME     | 否    | 软删除时间                                        |

### 建议索引

```sql
UNIQUE KEY uk_message_id (message_id)
KEY idx_thread_id (thread_id)
KEY idx_from_email (from_email)
KEY idx_received_at (received_at)
KEY idx_is_processed (is_processed)
```

### 说明

`message_id` 用于防止重复导入邮件。

`thread_id` 用于识别邮件往来线程，但不要只依赖 `thread_id` 判断询盘，因为同一个客户可能在同一线程里混合多个需求，后续应允许人工调整。

---

## 4.2 customers 客户表

### 作用

保存客户基础信息。

第一版可以根据邮箱自动创建客户，后续再补充公司、国家、客户等级等字段。

### 表名

```sql
customers
```

### 字段设计

| 字段名            | 类型建议         | 是否必填 | 说明                                    |
| -------------- | ------------ | ---- | ------------------------------------- |
| id             | BIGINT       | 是    | 主键                                    |
| name           | VARCHAR(255) | 否    | 客户名称或联系人名称                            |
| email          | VARCHAR(255) | 是    | 客户邮箱                                  |
| domain         | VARCHAR(255) | 否    | 邮箱域名                                  |
| company_name   | VARCHAR(255) | 否    | 公司名称                                  |
| country        | VARCHAR(100) | 否    | 国家或地区                                 |
| source         | VARCHAR(50)  | 否    | 来源，如 website / email / manual         |
| customer_level | VARCHAR(50)  | 否    | 客户等级，如 normal / important / strategic |
| remark         | TEXT         | 否    | 备注                                    |
| created_at     | DATETIME     | 是    | 创建时间                                  |
| updated_at     | DATETIME     | 是    | 更新时间                                  |
| deleted_at     | DATETIME     | 否    | 软删除时间                                 |

### 建议索引

```sql
UNIQUE KEY uk_email (email)
KEY idx_domain (domain)
KEY idx_company_name (company_name)
```

### 说明

第一版不要做复杂客户画像。

客户等级可以先人工维护，后续再根据询盘质量、客户公司背景、历史成交情况逐步扩展。

---

## 4.3 inquiry_cases 询盘表

### 作用

保存一条真实业务询盘机会。

这是系统核心表。

一位客户可以有多个询盘。

一条询盘可以关联多封邮件。

### 表名

```sql
inquiry_cases
```

### 字段设计

| 字段名                  | 类型建议         | 是否必填 | 说明                                                      |
| -------------------- | ------------ | ---- | ------------------------------------------------------- |
| id                   | BIGINT       | 是    | 主键                                                      |
| customer_id          | BIGINT       | 是    | 关联 customers.id                                         |
| title                | VARCHAR(500) | 否    | 询盘标题，默认可取邮件主题                                           |
| subject              | VARCHAR(500) | 否    | 原始邮件主题                                                  |
| product_type         | VARCHAR(100) | 否    | 产品类型，如 RF circulator / RF isolator                      |
| structure_type       | VARCHAR(100) | 否    | 结构类型，如 microstrip / drop-in / coaxial / waveguide / SMT |
| frequency_range      | VARCHAR(100) | 否    | 频率范围，如 12-15GHz                                         |
| power                | VARCHAR(100) | 否    | 功率要求                                                    |
| insertion_loss       | VARCHAR(100) | 否    | 插入损耗要求                                                  |
| isolation            | VARCHAR(100) | 否    | 隔离度要求                                                   |
| vswr                 | VARCHAR(100) | 否    | 驻波比要求                                                   |
| connector            | VARCHAR(100) | 否    | 接口或连接器                                                  |
| size_limit           | VARCHAR(255) | 否    | 尺寸限制                                                    |
| quantity             | VARCHAR(100) | 否    | 数量                                                      |
| application          | VARCHAR(255) | 否    | 应用场景                                                    |
| delivery_requirement | VARCHAR(255) | 否    | 客户期望交期                                                  |
| requirement_summary  | TEXT         | 否    | 需求摘要                                                    |
| missing_fields       | TEXT         | 否    | 缺失字段，可存 JSON 字符串                                        |
| status               | VARCHAR(50)  | 是    | 询盘状态                                                    |
| priority             | VARCHAR(50)  | 否    | 优先级，如 low / normal / high                               |
| owner_user_id        | BIGINT       | 否    | 负责人用户 ID                                                |
| last_message_at      | DATETIME     | 否    | 最近一封关联邮件时间                                              |
| created_at           | DATETIME     | 是    | 创建时间                                                    |
| updated_at           | DATETIME     | 是    | 更新时间                                                    |
| closed_at            | DATETIME     | 否    | 关闭时间                                                    |
| deleted_at           | DATETIME     | 否    | 软删除时间                                                   |

### 第一版推荐状态

```text
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed
```

### 后续完整状态

```text
new
invalid
product_unrelated
need_clarification
waiting_customer
need_engineer_review
waiting_engineer
engineer_confirmed_possible
engineer_confirmed_adjustment
engineer_rejected
waiting_customer_confirmation
ready_for_quote
quotation_stage
closed
```

### 建议索引

```sql
KEY idx_customer_id (customer_id)
KEY idx_status (status)
KEY idx_product_type (product_type)
KEY idx_structure_type (structure_type)
KEY idx_owner_user_id (owner_user_id)
KEY idx_last_message_at (last_message_at)
```

### 说明

`inquiry_cases` 不应承担报价、合同、订单功能。

进入 `ready_for_quote` 后，只表示“可以转报价流程”，不是报价单本身。

报价后续可以单独接报价系统，不建议第一版塞进询盘表。

---

## 4.4 inquiry_messages 询盘邮件关联表

### 作用

关联询盘与邮件。

一条询盘可以关联多封邮件。

### 表名

```sql
inquiry_messages
```

### 字段设计

| 字段名              | 类型建议        | 是否必填 | 说明                                       |
| ---------------- | ----------- | ---- | ---------------------------------------- |
| id               | BIGINT      | 是    | 主键                                       |
| inquiry_case_id  | BIGINT      | 是    | 关联 inquiry_cases.id                      |
| email_message_id | BIGINT      | 是    | 关联 email_messages.id                     |
| direction        | VARCHAR(50) | 是    | inbound / outbound                       |
| relation_type    | VARCHAR(50) | 否    | original / reply / forward / manual_link |
| created_at       | DATETIME    | 是    | 创建时间                                     |

### 建议索引

```sql
UNIQUE KEY uk_inquiry_email (inquiry_case_id, email_message_id)
KEY idx_inquiry_case_id (inquiry_case_id)
KEY idx_email_message_id (email_message_id)
```

### 说明

这张表非常关键。

不要把 `email_message_id` 直接放在 `inquiry_cases` 里作为唯一邮件字段，因为一个询盘后续会有多轮邮件沟通。

---

## 4.5 email_attachments 邮件附件表

### 作用

保存邮件附件信息。

附件可能是规格书、图纸、参数表、BOM、datasheet 等。

### 表名

```sql
email_attachments
```

### 字段设计

| 字段名              | 类型建议          | 是否必填 | 说明                               |
| ---------------- | ------------- | ---- | -------------------------------- |
| id               | BIGINT        | 是    | 主键                               |
| email_message_id | BIGINT        | 是    | 关联 email_messages.id             |
| inquiry_case_id  | BIGINT        | 否    | 关联 inquiry_cases.id，可为空          |
| file_name        | VARCHAR(500)  | 是    | 原始文件名                            |
| file_type        | VARCHAR(100)  | 否    | 文件类型，如 pdf / xlsx / docx / image |
| mime_type        | VARCHAR(255)  | 否    | MIME 类型                          |
| file_size        | BIGINT        | 否    | 文件大小                             |
| storage_path     | VARCHAR(1000) | 否    | 文件存储路径                           |
| parse_status     | VARCHAR(50)   | 否    | 解析状态                             |
| parsed_text      | LONGTEXT      | 否    | 解析出的文本                           |
| parse_error      | TEXT          | 否    | 解析失败原因                           |
| created_at       | DATETIME      | 是    | 创建时间                             |
| updated_at       | DATETIME      | 是    | 更新时间                             |

### parse_status 建议值

```text
pending
parsed
failed
manual_required
```

### 建议索引

```sql
KEY idx_email_message_id (email_message_id)
KEY idx_inquiry_case_id (inquiry_case_id)
KEY idx_parse_status (parse_status)
```

### 说明

附件解析失败时，必须明确标记，不允许 AI 假装已经读取附件内容。

---

# 5. 第二阶段：AI 判断表

---

## 5.1 ai_decisions AI 判断记录表

### 作用

记录 AI 对邮件、询盘、草稿等对象做出的判断。

包括：

* 邮件分类
* 有效询盘判断
* 产品相关性判断
* 参数提取
* 缺失字段判断
* 风险等级判断
* 建议状态
* 内部摘要

### 表名

```sql
ai_decisions
```

### 字段设计

| 字段名                  | 类型建议         | 是否必填 | 说明                               |
| -------------------- | ------------ | ---- | -------------------------------- |
| id                   | BIGINT       | 是    | 主键                               |
| target_type          | VARCHAR(50)  | 是    | 判断对象类型，如 email / inquiry / draft |
| target_id            | BIGINT       | 是    | 判断对象 ID                          |
| email_message_id     | BIGINT       | 否    | 关联邮件                             |
| inquiry_case_id      | BIGINT       | 否    | 关联询盘                             |
| decision_type        | VARCHAR(100) | 是    | 判断类型                             |
| classification       | VARCHAR(100) | 否    | 分类结果                             |
| confidence           | DECIMAL(5,4) | 否    | 置信度，如 0.8500                     |
| product_related      | TINYINT      | 否    | 是否产品相关，0/1                       |
| requirement_complete | TINYINT      | 否    | 需求是否完整，0/1                       |
| extracted_fields     | JSON         | 否    | 提取出的字段                           |
| missing_fields       | JSON         | 否    | 缺失字段                             |
| risk_level           | VARCHAR(50)  | 否    | 风险等级                             |
| suggested_status     | VARCHAR(50)  | 否    | AI 建议状态                          |
| summary              | TEXT         | 否    | AI 摘要                            |
| reason               | TEXT         | 否    | 判断原因                             |
| raw_result           | JSON         | 否    | AI 原始输出                          |
| model_name           | VARCHAR(100) | 否    | 使用的模型                            |
| created_at           | DATETIME     | 是    | 创建时间                             |

### decision_type 建议值

```text
email_classification
requirement_extraction
risk_check
draft_check
status_suggestion
```

### classification 建议值

```text
valid_inquiry
invalid_inquiry
spam_or_ad
unrelated_product
existing_inquiry_reply
quotation_related
technical_followup
complaint_or_after_sales
internal_forward
unknown
```

### risk_level 建议值

```text
low
medium
high
manual_required
```

### 建议索引

```sql
KEY idx_target (target_type, target_id)
KEY idx_email_message_id (email_message_id)
KEY idx_inquiry_case_id (inquiry_case_id)
KEY idx_decision_type (decision_type)
KEY idx_classification (classification)
KEY idx_risk_level (risk_level)
```

### 说明

AI 判断必须留痕。

AI 可以建议状态，但不应在高风险节点自动修改状态。

---

# 6. 第三阶段：回复草稿表

---

## 6.1 reply_drafts 回复草稿表

### 作用

保存 AI 生成或人工编辑的邮件回复草稿。

第一版只建议做到“生成草稿 + 人工审核”，不要自动发送。

### 表名

```sql
reply_drafts
```

### 字段设计

| 字段名              | 类型建议         | 是否必填 | 说明                  |
| ---------------- | ------------ | ---- | ------------------- |
| id               | BIGINT       | 是    | 主键                  |
| inquiry_case_id  | BIGINT       | 是    | 关联询盘                |
| email_message_id | BIGINT       | 否    | 针对哪封邮件生成草稿          |
| draft_type       | VARCHAR(100) | 是    | 草稿类型                |
| language         | VARCHAR(50)  | 否    | 回复语言                |
| subject          | VARCHAR(500) | 否    | 回复主题                |
| draft_body       | LONGTEXT     | 是    | 草稿正文                |
| risk_level       | VARCHAR(50)  | 否    | 风险等级                |
| ai_reason        | TEXT         | 否    | AI 生成理由             |
| approval_status  | VARCHAR(50)  | 是    | 审核状态                |
| approved_by      | BIGINT       | 否    | 审核人                 |
| approved_at      | DATETIME     | 否    | 审核时间                |
| rejected_reason  | TEXT         | 否    | 驳回原因                |
| sent_at          | DATETIME     | 否    | 发送时间                |
| created_by       | BIGINT       | 否    | 创建人，AI 生成可为空或使用系统用户 |
| created_at       | DATETIME     | 是    | 创建时间                |
| updated_at       | DATETIME     | 是    | 更新时间                |
| deleted_at       | DATETIME     | 否    | 软删除时间               |

### draft_type 建议值

```text
ask_more_parameters
acknowledge_review
reject_unrelated
engineer_possible_reply
engineer_adjustment_reply
engineer_not_possible_reply
waiting_customer_followup
internal_summary
```

### approval_status 建议值

```text
draft
pending_review
approved
sent
rejected
manual_takeover
```

### 建议索引

```sql
KEY idx_inquiry_case_id (inquiry_case_id)
KEY idx_email_message_id (email_message_id)
KEY idx_draft_type (draft_type)
KEY idx_approval_status (approval_status)
KEY idx_sent_at (sent_at)
```

### 说明

进入报价阶段后，AI 不应继续生成普通对外回复草稿，只能生成内部摘要类草稿。

---

# 7. 第四阶段：模板与关键词规则表

---

## 7.1 reply_templates 回复模板表

### 作用

保存 AI 回复草稿使用的模板。

模板不要写死在代码或 prompt 中，后续应支持后台维护。

### 表名

```sql
reply_templates
```

### 字段设计

| 字段名           | 类型建议         | 是否必填 | 说明           |
| ------------- | ------------ | ---- | ------------ |
| id            | BIGINT       | 是    | 主键           |
| template_code | VARCHAR(100) | 是    | 模板编码         |
| template_name | VARCHAR(255) | 是    | 模板名称         |
| language      | VARCHAR(50)  | 是    | 语言，如 en / zh |
| product_type  | VARCHAR(100) | 否    | 适用产品类型       |
| scenario      | VARCHAR(100) | 是    | 使用场景         |
| content       | LONGTEXT     | 是    | 模板内容         |
| variables     | JSON         | 否    | 模板变量定义       |
| is_active     | TINYINT      | 是    | 是否启用         |
| created_by    | BIGINT       | 否    | 创建人          |
| created_at    | DATETIME     | 是    | 创建时间         |
| updated_at    | DATETIME     | 是    | 更新时间         |
| deleted_at    | DATETIME     | 否    | 软删除时间        |

### 建议索引

```sql
UNIQUE KEY uk_template_code_language (template_code, language)
KEY idx_scenario (scenario)
KEY idx_product_type (product_type)
KEY idx_is_active (is_active)
```

---

## 7.2 keyword_rules 关键词规则表

### 作用

保存禁止词、报价触发词、合规风险词、技术风险词等规则。

用于检查 AI 草稿和客户邮件。

### 表名

```sql
keyword_rules
```

### 字段设计

| 字段名         | 类型建议         | 是否必填 | 说明     |
| ----------- | ------------ | ---- | ------ |
| id          | BIGINT       | 是    | 主键     |
| keyword     | VARCHAR(255) | 是    | 关键词    |
| language    | VARCHAR(50)  | 否    | 语言     |
| rule_type   | VARCHAR(100) | 是    | 规则类型   |
| risk_level  | VARCHAR(50)  | 是    | 风险等级   |
| action      | VARCHAR(50)  | 是    | 命中后的动作 |
| description | TEXT         | 否    | 规则说明   |
| is_active   | TINYINT      | 是    | 是否启用   |
| created_at  | DATETIME     | 是    | 创建时间   |
| updated_at  | DATETIME     | 是    | 更新时间   |
| deleted_at  | DATETIME     | 否    | 软删除时间  |

### rule_type 建议值

```text
forbidden_commitment
quote_trigger
compliance_risk
technical_risk
manual_takeover
```

### action 建议值

```text
block
warn
manual_review
manual_takeover
```

### 建议索引

```sql
KEY idx_keyword (keyword)
KEY idx_rule_type (rule_type)
KEY idx_risk_level (risk_level)
KEY idx_action (action)
KEY idx_is_active (is_active)
```

---

# 8. 第五阶段：产品知识库与 RAG 表

---

## 8.1 product_knowledge 产品知识表

### 作用

保存可供 RAG 检索的产品资料、能力说明、历史案例和技术说明。

第一版可以先人工录入，不必一开始做复杂向量库管理。

### 表名

```sql
product_knowledge
```

### 字段设计

| 字段名               | 类型建议          | 是否必填 | 说明                                    |
| ----------------- | ------------- | ---- | ------------------------------------- |
| id                | BIGINT        | 是    | 主键                                    |
| title             | VARCHAR(500)  | 是    | 知识标题                                  |
| product_type      | VARCHAR(100)  | 否    | 产品类型                                  |
| structure_type    | VARCHAR(100)  | 否    | 结构类型                                  |
| frequency_min_ghz | DECIMAL(10,4) | 否    | 最小频率 GHz                              |
| frequency_max_ghz | DECIMAL(10,4) | 否    | 最大频率 GHz                              |
| power_range       | VARCHAR(100)  | 否    | 功率范围                                  |
| size_info         | VARCHAR(255)  | 否    | 尺寸信息                                  |
| key_features      | TEXT          | 否    | 特点                                    |
| application       | VARCHAR(255)  | 否    | 应用场景                                  |
| content           | LONGTEXT      | 是    | 知识正文                                  |
| source_type       | VARCHAR(100)  | 否    | 来源类型，如 brochure / case / faq / manual |
| source_file       | VARCHAR(500)  | 否    | 来源文件                                  |
| status            | VARCHAR(50)   | 是    | 状态                                    |
| created_by        | BIGINT        | 否    | 创建人                                   |
| created_at        | DATETIME      | 是    | 创建时间                                  |
| updated_at        | DATETIME      | 是    | 更新时间                                  |
| deleted_at        | DATETIME      | 否    | 软删除时间                                 |

### status 建议值

```text
draft
active
archived
```

### 建议索引

```sql
KEY idx_product_type (product_type)
KEY idx_structure_type (structure_type)
KEY idx_frequency_range (frequency_min_ghz, frequency_max_ghz)
KEY idx_source_type (source_type)
KEY idx_status (status)
```

### 说明

RAG 找到相似资料，不等于 AI 可以承诺可做。

产品知识库只作为判断依据之一，最终技术可行性仍应由研发确认。

---

## 8.2 rag_references RAG 引用记录表

### 作用

记录某次询盘或 AI 草稿使用了哪些知识资料。

### 表名

```sql
rag_references
```

### 字段设计

| 字段名              | 类型建议         | 是否必填 | 说明          |
| ---------------- | ------------ | ---- | ----------- |
| id               | BIGINT       | 是    | 主键          |
| inquiry_case_id  | BIGINT       | 是    | 关联询盘        |
| email_message_id | BIGINT       | 否    | 关联邮件        |
| reply_draft_id   | BIGINT       | 否    | 关联草稿        |
| source_type      | VARCHAR(100) | 是    | 来源类型        |
| source_id        | BIGINT       | 否    | 来源记录 ID     |
| source_title     | VARCHAR(500) | 否    | 来源标题        |
| matched_content  | LONGTEXT     | 否    | 匹配内容        |
| score            | DECIMAL(8,4) | 否    | 匹配分数        |
| ai_summary       | TEXT         | 否    | AI 对引用内容的总结 |
| created_at       | DATETIME     | 是    | 创建时间        |

### 建议索引

```sql
KEY idx_inquiry_case_id (inquiry_case_id)
KEY idx_email_message_id (email_message_id)
KEY idx_reply_draft_id (reply_draft_id)
KEY idx_source_type (source_type)
KEY idx_score (score)
```

---

# 9. 第六阶段：研发评审表

---

## 9.1 engineer_reviews 研发评审表

### 作用

保存研发对客户需求的技术评审意见。

AI 不替代研发判断，研发意见优先级高于 AI 判断。

### 表名

```sql
engineer_reviews
```

### 字段设计

| 字段名                   | 类型建议         | 是否必填 | 说明                       |
| --------------------- | ------------ | ---- | ------------------------ |
| id                    | BIGINT       | 是    | 主键                       |
| inquiry_case_id       | BIGINT       | 是    | 关联询盘                     |
| engineer_id           | BIGINT       | 否    | 研发工程师用户 ID               |
| feasibility           | VARCHAR(100) | 是    | 可行性结论                    |
| missing_parameters    | TEXT         | 否    | 仍缺失的参数                   |
| technical_comment     | TEXT         | 否    | 技术意见                     |
| suggested_solution    | TEXT         | 否    | 建议方案                     |
| estimated_difficulty  | VARCHAR(50)  | 否    | 难度，如 low / medium / high |
| need_customer_confirm | TINYINT      | 是    | 是否需要客户进一步确认              |
| reviewed_at           | DATETIME     | 否    | 评审时间                     |
| created_at            | DATETIME     | 是    | 创建时间                     |
| updated_at            | DATETIME     | 是    | 更新时间                     |
| deleted_at            | DATETIME     | 否    | 软删除时间                    |

### feasibility 建议值

```text
possible
possible_with_adjustment
need_more_information
not_possible
```

### 建议索引

```sql
KEY idx_inquiry_case_id (inquiry_case_id)
KEY idx_engineer_id (engineer_id)
KEY idx_feasibility (feasibility)
KEY idx_reviewed_at (reviewed_at)
```

---

# 10. 第七阶段：报价前交接表

---

## 10.1 quote_handoffs 报价前交接表

### 作用

当询盘进入 `ready_for_quote` 时，保存报价前交接摘要。

这不是报价单，不保存正式价格。

### 表名

```sql
quote_handoffs
```

### 字段设计

| 字段名                     | 类型建议        | 是否必填 | 说明         |
| ----------------------- | ----------- | ---- | ---------- |
| id                      | BIGINT      | 是    | 主键         |
| inquiry_case_id         | BIGINT      | 是    | 关联询盘       |
| customer_summary        | TEXT        | 否    | 客户摘要       |
| requirement_summary     | TEXT        | 否    | 需求摘要       |
| confirmed_parameters    | JSON        | 否    | 已确认参数      |
| missing_parameters      | JSON        | 否    | 仍缺失参数      |
| engineer_review_summary | TEXT        | 否    | 研发意见摘要     |
| attachment_summary      | TEXT        | 否    | 附件摘要       |
| communication_summary   | TEXT        | 否    | 历史沟通摘要     |
| risk_notes              | TEXT        | 否    | 风险提示       |
| sales_notes             | TEXT        | 否    | 给业务人员的注意事项 |
| handoff_status          | VARCHAR(50) | 是    | 交接状态       |
| created_by              | BIGINT      | 否    | 创建人        |
| created_at              | DATETIME    | 是    | 创建时间       |
| updated_at              | DATETIME    | 是    | 更新时间       |

### handoff_status 建议值

```text
draft
ready
accepted
closed
```

### 建议索引

```sql
UNIQUE KEY uk_inquiry_case_id (inquiry_case_id)
KEY idx_handoff_status (handoff_status)
```

### 说明

`quote_handoffs` 只做报价前资料整理。

价格、付款方式、PI、合同不应放在这里。

---

# 11. 后续可选留痕表

---

## 11.1 inquiry_status_logs 询盘状态变更日志表

### 作用

记录询盘状态变化。

如果第一版需要简单，可以暂时不做；如果重视追溯，建议尽早加入。

### 表名

```sql
inquiry_status_logs
```

### 字段设计

| 字段名             | 类型建议        | 是否必填 | 说明                  |
| --------------- | ----------- | ---- | ------------------- |
| id              | BIGINT      | 是    | 主键                  |
| inquiry_case_id | BIGINT      | 是    | 关联询盘                |
| from_status     | VARCHAR(50) | 否    | 原状态                 |
| to_status       | VARCHAR(50) | 是    | 新状态                 |
| reason          | TEXT        | 否    | 变更原因                |
| changed_by      | BIGINT      | 否    | 操作人                 |
| changed_by_type | VARCHAR(50) | 是    | human / ai / system |
| created_at      | DATETIME    | 是    | 创建时间                |

---

## 11.2 reply_send_logs 邮件发送日志表

### 作用

记录最终对外发送的邮件内容。

如果第一版只是复制草稿到邮箱发送，可以暂缓。

### 表名

```sql
reply_send_logs
```

### 字段设计

| 字段名              | 类型建议         | 是否必填 | 说明            |
| ---------------- | ------------ | ---- | ------------- |
| id               | BIGINT       | 是    | 主键            |
| reply_draft_id   | BIGINT       | 否    | 关联草稿          |
| inquiry_case_id  | BIGINT       | 是    | 关联询盘          |
| email_message_id | BIGINT       | 否    | 回复的原邮件        |
| to_emails        | TEXT         | 是    | 收件人           |
| cc_emails        | TEXT         | 否    | 抄送人           |
| subject          | VARCHAR(500) | 否    | 发送主题          |
| body             | LONGTEXT     | 是    | 最终发送正文        |
| sent_by          | BIGINT       | 否    | 发送人           |
| sent_at          | DATETIME     | 是    | 发送时间          |
| send_status      | VARCHAR(50)  | 是    | sent / failed |
| error_message    | TEXT         | 否    | 发送失败原因        |
| created_at       | DATETIME     | 是    | 创建时间          |

---

## 11.3 ai_prompt_logs AI 提示词日志表

### 作用

记录 AI 调用时的 prompt、输入、输出。

如果考虑成本、隐私或存储压力，可以只在测试环境开启。

### 表名

```sql
ai_prompt_logs
```

### 字段设计

| 字段名            | 类型建议         | 是否必填 | 说明                      |
| -------------- | ------------ | ---- | ----------------------- |
| id             | BIGINT       | 是    | 主键                      |
| target_type    | VARCHAR(50)  | 是    | email / inquiry / draft |
| target_id      | BIGINT       | 是    | 目标 ID                   |
| prompt_type    | VARCHAR(100) | 是    | prompt 类型               |
| prompt_content | LONGTEXT     | 否    | 实际 prompt               |
| input_payload  | JSON         | 否    | 输入数据                    |
| output_payload | JSON         | 否    | 输出数据                    |
| model_name     | VARCHAR(100) | 否    | 模型名称                    |
| token_usage    | JSON         | 否    | token 使用情况              |
| success        | TINYINT      | 是    | 是否成功                    |
| error_message  | TEXT         | 否    | 错误信息                    |
| created_at     | DATETIME     | 是    | 创建时间                    |

---

# 12. 表关系总览

核心关系如下：

```text
customers
  └── inquiry_cases
        ├── inquiry_messages
        │     └── email_messages
        │            └── email_attachments
        ├── ai_decisions
        ├── reply_drafts
        ├── rag_references
        ├── engineer_reviews
        └── quote_handoffs
```

更具体地说：

```text
customers.id = inquiry_cases.customer_id

inquiry_cases.id = inquiry_messages.inquiry_case_id
email_messages.id = inquiry_messages.email_message_id

email_messages.id = email_attachments.email_message_id
inquiry_cases.id = email_attachments.inquiry_case_id

inquiry_cases.id = ai_decisions.inquiry_case_id
email_messages.id = ai_decisions.email_message_id

inquiry_cases.id = reply_drafts.inquiry_case_id
email_messages.id = reply_drafts.email_message_id

inquiry_cases.id = rag_references.inquiry_case_id
reply_drafts.id = rag_references.reply_draft_id

inquiry_cases.id = engineer_reviews.inquiry_case_id
inquiry_cases.id = quote_handoffs.inquiry_case_id
```

---

# 13. 第一版最小建表建议

如果第一版只做 MVP，不建议一次性建所有表。

第一版可以只建：

```text
email_messages
customers
inquiry_cases
inquiry_messages
email_attachments
ai_decisions
reply_drafts
```

第一版暂不建：

```text
reply_templates
keyword_rules
product_knowledge
rag_references
engineer_reviews
quote_handoffs
inquiry_status_logs
reply_send_logs
ai_prompt_logs
```

等业务流程跑起来后，再逐步增加。

---

# 14. 第一版 MVP 表职责

第一版每张表的作用如下：

| 表名                | 作用            |
| ----------------- | ------------- |
| email_messages    | 保存邮件          |
| customers         | 保存客户          |
| inquiry_cases     | 保存询盘          |
| inquiry_messages  | 关联询盘与邮件       |
| email_attachments | 保存附件          |
| ai_decisions      | 保存 AI 判断和参数提取 |
| reply_drafts      | 保存 AI 回复草稿    |

第一版核心闭环：

```text
邮件进入
  ↓
email_messages 入库
  ↓
识别 customers
  ↓
创建 inquiry_cases
  ↓
inquiry_messages 关联邮件和询盘
  ↓
AI 分析后写入 ai_decisions
  ↓
AI 生成草稿写入 reply_drafts
  ↓
人工审核
```

---

# 15. 开发注意事项

后续让 AI 写代码时，应遵守：

```text
不要随意新增表。
不要随意新增状态。
不要把报价字段塞进 inquiry_cases。
不要把邮件正文塞进多个重复表。
不要让一个 inquiry_case 只支持一封邮件。
不要让 AI 判断覆盖人工和研发判断。
不要把 RAG 检索结果当作技术承诺。
```

当前阶段如果只做邮件台账，应只实现第一阶段表。

如果当前任务未要求 AI，则不要提前创建 AI 相关接口。

如果当前任务未要求 RAG，则不要提前创建向量检索、embedding、知识库后台。

---

# 16. 总结

本数据模型按以下顺序逐步建设：

```text
第一步：邮件、客户、询盘、附件
第二步：AI 判断与参数提取
第三步：回复草稿与人工审核
第四步：模板和关键词规则
第五步：产品知识库与 RAG 引用
第六步：研发评审
第七步：报价前交接
第八步：发送日志和复盘统计
```

核心原则：

```text
先把邮件和询盘关系管清楚；
再让 AI 帮忙分析；
再让 AI 写草稿；
最后才考虑自动化。
```
