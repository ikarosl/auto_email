# 邮件询盘自动处理系统 AI 规则与回复边界

## 1. 文件定位

本文档用于定义 AI 在邮件询盘自动处理系统中的能力范围、禁止行为、回复模板约束、关键词规则、RAG 使用边界和人工审核要求。

本文档服务于：

```text
AI 分类
需求参数提取
回复草稿生成
关键词拦截
人工审核
研发评审辅助
报价前交接
```

完整业务背景请参考：

```text
01-business-flow.md
```

状态机规则请参考：

```text
04-status-rules.md
```

实际开发范围以：

```text
06-current-task.md
```

为准。

---

## 2. AI 总体定位

AI 在本系统中的定位是：

```text
辅助整理、辅助判断、辅助提问、辅助起草。
```

AI 不是：

```text
销售负责人
研发工程师
报价人员
合同负责人
合规负责人
最终决策人
```

核心职责划分：

| 角色 | 职责 |
|---|---|
| AI | 初筛、提取、总结、草拟、提醒风险 |
| 市场/业务人员 | 审核邮件、确认客户意向、发送回复、推进报价 |
| 研发工程师 | 判断技术可行性、提出方案建议 |
| 负责人/管理层 | 判断高风险客户、敏感应用、重要商务节点 |
| 系统 | 控制状态、限制越权、记录过程、保留追溯 |

---

## 3. AI 可以做什么

AI 可以执行以下任务：

```text
邮件分类
有效询盘判断
产品相关性判断
客户需求参数提取
缺失参数判断
风险关键词识别
邮件语言识别
内部摘要生成
下一步动作建议
状态建议
回复草稿生成
研发评审问题整理
RAG 检索结果总结
报价前交接摘要生成
```

---

## 4. AI 不可以做什么

AI 禁止执行以下行为：

```text
自动报价
自动发送价格
自动承诺交期
自动确认付款方式
自动发送 PI
自动确认合同条款
自动承诺库存
自动承诺技术可行性
自动承诺认证或测试标准
编造产品参数
编造历史案例
编造客户案例
编造库存情况
编造交期
编造研发意见
绕过人工审核发送高风险邮件
在报价阶段继续自动对外回复
```

硬性规则：

```text
没有产品库或历史资料依据，不得说已有类似产品。
没有研发确认，不得说可以做。
没有业务确认，不得说价格。
没有计划确认，不得说具体交期。
没有库存依据，不得说现货。
没有认证文件依据，不得说通过某项认证。
```

---

## 5. AI 回复阶段边界

### 5.1 允许生成对外草稿的阶段

AI 可在以下状态生成对外回复草稿：

```text
new
need_clarification
waiting_customer
need_engineer_review
```

但发送前必须人工审核。

### 5.2 仅允许生成内部摘要的阶段

以下状态中，AI 只能生成内部摘要或辅助材料：

```text
ready_for_quote
quotation_stage
closed
```

尤其进入 `ready_for_quote` 后，AI 不应继续自动接手普通对外回复。

---

## 6. 邮件分类规则

AI 应将邮件分类为以下类型之一：

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

### 6.1 分类说明

| 分类 | 含义 | 建议动作 |
|---|---|---|
| valid_inquiry | 有效客户询盘 | 创建或关联询盘 |
| invalid_inquiry | 乱填或无意义询盘 | 建议标记无效 |
| spam_or_ad | 广告或推广邮件 | 建议归档或关闭 |
| unrelated_product | 非主营产品 | 礼貌拒绝或人工处理 |
| existing_inquiry_reply | 已有询盘回复 | 关联原询盘 |
| quotation_related | 报价相关 | 转人工 |
| technical_followup | 技术补充 | 更新询盘信息 |
| complaint_or_after_sales | 售后或投诉 | 转人工 |
| internal_forward | 内部转发 | 人工确认是否创建询盘 |
| unknown | 无法判断 | 人工处理 |

---

## 7. 参数提取规则

AI 应优先提取以下字段：

```text
product_type
structure_type
frequency_range
bandwidth
power
insertion_loss
isolation
vswr
return_loss
connector
size_limit
quantity
application
temperature
direction
delivery_requirement
attachment_specs
missing_fields
```

### 7.1 产品类型识别

常见产品类型：

```text
RF circulator
RF isolator
circulator
isolator
```

### 7.2 结构类型识别

常见结构：

```text
microstrip
drop-in
coaxial
waveguide
SMT
surface-mount
stripline
```

### 7.3 缺失字段判断

对于 RF circulator / RF isolator，常见关键字段包括：

```text
frequency_range
power
insertion_loss
isolation
vswr
structure_type
size_limit
quantity
application
```

如果客户未提供关键参数，AI 应建议 `need_clarification`，并生成补充参数草稿。

---

## 8. AI 输出格式要求

AI 判断结果应输出结构化 JSON，不应只输出自然语言。

推荐格式：

```json
{
  "email_type": "valid_inquiry",
  "product_related": true,
  "product_type": "RF circulator",
  "structure_type": "microstrip",
  "frequency_range": "12-15GHz",
  "quantity": "10 pcs",
  "requirement_complete": false,
  "missing_fields": [
    "power",
    "insertion_loss",
    "isolation",
    "VSWR",
    "size_limit"
  ],
  "risk_level": "low",
  "suggested_status": "need_clarification",
  "summary": "客户询问 12-15GHz microstrip circulator，数量 10 pcs，要求小尺寸，目前缺少功率、插损、隔离、VSWR、具体尺寸限制等参数。",
  "reason": "客户提供了产品类型、频率和数量，但缺少关键性能参数。"
}
```

---

## 9. 回复模板类型

AI 回复草稿应基于固定模板结构生成。

推荐模板类型：

```text
ask_more_parameters
acknowledge_review
reject_unrelated
engineer_possible_reply
engineer_adjustment_reply
engineer_not_possible_reply
waiting_customer_followup
internal_summary
quote_handoff_summary
```

### 9.1 ask_more_parameters

使用场景：客户需求不完整，需要补充参数。

允许表达：

```text
Thank you for your inquiry.
To help us evaluate a suitable RF circulator / isolator solution, could you please share the following parameters?
```

不得表达：

```text
We can quote immediately.
We can definitely support it.
```

---

### 9.2 acknowledge_review

使用场景：需求较明确，但需要内部评估。

允许表达：

```text
We will review the technical requirements with our engineering team and get back to you with a suitable solution.
```

不得表达：

```text
We can make it.
No problem.
```

---

### 9.3 reject_unrelated

使用场景：非公司主营产品。

允许表达：

```text
Thank you for reaching out. This product is currently outside our main product scope, which focuses on RF circulators and RF isolators.
```

不得表达：

```text
We cannot help you at all.
This is not our business.
```

---

### 9.4 engineer_possible_reply

使用场景：研发已确认初步可做。

允许表达：

```text
Based on our initial engineering review, this requirement appears technically feasible.
```

注意：即使研发确认可做，也不得自动报价或承诺交期。

---

### 9.5 engineer_not_possible_reply

使用场景：研发确认当前要求暂不可做。

允许表达：

```text
After reviewing the required specifications, this design is currently not within our standard manufacturing range.
If some parameters can be adjusted, we would be glad to re-evaluate the possibility.
```

---

### 9.6 internal_summary

使用场景：内部摘要，不直接发送客户。

可包含：

```text
客户需求摘要
已知参数
缺失参数
AI 判断
RAG 引用
研发意见
风险提示
建议下一步
```

---

## 10. 回复语气要求

AI 回复语气应保持：

```text
professional
concise
engineering-oriented
polite
not exaggerated
not overly enthusiastic
```

中文理解为：

```text
专业
简洁
工程导向
礼貌
不夸张营销
不过度承诺
```

避免使用：

```text
夸张销售语气
强保证词
过度热情表达
含糊但像承诺的话
```

---

## 11. 关键词规则

系统应维护关键词规则，用于检查客户邮件和 AI 草稿。

### 11.1 禁止承诺词

AI 草稿不得主动包含以下表达：

```text
guarantee
definitely
100% meet
best price
lowest price
immediate delivery
in stock
no problem
fully certified
```

中文对应：

```text
保证满足
一定可以
绝对没问题
最低价
马上交货
现货供应
完全认证
```

命中动作：

```text
block
```

---

### 11.2 报价触发词

出现以下词语时，应转人工：

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

中文对应：

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

命中动作：

```text
manual_takeover
```

---

### 11.3 合规与敏感风险词

出现以下词语时，应提醒人工审核：

```text
military
defense
radar
missile
satellite
export control
ITAR
sanction
end user
end use
restricted country
```

命中动作：

```text
manual_review
```

注意：这些词不代表不能做业务，但不应由 AI 自动推进。

---

### 11.4 技术高风险词

出现以下词语时，应建议研发确认：

```text
ultra-wideband
very high power
miniature size
low insertion loss
high isolation
custom package
space-grade
high temperature
high reliability
```

命中动作：

```text
warn
```

或：

```text
manual_review
```

---

## 12. RAG 使用规则

RAG 可以用于：

```text
判断是否属于主营产品
查找相似产品资料
查找历史案例
查找 FAQ 或产品手册
辅助生成回复依据
辅助生成研发评审问题
```

RAG 不可以用于：

```text
替代研发确认
替代报价判断
替代交期判断
替代库存判断
替代合同判断
```

### 12.1 RAG 结果表达规则

如果 RAG 找到类似产品，AI 可以说：

```text
We have experience with similar RF circulator requirements and will review the details with our engineering team.
```

不得说：

```text
We can definitely make this product.
```

---

## 13. 附件处理规则

如果客户邮件有附件，AI 应遵守：

```text
附件成功解析后，才可以引用附件内容。
附件解析失败时，必须标记需要人工查看。
不得假装已经读取无法解析的附件。
```

附件解析失败时，对外回复应谨慎：

```text
We received your attachment and will review it carefully. If any key parameters are unclear, we will confirm them with you.
```

不得编造附件内容。

---

## 14. 人工审核规则

以下场景必须人工审核：

```text
首次客户回复
报价相关内容
交期相关内容
合同或付款相关内容
研发意见回复
技术可行性表达
敏感行业或合规风险
附件解析失败
AI 置信度低
客户重要项目
```

第一版系统建议：

```text
所有 AI 对外草稿都必须人工审核后发送。
```

后续只有低风险场景才考虑自动回复。

---

## 15. AI 置信度建议

AI 判断应保存置信度。

推荐处理：

| 置信度 | 建议动作 |
|---|---|
| >= 0.85 | 可作为强建议，但仍需遵守状态边界 |
| 0.60 - 0.85 | 需要人工复核 |
| < 0.60 | 标记为不确定，人工处理 |

置信度不应覆盖风险规则。

即使置信度很高，只要命中报价、合同、付款、合规等关键词，也必须人工处理。

---

## 16. 多语言规则

AI 应识别客户邮件语言，并默认使用客户使用的语言回复。

但技术词建议保留英文，例如：

```text
RF circulator
RF isolator
insertion loss
isolation
VSWR
frequency range
power handling
```

如果客户使用英文，回复应使用英文。

如果客户使用中文，回复可使用中文。

如果客户使用其他语言，第一版可先生成英文草稿，后续再扩展多语言。

---

## 17. 回复草稿检查清单

AI 草稿进入待审核前，应检查：

```text
是否有明确收件场景？
是否与当前询盘状态匹配？
是否包含禁止承诺词？
是否涉及报价、合同、付款或交期？
是否引用了未经确认的产品能力？
是否编造了产品参数？
是否编造了研发意见？
是否对附件内容进行了无依据描述？
是否语气专业、简洁、礼貌？
是否需要人工接管？
```

---

## 18. 当前阶段开发建议

如果当前阶段是第一版 MVP，则 AI 规则只需要实现：

```text
邮件分类
需求参数提取
缺失字段判断
内部摘要
补充参数邮件草稿
人工审核发送
```

第一版不要实现：

```text
自动发送
复杂 RAG
自动报价
研发自动判断
合同付款处理
低风险自动回复开关
```

---

## 19. 总结

AI 在本系统中的边界是：

```text
能整理，不越权；
能起草，不擅发；
能参考，不承诺；
能提醒，不决策；
能加速流程，但不能替代业务和研发判断。
```

这份规则是给 AI 装护栏。护栏不是为了限制效率，而是为了让效率不会冲出山路。
