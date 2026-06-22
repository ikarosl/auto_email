# 当前开发任务：邮件接收与询盘台账基础模块

## 1. 文件定位

本文档是当前阶段的具体开发任务说明。

AI 写代码或开发人员实现功能时，必须以本文档为准。

其他文档只作为参考：

```text
01-business-flow.md        业务流程参考
02-implementation-plan.md  分阶段实现路线
03-data-model.md           数据模型设计
04-status-rules.md         状态机与流程约束
05-ai-rules.md             AI 规则与回复边界
```

重要说明：

```text
业务流程文档只作为长期业务地图。
实现路线文档只作为阶段规划。
当前开发范围以本文件为准。
不要提前实现后续阶段功能。
```

---

## 2. 本次任务名称

```text
邮件接收与询盘台账基础模块
```

---

## 3. 本次任务目标

本次只实现邮件数据入库、客户识别、询盘记录创建和后台查看。

本次目标是先建立最基础的业务台账，让系统能够回答：

```text
有哪些邮件进入系统？
邮件是谁发来的？
邮件内容是什么？
这封邮件是否已经形成询盘？
这个询盘属于哪个客户？
询盘当前是什么状态？
一个询盘关联了哪些邮件？
```

本次不追求 AI 自动化，也不做 RAG、报价、研发评审。

---

## 4. 本次需要实现的核心闭环

本次实现以下闭环：

```text
邮件数据进入系统
  ↓
保存到 email_messages
  ↓
根据 from_email 识别或创建 customer
  ↓
人工从邮件创建 inquiry_case
  ↓
inquiry_messages 关联邮件和询盘
  ↓
后台查看邮件列表、邮件详情、询盘列表、询盘详情
  ↓
人工修改询盘状态
```

---

## 5. 本次需要实现的数据表

本次只实现以下表：

```text
email_messages
customers
inquiry_cases
inquiry_messages
email_attachments
```

如项目已有通用用户表、权限表、日志表，应复用现有结构，不要重复创建。

---

## 6. 表字段要求

### 6.1 email_messages

用于保存邮件。

字段：

```text
id
message_id
thread_id
from_email
from_name
to_emails
cc_emails
subject
body_text
body_html
received_at
language
source
raw_type
has_attachments
is_processed
created_at
updated_at
deleted_at
```

要求：

```text
message_id 必须唯一。
from_email 必填。
received_at 必填。
has_attachments 使用 0/1。
is_processed 使用 0/1。
```

---

### 6.2 customers

用于保存客户基础信息。

字段：

```text
id
name
email
domain
company_name
country
source
customer_level
remark
created_at
updated_at
deleted_at
```

要求：

```text
email 必须唯一。
第一版可以根据 from_email 自动创建客户。
domain 可以从 email 中解析。
customer_level 可为空，默认 normal。
```

---

### 6.3 inquiry_cases

用于保存询盘机会。

字段：

```text
id
customer_id
title
subject
product_type
structure_type
frequency_range
power
insertion_loss
isolation
vswr
connector
size_limit
quantity
application
delivery_requirement
requirement_summary
missing_fields
status
priority
owner_user_id
last_message_at
created_at
updated_at
closed_at
deleted_at
```

要求：

```text
customer_id 必须关联 customers.id。
status 必须使用本文档定义的第一版状态。
priority 默认 normal。
第一版可以允许产品参数字段为空，由人工后续补充。
不要在 inquiry_cases 中加入价格、付款、合同、PI 字段。
```

---

### 6.4 inquiry_messages

用于关联询盘和邮件。

字段：

```text
id
inquiry_case_id
email_message_id
direction
relation_type
created_at
```

要求：

```text
inquiry_case_id 关联 inquiry_cases.id。
email_message_id 关联 email_messages.id。
direction 第一版支持 inbound / outbound。
relation_type 第一版支持 original / reply / forward / manual_link。
同一个 inquiry_case_id + email_message_id 不应重复。
```

---

### 6.5 email_attachments

用于保存邮件附件信息。

字段：

```text
id
email_message_id
inquiry_case_id
file_name
file_type
mime_type
file_size
storage_path
parse_status
parsed_text
parse_error
created_at
updated_at
```

要求：

```text
email_message_id 必须关联 email_messages.id。
inquiry_case_id 可为空。
parse_status 第一版支持 pending / parsed / failed / manual_required。
第一版可以只保存附件元信息，不强制实现附件内容解析。
```

---

## 7. 本次允许的询盘状态

本次 `inquiry_cases.status` 只允许：

```text
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed
```

状态说明：

| 状态 | 含义 |
|---|---|
| new | 新询盘 |
| invalid | 无效询盘 |
| need_clarification | 需要补充参数 |
| need_engineer_review | 需要研发确认 |
| waiting_customer | 等待客户回复 |
| ready_for_quote | 准备进入报价 |
| closed | 已关闭 |

第一版可以通过人工修改状态，不需要实现复杂自动状态流转。

---

## 8. 本次需要实现的后端接口

接口路径可根据现有项目风格调整，但功能必须覆盖以下内容。

### 8.1 邮件接口

```text
GET /email-messages
GET /email-messages/:id
POST /email-messages
```

说明：

```text
GET /email-messages：邮件列表，支持分页。
GET /email-messages/:id：邮件详情。
POST /email-messages：第一版用于手动创建测试邮件或接入邮件数据。
```

邮件列表建议支持筛选：

```text
from_email
subject
is_processed
received_at range
```

---

### 8.2 客户接口

```text
GET /customers
GET /customers/:id
```

说明：

```text
第一版客户主要由邮件创建询盘时自动创建。
后台可先只提供查看，不强制做完整客户管理。
```

---

### 8.3 询盘接口

```text
GET /inquiry-cases
GET /inquiry-cases/:id
POST /inquiry-cases/from-email/:emailId
PATCH /inquiry-cases/:id
PATCH /inquiry-cases/:id/status
```

说明：

```text
GET /inquiry-cases：询盘列表，支持分页和状态筛选。
GET /inquiry-cases/:id：询盘详情，需要包含关联邮件。
POST /inquiry-cases/from-email/:emailId：从邮件创建询盘。
PATCH /inquiry-cases/:id：编辑询盘基础信息。
PATCH /inquiry-cases/:id/status：修改询盘状态。
```

---

### 8.4 附件接口

```text
GET /email-attachments
GET /email-attachments/:id
```

说明：

```text
第一版可以只查看附件元信息。
不要求实现附件解析、预览、下载。
```

---

## 9. 从邮件创建询盘的业务规则

调用：

```text
POST /inquiry-cases/from-email/:emailId
```

时，应执行：

```text
1. 查询 email_messages。
2. 根据 from_email 查找 customers。
3. 如果客户不存在，则创建 customers。
4. 创建 inquiry_cases。
5. inquiry_cases.customer_id 关联该客户。
6. inquiry_cases.title 默认取邮件 subject。
7. inquiry_cases.subject 默认取邮件 subject。
8. inquiry_cases.status 默认 new。
9. inquiry_cases.priority 默认 normal。
10. inquiry_cases.last_message_at 默认取邮件 received_at。
11. 创建 inquiry_messages 关联记录。
12. 将 email_messages.is_processed 标记为 1。
13. 如果该邮件有附件，可将附件 inquiry_case_id 关联到新询盘。
```

注意：

```text
同一封邮件不应重复创建多个询盘，除非后续人工拆分功能明确支持。
第一版如发现邮件已关联询盘，应返回明确提示。
```

---

## 10. 本次需要实现的前端页面

### 10.1 邮件列表页

页面名称建议：

```text
邮件管理 / 邮件列表
```

列表字段：

```text
发件人名称
发件人邮箱
主题
接收时间
是否有附件
是否已处理
操作
```

操作：

```text
查看详情
创建询盘
```

筛选：

```text
发件人邮箱
主题关键词
是否已处理
接收时间范围
```

---

### 10.2 邮件详情页

展示：

```text
发件人
收件人
抄送人
主题
接收时间
正文内容
附件列表
是否已关联询盘
```

操作：

```text
从该邮件创建询盘
返回列表
```

---

### 10.3 询盘台账页

页面名称建议：

```text
询盘管理 / 询盘台账
```

列表字段：

```text
客户
邮箱
询盘标题
产品类型
频率范围
数量
状态
优先级
最近邮件时间
更新时间
操作
```

操作：

```text
查看详情
编辑
修改状态
```

筛选：

```text
客户邮箱
产品类型
状态
优先级
更新时间范围
```

---

### 10.4 询盘详情页

展示：

```text
客户信息
询盘基础信息
产品参数
当前状态
关联邮件列表
附件列表
备注或需求摘要
```

操作：

```text
编辑基础信息
修改状态
查看关联邮件
```

---

## 11. 权限要求

如项目已有 RBAC 权限体系，应接入现有权限。

第一版建议权限点：

```text
email_message:view
email_message:create
inquiry_case:view
inquiry_case:create
inquiry_case:update
inquiry_case:change_status
```

如果当前项目还未细分到该程度，可以先复用管理员或业务人员权限，但不要绕开已有认证体系。

---

## 12. 本次明确不做的内容

本次不要实现：

```text
AI 分类
AI 参数提取
AI 回复草稿
RAG 检索
产品知识库
研发评审
报价管理
报价单
价格字段
合同字段
付款字段
PI 字段
邮件自动发送
低风险自动回复
复杂客户画像
客户评分
完整 CRM
附件内容自动解析
向量数据库
embedding
自动状态流转
```

如果 AI 写代码时尝试实现以上内容，应停止并回到本文件范围。

---

## 13. 技术实现要求

请遵守项目现有技术栈和代码风格。

建议要求：

```text
后端优先使用现有 NestJS 模块风格。
前端优先使用现有 Vue3 + Element Plus 风格。
数据库字段使用 snake_case。
DTO 和前端字段可使用 camelCase。
分页、筛选、详情接口参考现有模块写法。
不要重复实现已有的数据库连接、认证、权限和日志能力。
```

如果现有项目结构与本文档不同，应优先保持现有架构一致，并在实现说明中标明调整点。

---

## 14. 数据校验要求

### 14.1 邮件创建校验

```text
message_id 必填且唯一。
from_email 必填且必须是邮箱格式。
received_at 必填。
subject 可为空。
body_text 和 body_html 可以同时为空，但不推荐。
```

### 14.2 询盘创建校验

```text
customer_id 必须存在。
status 必须在允许状态范围内。
priority 如为空，默认 normal。
从邮件创建询盘时，emailId 必须存在。
```

### 14.3 状态修改校验

```text
新状态必须在允许状态范围内。
closed_at 仅在状态改为 closed 时写入。
从 closed 恢复到其他状态，第一版可以禁止或仅允许管理员操作。
```

---

## 15. 验收标准

本次任务完成后，应满足：

```text
1. 可以创建或导入一封邮件记录。
2. 可以在后台查看邮件列表。
3. 可以查看邮件详情。
4. 可以从一封邮件创建一个客户。
5. 可以从一封邮件创建一个询盘。
6. 创建询盘后，邮件与询盘有关联关系。
7. 创建询盘后，邮件 is_processed 标记为已处理。
8. 可以查看询盘列表。
9. 可以查看询盘详情。
10. 询盘详情中可以看到关联邮件。
11. 可以手动编辑询盘基础信息。
12. 可以手动修改询盘状态。
13. 状态值只能使用本文件定义的状态。
14. 同一封邮件不应重复创建多个询盘。
15. 不应出现报价、合同、付款等本次未要求字段。
16. 不应影响现有系统其他模块。
```

---

## 16. 建议测试数据

### 16.1 测试邮件 1：有效但参数不完整

```text
from_email: buyer@example.com
from_name: John Smith
subject: Inquiry for 12-15GHz Microstrip Circulator
body_text: We need a 12-15GHz microstrip circulator, small size, 10 pcs. Could you please check?
received_at: 当前时间
```

预期：

```text
可以创建客户。
可以创建询盘。
询盘状态默认为 new。
产品字段可由人工后续填写。
```

---

### 16.2 测试邮件 2：广告邮件

```text
from_email: marketing@example-seo.com
from_name: SEO Team
subject: Grow your website traffic
body_text: We can help you rank on Google and get more leads.
received_at: 当前时间
```

预期：

```text
第一版仍可入库。
人工可将相关询盘状态改为 invalid。
本阶段不要求 AI 自动识别广告。
```

---

### 16.3 测试邮件 3：非主营产品

```text
from_email: buyer2@example.com
from_name: Alice
subject: RF amplifier inquiry
body_text: Can you supply RF power amplifiers?
received_at: 当前时间
```

预期：

```text
第一版仍可入库。
人工可创建或不创建询盘。
如创建询盘，可人工将状态设为 invalid 或 closed。
本阶段不要求自动判断非主营产品。
```

---

## 17. AI 写代码时的执行提示

如果使用 AI 写代码，请将以下要求放入提示词：

```text
请先阅读 docs/01-business-flow.md、docs/02-implementation-plan.md、docs/03-data-model.md、docs/04-status-rules.md、docs/05-ai-rules.md。
这些文件用于理解业务背景和边界。
本次实际开发范围只以 docs/06-current-task.md 为准。
不要提前实现 AI、RAG、报价、研发评审、自动发送等后续模块。
请优先参考现有项目中类似 CRUD 模块的写法。
完成后说明修改了哪些文件、新增了哪些接口、如何验证。
```

---

## 18. 完成后输出要求

AI 或开发人员完成本任务后，应输出：

```text
1. 修改了哪些文件
2. 新增了哪些数据库表
3. 新增了哪些接口
4. 新增了哪些前端页面
5. 如何运行数据库迁移
6. 如何启动后端和前端
7. 如何验证本次功能
8. 哪些内容本次没有实现
```

---

## 19. 总结

本次任务只做地基：

```text
邮件入库
客户识别
询盘台账
邮件关联询盘
人工状态管理
后台查看
```

不要让系统一开始就变成“自动销售机器人”。

先把邮件和询盘管清楚，后面的 AI 才有地方落脚。地基稳，楼才敢往上长。
