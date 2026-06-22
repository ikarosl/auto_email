# 邮件询盘自动处理业务流程参考文件

## 1. 文件定位

本文档用于描述 B2B 客户邮件询盘处理的完整业务流程，作为后续系统设计、AI 能力接入、数据表设计、状态机设计和开发任务拆分的业务参考。

本文档只作为业务背景和流程边界说明，不代表当前阶段需要一次性全部实现。实际开发范围应以 `docs/06-current-task.md` 或具体任务说明为准。

---

## 2. 业务目标

本系统的目标不是让 AI 完全替代业务人员自动销售，而是让 AI 在可控流程内辅助完成：

* 邮件初筛
* 有效询盘识别
* 客户需求参数提取
* 缺失参数判断
* 回复草稿生成
* 内部技术评审信息整理
* 报价前交接摘要生成
* 询盘处理过程留痕

系统应优先保证：

* 流程可控
* 边界清晰
* 人工可审核
* 技术承诺不越权
* 报价阶段不由 AI 自动接手
* 每一步判断有记录可追溯

---

## 3. 适用业务范围

本流程主要适用于公司主营产品相关的海外客户邮件询盘，包括但不限于：

* RF circulator
* RF isolator
* microstrip circulator
* drop-in circulator
* coaxial circulator
* waveguide circulator
* SMT circulator
* custom RF/microwave passive components

当前重点服务场景：

* 客户通过官网表单发送询盘
* 客户直接发送邮件询问产品
* 客户回复已有邮件线程继续补充需求
* 客户发送规格书、图纸、参数表或采购需求
* 内部人员转发客户需求至系统处理

---

## 4. 不适用或需人工处理的范围

以下场景不应由 AI 自动接手，应转人工处理或进入低优先级：

* 广告推广邮件
* 乱填询盘
* 非本公司主营产品需求
* 明显无效或恶意内容
* 供应商推销邮件
* 招聘、合作、展会推广等非客户询盘
* 涉及正式报价
* 涉及付款、合同、发票、PI
* 涉及明确交期承诺
* 涉及出口管制、军事敏感、制裁风险等高风险内容
* 涉及客户投诉、质量争议、售后纠纷
* 涉及已有订单变更
* 涉及法律、财务、合同条款

---

## 5. 总体业务流程

完整邮件询盘处理流程如下：

```text
客户邮件进入
  ↓
邮件解析与入库
  ↓
判断邮件类型
  ↓
判断是否为有效客户询盘
  ↓
判断是否为公司相关产品
  ↓
识别客户与邮件线程
  ↓
创建或关联询盘记录
  ↓
AI 提取客户需求参数
  ↓
判断需求是否明确
  ↓
如需求不完整：
    AI 生成补充参数回复草稿
    人工审核后发送
  ↓
如需求较明确：
    检索产品库 / 历史案例 / 技术资料
    判断是否有相似产品或能力参考
  ↓
需要研发确认：
    生成内部研发评审单
    等待研发工程师反馈
  ↓
研发确认可做 / 需调整 / 不可做 / 需更多信息
  ↓
AI 根据研发意见生成对外回复草稿
  ↓
人工审核后发送
  ↓
客户确认继续
  ↓
进入报价准备阶段
  ↓
AI 停止自动接手对外回复
  ↓
转业务人员处理报价、交期、合同等事项
```

---

## 6. 邮件接收后的基础处理

邮件进入系统后，应先完成基础解析和结构化存储。

需要识别的信息包括：

* 邮件唯一 ID
* 邮件线程 ID
* 发件人邮箱
* 发件人名称
* 发件人公司或域名
* 收件人
* 抄送人
* 邮件主题
* 邮件正文
* 邮件 HTML 内容
* 邮件接收时间
* 邮件语言
* 附件列表
* 是否为回复邮件
* 是否已关联询盘
* 是否需要人工处理

邮件不应直接进入 AI 回复流程，而应先完成分类与有效性判断。

---

## 7. 邮件类型判定

系统需要将收到的邮件初步分类。

推荐分类如下：

| 类型                       | 说明         | 建议处理方式       |
| ------------------------ | ---------- | ------------ |
| valid_inquiry            | 有效客户询盘     | 进入询盘流程       |
| invalid_inquiry          | 乱填、无意义询盘   | 标记无效         |
| spam_or_ad               | 广告或推广邮件    | 归档或忽略        |
| unrelated_product        | 非公司主营产品    | 礼貌拒绝或人工处理    |
| existing_inquiry_reply   | 已有询盘的继续沟通  | 关联原询盘        |
| quotation_related        | 报价、价格、合同相关 | 转人工          |
| technical_followup       | 技术参数补充或确认  | 关联原询盘并继续处理   |
| complaint_or_after_sales | 投诉、售后、质量问题 | 转人工          |
| internal_forward         | 内部转发邮件     | 根据内容判断是否创建询盘 |

分类结果应保存，并记录 AI 判断原因和置信度。

---

## 8. 有效询盘判定规则

一封邮件是否为有效询盘，应综合判断以下因素：

* 是否来自真实客户或潜在客户
* 是否表达了产品需求
* 是否与公司主营产品相关
* 是否包含产品名称、型号、参数、应用或采购意向
* 是否包含明确沟通目的
* 是否不是明显广告、垃圾邮件或乱填内容

有效询盘示例：

```text
We are looking for a 12-15GHz microstrip circulator, small size, 10 pcs.
Could you please advise if you can support this requirement?
```

无效询盘示例：

```text
Hello, I want your product. Please contact me.
```

广告邮件示例：

```text
We provide SEO services and can help you rank on Google.
```

非主营产品示例：

```text
Can you supply antennas, RF cables, or power amplifiers?
```

---

## 9. 客户与询盘上下文管理

系统不应简单按照“单个客户”维护一个大上下文。

同一客户可能同时存在多个不同需求，因此应按以下层级管理上下文：

```text
customer
  └── inquiry_case
        └── email_thread
              └── email_message
```

推荐规则：

* 一个客户可以有多个询盘。
* 一个询盘可以关联多个邮件。
* 一个邮件线程通常对应一个询盘，但允许人工调整。
* AI 回复时应优先读取当前邮件、当前邮件线程、当前询盘摘要。
* 不应默认读取该客户所有历史邮件，避免不同项目之间串台。
* 如需参考历史项目，应通过明确的产品库、历史案例或人工选择引入。

---

## 10. 询盘状态机

询盘应有明确状态，AI 和人工操作都必须围绕状态流转进行。

推荐状态如下：

| 状态                            | 含义                     |
| ----------------------------- | ---------------------- |
| new                           | 新收到，尚未处理               |
| invalid                       | 无效询盘                   |
| product_unrelated             | 非公司主营产品                |
| need_clarification            | 客户需求不完整，需要补充参数         |
| waiting_customer              | 已向客户询问补充信息，等待客户回复      |
| need_engineer_review          | 需求较明确，需要研发确认           |
| waiting_engineer              | 已提交研发，等待研发反馈           |
| engineer_confirmed_possible   | 研发初步确认可做               |
| engineer_confirmed_adjustment | 研发确认需调整参数或方案           |
| engineer_rejected             | 研发确认暂不可做               |
| waiting_customer_confirmation | 已回复客户方案或可行性，等待客户确认是否继续 |
| ready_for_quote               | 技术和客户意向基本明确，准备进入报价     |
| quotation_stage               | 报价阶段                   |
| closed                        | 已关闭                    |

第一版开发可以简化为：

```text
new
invalid
need_clarification
need_engineer_review
waiting_customer
ready_for_quote
closed
```

但完整业务上应保留后续扩展空间。

---

## 11. 状态流转参考

推荐状态流转如下：

```text
new
  → invalid
  → product_unrelated
  → need_clarification
  → need_engineer_review

need_clarification
  → waiting_customer

waiting_customer
  → need_engineer_review
  → closed

need_engineer_review
  → waiting_engineer

waiting_engineer
  → engineer_confirmed_possible
  → engineer_confirmed_adjustment
  → engineer_rejected
  → need_clarification

engineer_confirmed_possible
  → waiting_customer_confirmation

engineer_confirmed_adjustment
  → waiting_customer_confirmation

engineer_rejected
  → closed

waiting_customer_confirmation
  → ready_for_quote
  → closed

ready_for_quote
  → quotation_stage

quotation_stage
  → closed
```

关键规则：

* 进入 `ready_for_quote` 后，AI 不应继续自动接手对外回复。
* 涉及价格、付款、合同、PI、正式交期承诺时，必须转人工。
* `closed` 状态如需恢复，应由人工操作。
* AI 可以建议状态变更，但不应在高风险节点自动变更。

---

## 12. 客户需求参数提取

AI 应从邮件正文和附件中提取客户需求参数。

重点字段包括：

| 字段                   | 说明                                                      |
| -------------------- | ------------------------------------------------------- |
| product_type         | 产品类型，如 RF circulator / RF isolator                      |
| structure_type       | 结构类型，如 microstrip / drop-in / coaxial / waveguide / SMT |
| frequency_range      | 频率范围                                                    |
| bandwidth            | 带宽                                                      |
| power                | 功率                                                      |
| insertion_loss       | 插入损耗                                                    |
| isolation            | 隔离度                                                     |
| vswr                 | 驻波比                                                     |
| return_loss          | 回波损耗                                                    |
| connector            | 接口或连接器                                                  |
| size_limit           | 尺寸限制                                                    |
| quantity             | 数量                                                      |
| application          | 应用场景                                                    |
| temperature          | 工作温度                                                    |
| direction            | circulator 方向或端口方向要求                                    |
| delivery_requirement | 客户期望交期                                                  |
| attachment_specs     | 附件中的规格信息                                                |
| missing_fields       | 当前缺失的关键参数                                               |

---

## 13. 需求完整度判断

系统应判断客户需求是否足够明确。

### 13.1 需求不完整

示例：

```text
We need an RF circulator. Please quote.
```

处理方式：

* 标记为 `need_clarification`
* AI 生成补充参数邮件草稿
* 人工审核后发送

需要询问的参数通常包括：

* frequency range
* product type or structure
* power level
* insertion loss
* isolation
* VSWR or return loss
* size limit
* quantity
* application

### 13.2 需求部分明确

示例：

```text
We need a 12-15GHz microstrip circulator, small size, 10 pcs.
```

已知信息：

* 产品：microstrip circulator
* 频率：12-15GHz
* 数量：10 pcs
* 要求：small size

缺失信息：

* power
* insertion loss
* isolation
* VSWR
* exact size limit
* application

处理方式：

* 标记为 `need_clarification` 或 `need_engineer_review`
* 如果关键参数不足，优先向客户补充确认
* 如果已有类似产品，也可同步生成内部评审建议

### 13.3 需求较明确

示例：

```text
We need a 12-15GHz microstrip circulator, 20W CW, insertion loss below 0.5dB, isolation above 18dB, VSWR below 1.3, quantity 50 pcs.
```

处理方式：

* 检索产品库和历史案例
* 判断是否有相似产品
* 如需确认，提交研发评审
* 不得在研发确认前直接承诺可做

---

## 14. RAG 与产品资料检索

RAG 检索的作用是辅助判断和回复，不是最终技术承诺。

可检索资料包括：

* 产品库
* 历史项目
* FAQ
* 公司能力介绍
* 产品手册
* 技术说明
* 研发沉淀意见
* 已验证案例

RAG 应服务于以下问题：

* 客户需求是否属于公司主营产品？
* 是否有相似产品？
* 是否在已有频率、结构、功率范围内？
* 是否需要研发确认？
* 回复客户时是否有可引用依据？
* 是否存在不能承诺的风险点？

RAG 输出应包含：

* 匹配资料来源
* 匹配内容摘要
* 匹配度
* 是否建议转研发
* 不确定点

关键规则：

* RAG 找到相似资料，不等于可以直接承诺可做。
* 没有研发确认，不得说“可以做”。
* 没有库存依据，不得说“有现货”。
* 没有交期依据，不得说具体交期。
* 没有报价依据，不得说价格。

---

## 15. 回复模板约束

AI 回复应基于固定模板或模板结构生成，不应自由发挥。

推荐模板类型：

| 模板类型                        | 使用场景              |
| --------------------------- | ----------------- |
| ask_more_parameters         | 需求不完整，询问补充参数      |
| acknowledge_review          | 需求较明确，告知客户内部评估    |
| reject_unrelated            | 非公司主营产品           |
| engineer_possible_reply     | 研发确认可做后的回复        |
| engineer_adjustment_reply   | 研发确认需调整参数后的回复     |
| engineer_not_possible_reply | 研发确认不可做后的回复       |
| quotation_handoff_notice    | 进入报价前内部交接，不对外自动发送 |
| waiting_customer_followup   | 等待客户补充信息后的跟进      |

回复语气要求：

* 专业
* 简洁
* 工程导向
* 不夸张营销
* 不过度承诺
* 不主动报价
* 不使用含糊或过强保证词

---

## 16. 关键词约束

系统应设置关键词规则，用于触发人工接管、风险提醒或禁止生成。

### 16.1 禁止承诺类词语

AI 不应主动使用：

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

### 16.2 报价触发词

出现以下词语时，应转人工或进入报价相关流程：

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

### 16.3 合规与敏感风险词

出现以下词语时，应触发人工审核：

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

注意：这些词不代表不能做业务，但 AI 不应自动继续推进，应提醒人工判断。

### 16.4 技术高风险词

以下词语意味着可能需要研发确认：

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

---

## 17. AI 权限边界

AI 可以做：

* 邮件分类
* 有效询盘判断
* 产品相关性判断
* 需求参数提取
* 缺失参数判断
* 生成内部摘要
* 生成回复草稿
* 生成研发评审问题
* 生成报价前交接摘要
* 标记风险点
* 建议下一步状态

AI 不可以做：

* 自动报价
* 自动承诺价格
* 自动承诺交期
* 自动确认合同条款
* 自动发送 PI
* 自动承诺库存
* 自动承诺技术可行性
* 编造产品参数
* 编造认证信息
* 编造历史案例
* 在报价阶段继续自动对外回复
* 绕过人工审核处理高风险邮件

核心规则：

```text
AI 负责整理、判断、提问、起草。
研发负责判断能不能做。
业务负责判断是否报价、如何报价。
管理或负责人负责高风险客户和敏感应用判断。
```

---

## 18. 研发评审流程

当客户需求较明确，但是否可做需要技术确认时，应进入研发评审流程。

AI 可生成内部研发评审单，包括：

* 客户名称
* 客户邮箱
* 询盘主题
* 产品类型
* 结构类型
* 频率范围
* 功率要求
* 插损要求
* 隔离要求
* VSWR 要求
* 尺寸要求
* 数量
* 应用场景
* 附件情况
* 缺失参数
* RAG 匹配结果
* AI 建议问题
* 需要研发确认的事项

研发反馈类型：

| 反馈                       | 含义        |
| ------------------------ | --------- |
| possible                 | 初步可做      |
| possible_with_adjustment | 参数调整后可能可做 |
| need_more_information    | 需要客户补充信息  |
| not_possible             | 暂不可做      |

研发意见优先级高于 AI 判断。

---

## 19. 报价前交接流程

当以下条件基本满足时，可以进入报价准备阶段：

* 客户需求基本明确
* 产品属于公司能力范围
* 研发已确认可做或有可行方案
* 客户确认有继续推进意向
* 关键技术风险已被识别
* 不存在未处理的明显合规风险

进入 `ready_for_quote` 后，AI 应停止自动对外回复。

系统应生成报价前交接摘要，内容包括：

* 客户信息
* 客户需求摘要
* 已确认参数
* 缺失参数
* 研发意见
* 可行性结论
* 附件列表
* 历史沟通摘要
* 风险提示
* 建议业务人员关注事项

报价阶段由业务人员或负责人处理。

AI 在报价阶段最多只能辅助生成内部摘要，不得自动发送报价、价格、交期、付款或合同相关内容。

---

## 20. 附件处理流程

客户邮件可能包含附件，例如：

* PDF 规格书
* Excel 参数表
* 图纸
* datasheet
* BOM
* 历史报价单
* 技术要求文档

附件处理流程：

```text
附件识别
  ↓
附件保存
  ↓
文件类型判断
  ↓
文本或参数提取
  ↓
关联至邮件和询盘
  ↓
判断是否需要人工查看
```

如果附件无法解析，应明确标记：

```text
附件未成功解析，需要人工查看。
```

AI 不得假装已经读取或理解无法解析的附件。

---

## 21. 人工审核流程

AI 生成的对外回复应进入人工审核。

人工审核动作包括：

* 查看原始邮件
* 查看邮件线程
* 查看 AI 分类结果
* 查看需求参数提取结果
* 查看缺失参数
* 查看 RAG 引用
* 查看研发意见
* 查看 AI 草稿
* 修改草稿
* 批准发送
* 驳回重写
* 标记转人工
* 修改询盘状态

推荐草稿状态：

| 状态              | 含义    |
| --------------- | ----- |
| draft           | 草稿已生成 |
| pending_review  | 待人工审核 |
| approved        | 已批准   |
| sent            | 已发送   |
| rejected        | 已驳回   |
| manual_takeover | 转人工处理 |

第一版建议只做“AI 生成草稿 + 人工点击发送”，不要做全自动发送。

---

## 22. 留痕与追溯

系统应记录每一次关键操作。

需要记录：

* 邮件接收记录
* 邮件分类结果
* AI 判断结果
* AI 判断置信度
* AI 判断原因
* 提取出的客户参数
* 缺失参数
* RAG 检索引用
* 研发评审意见
* AI 生成的草稿
* 人工修改内容
* 最终发送内容
* 状态变更记录
* 操作人
* 操作时间

目的：

* 便于复盘 AI 是否判断正确
* 便于追踪客户沟通过程
* 便于优化询盘表单
* 便于沉淀客户需求
* 便于统计询盘质量
* 便于防止 AI 无依据回复

---

## 23. 数据分析与复盘方向

后续系统稳定后，可以统计：

* 每周有效询盘数量
* 无效询盘比例
* 广告邮件比例
* 不同产品类型询盘数量
* 不同国家或地区询盘数量
* 客户最常缺失的参数
* 从询盘到报价的转化率
* 从邮件进入到首次回复的时间
* 研发平均响应时间
* AI 分类准确率
* AI 草稿人工修改率
* 哪些模板回复效果更好
* 哪些 SEO 页面带来的询盘质量更高

这些数据可反向优化：

* 官网询盘表单
* SEO 内容选题
* FAQ 内容
* 产品页面参数说明
* 销售跟进流程
* 研发评审效率

---

## 24. 推荐最小可用业务闭环

第一阶段最小可用闭环建议为：

```text
邮件进入
  ↓
邮件入库
  ↓
人工或 AI 判断是否有效询盘
  ↓
创建询盘台账
  ↓
AI 提取需求参数
  ↓
AI 判断缺失字段
  ↓
AI 生成补充参数邮件草稿
  ↓
人工审核发送
```

第一阶段暂不实现：

* 自动发送
* RAG
* 报价
* 研发评审
* 合同处理
* 复杂 CRM
* 自动客户画像
* 全自动状态流转

第一阶段优先解决的问题：

```text
谁发来的邮件？
是不是有效询盘？
问的是什么产品？
需求参数有哪些？
缺了哪些关键信息？
应该向客户补问什么？
这封邮件是否已经形成询盘记录？
```

---

## 25. 业务边界总结

本系统的核心边界如下：

```text
AI 可以辅助判断，但不能替代业务决策。
AI 可以生成草稿，但不应直接发送高风险邮件。
AI 可以参考资料，但不能替代研发确认。
AI 可以整理报价前信息，但不能自动报价。
AI 可以推进询盘前期沟通，但进入报价阶段后必须转人工。
```

最终职责划分：

| 角色      | 职责                    |
| ------- | --------------------- |
| AI      | 初筛、提取、总结、草拟、提醒风险      |
| 市场/业务人员 | 审核邮件、确认客户意向、发送回复、推进报价 |
| 研发工程师   | 判断技术可行性、提出方案建议        |
| 负责人/管理层 | 判断高风险客户、敏感应用、重要商务节点   |
| 系统      | 记录流程、控制状态、限制越权、保留追溯   |

---

## 26. 后续开发使用说明

开发时应注意：

* 本文件是业务参考，不是当前任务清单。
* 当前开发范围必须以 `docs/06-current-task.md` 为准。
* 不要因为本文档中提到 RAG、报价、研发评审，就一次性实现全部功能。
* 每一阶段应先形成可用闭环，再扩展 AI 能力。
* 优先保证流程清晰和人工可控，再逐步提高自动化程度。

推荐开发顺序：

```text
1. 邮件接收与入库
2. 客户与询盘台账
3. 邮件关联询盘
4. AI 分类与参数提取
5. AI 回复草稿
6. 模板与关键词约束
7. 产品库与 RAG
8. 研发评审
9. 报价前交接
10. 数据复盘
11. 低风险自动回复
```

系统建设原则：

```text
先可控，再智能。
先草稿，再自动。
先流程闭环，再知识增强。
先小范围验证，再逐步开放。
```
