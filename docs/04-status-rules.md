# 邮件询盘自动处理系统状态机与流程约束

## 1. 文件定位

本文档用于定义邮件询盘自动处理系统中的询盘状态、状态流转规则、流程边界和越权限制。

本文档服务于后续后端开发、前端页面设计、AI 判断逻辑、人工审核流程和报价前交接流程。

完整业务背景请参考：

```text
01-business-flow.md
```

分阶段实现路线请参考：

```text
02-implementation-plan.md
```

数据表设计请参考：

```text
03-data-model.md
```

当前开发范围以：

```text
06-current-task.md
```

为准。

---

## 2. 核心原则

系统状态机的核心目标不是把流程做复杂，而是保证每一封客户邮件和每一条询盘都知道：

```text
当前走到哪一步？
下一步应该由谁处理？
AI 是否允许介入？
是否需要人工审核？
是否已经进入报价边界？
```

状态机设计原则：

```text
状态必须清晰。
流转必须可控。
AI 只能建议，不应越权。
报价阶段必须转人工。
高风险节点必须留痕。
```

---

## 3. 第一版状态范围

第一版系统建议先使用简化状态，避免一次性设计过重。

第一版 `inquiry_cases.status` 只允许以下值：

```text
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed
```

### 3.1 状态说明

| 状态 | 中文含义 | 说明 |
|---|---|---|
| new | 新询盘 | 邮件已进入系统，尚未完成有效判断或人工处理 |
| invalid | 无效询盘 | 广告、乱填、无意义内容、明显非客户询盘 |
| need_clarification | 需要补充参数 | 客户需求不完整，需要向客户询问关键参数 |
| need_engineer_review | 需要研发确认 | 需求较明确，但技术可行性需要研发判断 |
| waiting_customer | 等待客户回复 | 已向客户询问补充信息或确认事项，等待客户回复 |
| ready_for_quote | 准备进入报价 | 技术和客户意向基本明确，准备转业务报价 |
| closed | 已关闭 | 询盘已关闭，不再继续推进 |

---

## 4. 后续完整状态范围

后续系统成熟后，可以扩展为完整状态。

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

### 4.1 完整状态说明

| 状态 | 中文含义 | 说明 |
|---|---|---|
| new | 新询盘 | 邮件已接收，尚未处理 |
| invalid | 无效询盘 | 广告、乱填、垃圾邮件、无意义内容 |
| product_unrelated | 非主营产品 | 客户需求不属于公司主营产品范围 |
| need_clarification | 需要补充参数 | 客户需求缺少关键技术参数 |
| waiting_customer | 等待客户回复 | 已向客户发出补充参数或确认请求 |
| need_engineer_review | 需要研发确认 | 需求基本明确，需要内部技术判断 |
| waiting_engineer | 等待研发反馈 | 已提交研发评审，等待研发意见 |
| engineer_confirmed_possible | 研发确认可做 | 研发初步确认具备可行性 |
| engineer_confirmed_adjustment | 研发确认需调整 | 研发认为参数、结构或方案需调整后才可能可做 |
| engineer_rejected | 研发确认不可做 | 研发判断当前要求暂不可做 |
| waiting_customer_confirmation | 等待客户确认 | 已回复客户初步方案或可行性，等待客户确认是否继续 |
| ready_for_quote | 准备报价 | 技术和客户意向基本明确，可以转报价流程 |
| quotation_stage | 报价阶段 | 已进入报价、商务、合同或付款相关流程 |
| closed | 已关闭 | 已结束或不再推进 |

---

## 5. 第一版允许的状态流转

第一版系统应先实现以下流转：

```text
new
  → invalid
  → need_clarification
  → need_engineer_review
  → closed

need_clarification
  → waiting_customer
  → need_engineer_review
  → closed

waiting_customer
  → need_clarification
  → need_engineer_review
  → ready_for_quote
  → closed

need_engineer_review
  → need_clarification
  → waiting_customer
  → ready_for_quote
  → closed

ready_for_quote
  → closed

closed
  → new（仅允许人工恢复，第一版可不开放）
```

### 5.1 第一版流转规则表

| 当前状态 | 允许转入状态 | 说明 |
|---|---|---|
| new | invalid | 判断为无效询盘 |
| new | need_clarification | 有效询盘但缺少参数 |
| new | need_engineer_review | 需求较明确，需要研发确认 |
| new | closed | 人工关闭 |
| need_clarification | waiting_customer | 已生成或发送补充参数请求 |
| need_clarification | need_engineer_review | 参数已补充或人工判断可提交研发 |
| need_clarification | closed | 客户无效或不再推进 |
| waiting_customer | need_clarification | 客户回复仍不完整 |
| waiting_customer | need_engineer_review | 客户补充后可提交研发 |
| waiting_customer | ready_for_quote | 已满足报价前条件 |
| waiting_customer | closed | 长期无回复或人工关闭 |
| need_engineer_review | need_clarification | 研发认为还需客户补充参数 |
| need_engineer_review | waiting_customer | 已向客户发送确认问题 |
| need_engineer_review | ready_for_quote | 人工确认可以转报价 |
| need_engineer_review | closed | 不可做或不再推进 |
| ready_for_quote | closed | 报价前或报价后关闭 |

---

## 6. 后续完整状态流转

后续如果引入研发评审模块和报价前交接模块，可以采用以下完整流转：

```text
new
  → invalid
  → product_unrelated
  → need_clarification
  → need_engineer_review
  → closed

product_unrelated
  → closed

need_clarification
  → waiting_customer
  → need_engineer_review
  → closed

waiting_customer
  → need_clarification
  → need_engineer_review
  → waiting_customer_confirmation
  → ready_for_quote
  → closed

need_engineer_review
  → waiting_engineer
  → need_clarification
  → closed

waiting_engineer
  → engineer_confirmed_possible
  → engineer_confirmed_adjustment
  → engineer_rejected
  → need_clarification

engineer_confirmed_possible
  → waiting_customer_confirmation
  → ready_for_quote

engineer_confirmed_adjustment
  → waiting_customer_confirmation
  → need_clarification

engineer_rejected
  → closed

waiting_customer_confirmation
  → ready_for_quote
  → need_clarification
  → closed

ready_for_quote
  → quotation_stage
  → closed

quotation_stage
  → closed
```

---

## 7. AI 在状态流转中的权限

AI 可以做：

```text
判断邮件类型
判断是否有效询盘
判断是否产品相关
提取客户需求参数
判断缺失字段
建议下一步状态
生成内部摘要
生成回复草稿
```

AI 不可以做：

```text
自动进入 ready_for_quote
自动进入 quotation_stage
自动关闭重要询盘
自动承诺技术可行性
自动承诺价格
自动承诺交期
自动确认合同、付款、PI
绕过人工审核发送高风险邮件
```

### 7.1 AI 状态建议规则

AI 可以向系统写入：

```text
suggested_status
suggested_action
reason
confidence
risk_level
```

但状态是否真正变更，应根据以下规则处理：

| 场景 | 是否允许 AI 自动变更状态 |
|---|---|
| 明显广告或垃圾邮件 | 第一版建议不自动关闭，只建议 invalid |
| 明显参数缺失 | 可建议 need_clarification |
| 技术参数明确但需确认 | 可建议 need_engineer_review |
| 涉及报价、合同、付款 | 不允许自动变更为报价状态，必须人工确认 |
| 涉及敏感应用或合规风险 | 不允许自动推进，必须人工确认 |
| 进入 ready_for_quote | 必须人工确认 |
| 进入 quotation_stage | 必须人工确认 |
| closed 状态恢复 | 必须人工确认 |

---

## 8. 报价边界规则

`ready_for_quote` 是本系统最重要的边界状态之一。

进入 `ready_for_quote` 表示：

```text
客户需求基本明确；
产品能力或研发判断基本明确；
客户有继续推进意向；
可以转交业务人员准备报价。
```

但它不表示：

```text
已经报价；
已经确认价格；
已经确认交期；
已经确认付款；
已经形成合同；
已经发送 PI。
```

### 8.1 ready_for_quote 后的 AI 限制

进入 `ready_for_quote` 后，AI 可以：

```text
生成内部交接摘要
整理客户需求
整理研发意见
整理附件列表
提醒风险点
辅助业务人员查看上下文
```

AI 不可以：

```text
继续自动对外回复普通询盘邮件
自动发送报价
自动发送价格
自动承诺交期
自动确认付款方式
自动发送 PI
自动确认合同条款
```

### 8.2 报价相关关键词触发人工接管

客户邮件或 AI 草稿出现以下内容时，必须进入人工审核或报价流程：

```text
price
quotation
quote
payment
invoice
contract
PI
purchase order
lead time confirmation
commercial terms
```

中文包括：

```text
价格
报价
付款
发票
合同
形式发票
采购订单
交期确认
商务条款
```

---

## 9. 需求完整度与状态关系

### 9.1 需求不完整

如果客户只提供模糊需求，例如：

```text
We need an RF circulator. Please quote.
```

推荐状态：

```text
need_clarification
```

处理方式：

```text
AI 提取已有信息；
AI 判断缺失字段；
AI 生成补充参数邮件草稿；
人工审核后发送；
状态转为 waiting_customer。
```

---

### 9.2 需求部分明确

例如：

```text
We need a 12-15GHz microstrip circulator, small size, 10 pcs.
```

推荐状态：

```text
need_clarification
```

或人工判断后转为：

```text
need_engineer_review
```

处理方式：

```text
若缺失关键技术参数，优先询问客户；
若已有相似经验，可同步生成研发评审建议；
不得直接承诺可做。
```

---

### 9.3 需求较明确

例如：

```text
We need a 12-15GHz microstrip circulator, 20W CW, IL below 0.5dB, isolation above 18dB, VSWR below 1.3, quantity 50 pcs.
```

推荐状态：

```text
need_engineer_review
```

处理方式：

```text
检索产品库或历史案例；
生成研发评审单；
等待研发确认；
研发确认前不得说 can definitely make it。
```

---

## 10. 附件解析与状态规则

如果客户邮件包含附件，附件可能影响需求判断。

### 10.1 附件成功解析

若附件成功解析，并提取到完整规格参数：

```text
可进入 need_engineer_review
```

### 10.2 附件解析失败

若附件无法解析：

```text
不得假装已读取附件；
应标记 attachment parse failed；
状态建议为 need_clarification 或 manual review；
对外回复需人工确认。
```

### 10.3 附件包含报价、合同或订单

如附件包含：

```text
quotation
contract
purchase order
PI
commercial terms
```

必须人工接管，不允许 AI 自动推进。

---

## 11. 无效询盘规则

以下邮件可建议标记为 `invalid`：

```text
广告推广
SEO 推销
乱填内容
无意义内容
明显机器人提交
没有任何产品需求
重复垃圾邮件
```

但第一版建议：

```text
AI 只建议 invalid；
是否最终关闭由人工确认。
```

---

## 12. 非主营产品规则

后续完整状态中，非主营产品可标记为：

```text
product_unrelated
```

第一版状态未包含 `product_unrelated` 时，可以暂时处理为：

```text
invalid
```

或：

```text
closed
```

但建议在 AI 判断结果中保留分类：

```text
classification = unrelated_product
```

这样后续统计时可以区分“垃圾邮件”和“非主营产品”。

---

## 13. 高风险人工接管规则

以下场景必须人工接管：

```text
报价
价格
付款
合同
发票
PI
采购订单
正式交期
质量投诉
售后争议
出口管制
军事敏感应用
制裁风险
客户重要项目
AI 置信度低
附件解析失败
研发意见不明确
```

人工接管后，AI 仅可辅助生成内部摘要，不得自动发送对外邮件。

---

## 14. 状态变更留痕要求

每次状态变化建议记录：

```text
inquiry_case_id
from_status
to_status
reason
changed_by
changed_by_type
created_at
```

第一版可以先不单独建状态日志表，但后续建议加入：

```text
inquiry_status_logs
```

如果第一版不建日志表，也至少应在操作日志或系统日志中记录状态修改。

---

## 15. 前端展示建议

询盘台账列表建议展示：

```text
客户
邮箱
询盘主题
产品类型
频率范围
数量
状态
优先级
最近邮件时间
负责人
更新时间
```

详情页建议展示：

```text
基础信息
原始邮件
关联邮件
AI 判断
提取参数
缺失字段
当前状态
状态操作按钮
备注
```

状态操作不应只做自由下拉，应根据当前状态限制允许转入的状态。

---

## 16. 当前阶段开发建议

如果当前开发任务是第一阶段，则只需要实现：

```text
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed
```

并支持人工修改状态。

本阶段不要实现：

```text
完整研发评审状态
quotation_stage
自动状态流转
复杂合规审批流
全自动关闭规则
```

---

## 17. 总结

本状态机的核心边界是：

```text
AI 可以建议状态，但不能越权推进。
客户需求不完整，应进入 need_clarification。
技术可行性不明确，应进入 need_engineer_review。
等待客户回复，应进入 waiting_customer。
准备报价，应进入 ready_for_quote。
进入报价边界后，AI 不再自动接手对外回复。
```

状态机不是装饰品，而是系统的铁轨。铁轨清楚，AI 才不会把询盘开进田里。
