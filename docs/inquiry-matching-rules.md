# 邮件归并与询盘匹配规则

## 1. 目标

新邮件进入系统时，系统需要判断：

```text
这封邮件应该关联到已有 InquiryCase？
还是应该创建新的 InquiryCase？
```

邮件归并的目标是：

```text
同一个询盘线程的补充邮件、回复邮件、参数补充邮件，应关联到同一个 InquiryCase。
不同产品、不同需求或不确定邮件，不应被强行合并。
```

---

## 2. 当前阶段范围

第一版只实现确定性规则：

```text
1. threadId 匹配。
2. 同一发件人邮箱下，只有一个近期未关闭询盘时匹配。
3. 无匹配则创建新询盘。
```

第一版暂不实现：

```text
AI 语义归并
复杂 subject 相似度
跨客户归并
人工拆分/合并界面
数据库持久化
```

---

## 3. 匹配优先级

### 3.1 规则一：threadId 匹配

如果新邮件的 `threadId` 与历史邮件一致，并且历史邮件已通过 `InquiryMessage` 关联到某个询盘，则归并到该询盘。

```text
命中原因：thread_id_match
可信度：高
动作：自动归并
```

### 3.2 规则二：同客户近期未关闭询盘匹配

如果同一 `fromEmail` 下只有一个未关闭询盘，并且该询盘的 `updatedAt` 在策略窗口内，则归并到该询盘。

默认窗口：

```text
14 天
```

```text
命中原因：same_customer_recent_open_inquiry
可信度：中
动作：自动归并
```

### 3.3 规则三：多个未关闭询盘

如果同一 `fromEmail` 下存在多个未关闭询盘，第一版不自动归并。

```text
命中原因：multiple_open_inquiries
可信度：低
动作：创建新询盘，后续人工处理
```

### 3.4 规则四：无匹配

如果没有任何规则命中，则创建新询盘。

```text
命中原因：no_match
动作：创建新 InquiryCase
```

---

## 4. 不自动归并的情况

第一版遇到以下情况，不应自动归并：

```text
同一客户有多个未关闭 inquiry
邮件时间间隔超过策略窗口
threadId 为空且无法判断
邮件明显是新产品或新需求
报价、合同、付款、PI 类邮件但找不到明确线程
```

后续可以加入人工确认队列。

---

## 5. 数据结构要求

需要新增：

```text
InquiryMessage
```

字段：

```text
id
inquiryCaseId
emailMessageId
direction
relationType
createdAt
```

`relationType` 第一版支持：

```text
original
reply
forward
manual_link
```

---

## 6. 业务链路

改造前：

```text
收到邮件
  ↓
保存 EmailMessage
  ↓
创建新 InquiryCase
```

改造后：

```text
收到邮件
  ↓
保存 EmailMessage
  ↓
FindInquiryForInboundEmailUseCase
  ↓
匹配到已有 InquiryCase
    ↓
    创建 InquiryMessage 关联
    更新 InquiryCase.latestMessageAt / updatedAt
  ↓
未匹配
    ↓
    创建新 InquiryCase
    创建 InquiryMessage relationType=original
```

---

## 7. 后续数据库查询方向

后续持久化后，匹配会查询：

```text
email_messages
inquiry_messages
inquiry_cases
```

典型查询：

```sql
SELECT *
FROM email_messages
WHERE thread_id = ?
```

```sql
SELECT *
FROM inquiry_messages
WHERE email_message_id IN (...)
```

```sql
SELECT *
FROM inquiry_cases
WHERE customer_email = ?
  AND status != 'closed'
ORDER BY updated_at DESC
```

如果后续引入 customers 表，应优先使用 `customer_id` 匹配。

---

## 8. 安全边界

邮件归并只决定邮件和询盘的关联关系。

它不应：

```text
自动修改询盘状态
自动回复邮件
自动进入 ready_for_quote
自动关闭询盘
```

状态仍由状态机和人工确认控制。
