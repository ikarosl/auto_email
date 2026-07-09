# 附件数据整改方案

本文档用于规划邮件附件读取、存储、解析和注入 AI 上下文的改造。当前阶段重点处理 PDF 附件，因为真实询盘中规格书、图纸说明、采购合同、参数表大多以 PDF 形式发送。

## 1. 背景

当前邮件处理链路主要读取邮件正文：

```text
IMAP 拉取邮件
  -> mailparser 解析正文
  -> 保存 email_messages
  -> 匹配 inquiry_case
  -> BuildAiContextUseCase 生成上下文
  -> AI 分析邮件正文
```

问题是：

```text
1. parsed.attachments 还没有进入领域对象。
2. 数据库缺少 email_attachments 表。
3. email_messages 缺少 has_attachments 等快速判断字段。
4. PDF 附件中的规格参数无法进入 AI 上下文。
5. AI 判断可能漏掉附件里的关键技术信息，例如频段、功率、尺寸、连接器、交期、付款条款。
```

因此需要增加“附件中转程序”：把二进制附件保存下来，并将可解析附件转成可读文本，供上下文管理模块引用。

## 2. 设计目标

```text
原始附件必须可追溯。
解析文本必须可重复查看。
解析失败不能阻断邮件入库。
AI 上下文只使用经过大小限制和清洗后的附件文本。
附件信息必须能和 email_message、inquiry_case、context_snapshot 关联。
```

不在本阶段做：

```text
1. OCR 图片识别。
2. CAD/复杂图纸解析。
3. 附件病毒扫描。
4. 线上对象存储。
5. AI 自动确认附件里的报价或合同条款。
```

## 3. 总体链路

```text
IMAP 拉取邮件
  -> mailparser simpleParser
  -> parsed.text / parsed.html / parsed.attachments
  -> 保存 email_messages
  -> 保存附件二进制到本地 storage
  -> 写入 email_attachments 元数据
  -> 对 PDF 等附件做文本解析
  -> 更新 email_attachments.parse_status / parsed_text
  -> 邮件匹配 inquiry_case
  -> BuildAiContextUseCase 读取附件解析结果
  -> contextPayload.currentEmail.attachments
  -> contextPayload.recentThreadMessages[].attachments
  -> AI 分析
```

## 4. 文件存储策略

第一阶段采用本地文件存储：

```text
storage/
  attachments/
    {emailMessageId}/
      {attachmentId}_{safeFileName}
```

示例：

```text
storage/attachments/email_001/attachment_001_product-spec.pdf
```

规则：

```text
1. 数据库保存 storage_path。
2. 文件名必须做 safe filename 处理，禁止使用原始路径。
3. 真实原始文件名保存在 original_file_name。
4. logs、storage 不提交 Git。
5. 后续如迁移到 OSS/S3，只需替换 storage adapter，数据库保留 storage_provider 和 storage_path。
常用的 Node.js 存储服务库包括：`aws-sdk`（支持 S3）、`ali-oss`（支持 OSS）、`minio`（兼容 S3）、`@aws-sdk/client-s3`（官方新 SDK），以及支持多云存储的抽象库如 `cloud-storage`、`multer-s3`、`multer-oss` 等。
```

`.gitignore` 应包含：

```text
storage/
```

## 5. 数据库整改

### 5.1 email_messages 增加附件摘要字段

`email_messages` 增加：

| 字段 | 类型 | 说明 |
|---|---|---|
| `has_attachments` | boolean | 是否有附件，默认 false |
| `attachment_count` | integer | 附件数量，默认 0 |

用途：

```text
1. 邮件列表可快速显示附件标记。
2. BuildAiContextUseCase 可快速判断是否需要查询附件表。
3. 线程页面可以避免每封邮件都额外 count。
```

### 5.2 新增 email_attachments 表

```sql
CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY DEFAULT ('attachment_' || gen_random_uuid()::TEXT),
  email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  inquiry_case_id TEXT REFERENCES inquiry_cases(id) ON DELETE SET NULL,

  original_file_name TEXT,
  safe_file_name TEXT NOT NULL,
  content_id TEXT,
  content_disposition TEXT,
  mime_type TEXT NOT NULL,
  file_extension TEXT,
  file_size BIGINT NOT NULL,
  content_hash TEXT,

  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT,

  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_strategy TEXT,
  parsed_text TEXT,
  parsed_text_preview TEXT,
  parsed_text_length INTEGER NOT NULL DEFAULT 0,
  parse_error_code TEXT,
  parse_error_message TEXT,
  parsed_at TIMESTAMPTZ,

  is_inline BOOLEAN NOT NULL DEFAULT FALSE,
  is_context_candidate BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_attachments_email_idx
  ON email_attachments(email_message_id);

CREATE INDEX IF NOT EXISTS email_attachments_inquiry_idx
  ON email_attachments(inquiry_case_id);

CREATE INDEX IF NOT EXISTS email_attachments_parse_status_idx
  ON email_attachments(parse_status);

CREATE INDEX IF NOT EXISTS email_attachments_content_hash_idx
  ON email_attachments(content_hash);
```

### 5.3 字段说明

| 字段 | 说明 |
|---|---|
| `email_message_id` | 附件所属邮件 |
| `inquiry_case_id` | 附件所属询盘，邮件匹配询盘后补充 |
| `original_file_name` | 邮件里的原始文件名 |
| `safe_file_name` | 系统生成的安全文件名 |
| `content_id` | MIME Content-ID，用于识别内嵌图片 |
| `content_disposition` | attachment / inline |
| `mime_type` | MIME 类型 |
| `file_extension` | 文件扩展名 |
| `file_size` | 字节数 |
| `content_hash` | 文件 hash，用于去重和调试 |
| `storage_provider` | local / s3 / oss 等 |
| `storage_path` | 文件保存位置 |
| `parse_status` | pending / parsed / skipped / failed |
| `parse_strategy` | pdf_text / docx_text / xlsx_table / text_plain 等 |
| `parsed_text` | 附件解析后的全文 |
| `parsed_text_preview` | 前端列表预览 |
| `parsed_text_length` | 解析文本长度 |
| `parse_error_code` | 解析失败原因码 |
| `is_inline` | 是否内嵌资源，例如签名图片 |
| `is_context_candidate` | 是否允许进入 AI 上下文候选 |

### 5.4 Prisma 模型建议

```prisma
model EmailMessage {
  // existing fields
  hasAttachments  Boolean           @default(false) @map("has_attachments")
  attachmentCount Int               @default(0) @map("attachment_count")
  attachments     EmailAttachment[]
}

model EmailAttachment {
  id                 String        @id @default(dbgenerated("'attachment_' || gen_random_uuid()::TEXT"))
  emailMessageId     String        @map("email_message_id")
  inquiryCaseId      String?       @map("inquiry_case_id")
  originalFileName   String?       @map("original_file_name")
  safeFileName       String        @map("safe_file_name")
  contentId          String?       @map("content_id")
  contentDisposition String?       @map("content_disposition")
  mimeType           String        @map("mime_type")
  fileExtension      String?       @map("file_extension")
  fileSize           BigInt        @map("file_size")
  contentHash        String?       @map("content_hash")
  storageProvider    String        @default("local") @map("storage_provider")
  storagePath        String?       @map("storage_path")
  parseStatus        String        @default("pending") @map("parse_status")
  parseStrategy      String?       @map("parse_strategy")
  parsedText         String?       @map("parsed_text")
  parsedTextPreview  String?       @map("parsed_text_preview")
  parsedTextLength   Int           @default(0) @map("parsed_text_length")
  parseErrorCode     String?       @map("parse_error_code")
  parseErrorMessage  String?       @map("parse_error_message")
  parsedAt           DateTime?     @map("parsed_at") @db.Timestamptz(6)
  isInline           Boolean       @default(false) @map("is_inline")
  isContextCandidate Boolean       @default(true) @map("is_context_candidate")
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime      @default(now()) @map("updated_at") @db.Timestamptz(6)
  emailMessage       EmailMessage  @relation(fields: [emailMessageId], references: [id], onDelete: Cascade)
  inquiryCase        InquiryCase?  @relation(fields: [inquiryCaseId], references: [id], onDelete: SetNull)

  @@index([emailMessageId])
  @@index([inquiryCaseId])
  @@index([parseStatus])
  @@index([contentHash])
  @@map("email_attachments")
}
```

## 6. 解析状态与错误码

### 6.1 parse_status

| 状态 | 含义 |
|---|---|
| `pending` | 附件已保存，尚未解析 |
| `parsed` | 已成功解析为文本 |
| `skipped` | 不需要解析，例如内嵌图片、超大文件、不支持类型 |
| `failed` | 尝试解析但失败 |

### 6.2 parse_error_code

| 错误码 | 含义 |
|---|---|
| `file_too_large` | 文件超过大小限制 |
| `unsupported_mime_type` | 不支持的 MIME 类型 |
| `empty_attachment` | 附件内容为空 |
| `encrypted_pdf` | PDF 加密，无法读取 |
| `parse_timeout` | 解析超时 |
| `parse_exception` | 解析库抛出异常 |
| `storage_failed` | 文件保存失败 |

## 7. 格式解析策略

第一阶段优先级：

| 文件类型 | MIME / 扩展名 | 策略 | 是否进入上下文 |
|---|---|---|---|
| PDF | `application/pdf`, `.pdf` | 提取文本 | 是 |
| 纯文本 | `text/plain`, `.txt`, `.csv` | 直接读取文本 | 是 |
| Word | `.docx` | 预留，后续用解析库转文本 | 可后置 |
| Excel | `.xlsx`, `.xls` | 预留，后续转 CSV-like 文本 | 可后置 |
| 图片 | `.png`, `.jpg`, `.jpeg` | 第一阶段跳过 OCR | 否 |
| 压缩包 | `.zip`, `.rar`, `.7z` | 第一阶段跳过 | 否 |

建议依赖分阶段引入：

```text
第一阶段只引入 PDF 文本解析依赖。
第二阶段再引入 docx / xlsx 解析依赖。
不要一次性引入 OCR 或复杂文档解析依赖。
```

但需要为 OCR 预留接入能力：

```text
当前不实现 OCR。
当前不引入 OCR 依赖。
当前不调用大模型做图片识别。
但数据库、解析状态、Parser Adapter 和 AI 上下文结构必须预留 OCR 结果入口。
```

原因：

```text
很多 PDF 可能是扫描件，普通 PDF 文本解析会得到空文本。
很多客户会把参数表、图纸、铭牌、合同截图作为图片或扫描 PDF 发送。
后续预计使用大模型 OCR 或视觉模型把图片内容转为结构化文本。
如果现在完全不预留 OCR 字段，后面会再次改数据库和上下文 schema。
```

### 7.1 OCR 预留策略

OCR 第一阶段只做骨架，不做真实调用。

| 层级 | 当前阶段 | 后续阶段 |
|---|---|---|
| 数据库 | 预留 OCR 字段 | 保存 OCR 文本和结构化结果 |
| Parser Adapter | 预留 `ocr_model` 策略 | 调用大模型 OCR |
| 上下文 | 支持 `ocrText` 字段为空 | 将 OCR 文本注入附件上下文 |
| 前端 | 展示 OCR 状态 | 展示 OCR 结果和错误 |

建议 `email_attachments` 后续可增加或预留以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ocr_status` | text | pending / skipped / parsed / failed |
| `ocr_provider` | text | deepseek / openai / local / other |
| `ocr_text` | text | OCR 得到的可读文本 |
| `ocr_result_json` | jsonb | OCR 返回的结构化结果 |
| `ocr_error_code` | text | OCR 失败原因 |
| `ocr_at` | timestamptz | OCR 执行时间 |

如果不想第一阶段增加所有 OCR 字段，也至少在代码接口中保留：

```ts
interface AttachmentOcrResult {
  status: 'pending' | 'skipped' | 'parsed' | 'failed';
  provider?: string;
  text?: string;
  resultJson?: unknown;
  errorCode?: string;
}
```

并在 parser adapter 中预留：

```ts
interface AttachmentParserResult {
  parseStatus: 'parsed' | 'skipped' | 'failed';
  parseStrategy?: string;
  parsedText?: string;
  parsedTextPreview?: string;
  parseErrorCode?: string;
  ocr?: AttachmentOcrResult;
}
```

### 7.2 OCR 进入上下文的方式

`AiEmailAttachmentContext` 预留 OCR 字段：

```ts
interface AiEmailAttachmentContext {
  fileName: string;
  mimeType: string;
  fileSize: number;
  parseStatus: 'parsed' | 'skipped' | 'failed';
  parsedTextPreview?: string;
  parsedText?: string;
  parseErrorCode?: string;

  ocrStatus?: 'pending' | 'skipped' | 'parsed' | 'failed';
  ocrTextPreview?: string;
  ocrText?: string;
  ocrErrorCode?: string;
}
```

上下文注入规则：

```text
1. 如果 parsedText 有内容，优先使用 parsedText。
2. 如果 PDF 解析为空且 ocrStatus=parsed，则使用 ocrText。
3. 如果 OCR 未执行或失败，需要告诉 AI “附件存在但 OCR 不可用”。
4. OCR 文本和普通解析文本共享上下文预算，不能无限注入。
5. OCR 原始 JSON 不直接发给 AI，除非后续确认其结构稳定且有业务价值。
```

## 8. 附件进入 AI 上下文的方式

### 8.1 contextPayload 增加 attachments

当前 AI 上下文已经是结构化 JSON：

```ts
interface AiEmailAnalysisContextPayload {
  inquiryState: {};
  recentThreadMessages: [];
  ragReferences: [];
  currentEmail: {};
  outputInstruction: {};
}
```

建议扩展邮件上下文对象：

```ts
interface AiEmailAttachmentContext {
  fileName: string;
  mimeType: string;
  fileSize: number;
  parseStatus: 'parsed' | 'skipped' | 'failed';
  parsedTextPreview?: string;
  parsedText?: string;
  parseErrorCode?: string;
}

interface AiEmailThreadMessageContext {
  direction: 'inbound' | 'outbound' | 'internal';
  from: string;
  to?: string;
  subject?: string;
  receivedAt: string;
  cleanBody: string;
  attachments?: AiEmailAttachmentContext[];
}

interface AiEmailCurrentMessageContext {
  direction: 'inbound' | 'outbound' | 'internal';
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  cleanBody: string;
  attachments?: AiEmailAttachmentContext[];
}
```

### 8.2 上下文注入规则

```text
1. currentEmail 的附件优先级最高。
2. recentThreadMessages 中的历史附件只放摘要或 preview。
3. parsed_text 超过限制时只截取前 N 字符，并在字段中标记 truncated。
4. failed/skipped 附件也要告诉 AI “存在附件但未解析”，避免 AI 误以为没有附件。
5. 内嵌签名图片不进入上下文。
```

建议预算：

| 区域 | 附件文本预算 |
|---|---|
| 当前邮件附件 | 3000-5000 tokens |
| 历史邮件附件 | 每封只保留 preview，总计 1000 tokens |
| 单个附件最大文本 | 第一阶段 8000 字符 |

### 8.3 sourceReferences 增加附件来源

`AiContextSnapshot.sourceReferences` 增加：

```ts
{
  sourceType: 'attachment',
  sourceId: 'attachment_001',
  emailMessageId: 'email_001',
  label: 'product-spec.pdf'
}
```

这样可以追踪：

```text
AI 是否看到了附件。
AI 看的是哪个附件。
AI 是否因为附件解析失败导致误判。
```

## 9. 领域与模块划分

建议不要把附件解析直接塞进 IMAP service。IMAP service 只负责把 mailparser 的附件传出来，附件保存和解析由应用层/基础设施端口处理。

```text
apps/backend/src/modules/email/
  domain/
    value-objects/
      email-attachment-input.vo.ts
    entities/
      email-attachment.entity.ts

  application/
    ports/
      email-attachment.repository.ts
      attachment-storage.adapter.ts
      attachment-parser.adapter.ts
    use-cases/
      save-email-attachments.use-case.ts

  infrastructure/
    adapters/
      local-attachment-storage.adapter.ts
      pdf-attachment-parser.adapter.ts
    repositories/
      prisma-email-attachment.repository.ts
      in-memory-email-attachment.repository.ts
```

### 9.1 端口职责

| 端口 | 职责 |
|---|---|
| `EmailAttachmentRepository` | 保存和查询附件元数据、解析文本 |
| `AttachmentStorageAdapter` | 保存二进制文件，返回 storagePath |
| `AttachmentParserAdapter` | 根据 MIME 类型解析文本 |

### 9.2 Use Case 职责

`SaveEmailAttachmentsUseCase`：

```text
输入 emailMessageId、inquiryCaseId、parsed attachments。
过滤内嵌图片和空附件。
保存原始文件。
写入 email_attachments。
调用 parser 尝试解析。
更新 parse_status 和 parsed_text。
更新 email_messages.has_attachments / attachment_count。
```

## 10. 入库顺序

推荐顺序：

```text
1. mailparser 解析邮件。
2. 保存 email_messages，先得到 emailMessageId。
3. 保存附件文件和 email_attachments。
4. 匹配或创建 inquiry_case。
5. 如果 inquiryCaseId 在第 4 步才确定，则回填 email_attachments.inquiry_case_id。
6. 构建 AI 上下文时读取附件解析结果。
7. 保存 AiContextSnapshot，sourceReferences 包含 attachment。
```

注意：

```text
附件解析失败不应回滚 email_messages。
附件保存失败应记录失败附件元数据，邮件仍然入库。
```

## 11. 前端展示影响

### 11.1 邮件线程页面

邮件时间线每封邮件增加附件区域：

```text
附件:
  [PDF] product-spec.pdf  parsed  184 KB  [查看文本] [下载原文件]
  [IMG] logo.png          skipped inline image
```

### 11.2 上下文快照页面

展示：

```text
currentEmail.attachments
recentThreadMessages[].attachments
sourceReferences 中的 attachment
```

### 11.3 邮件详情页面

展示三层：

```text
1. 附件元数据
2. 解析文本
3. 解析错误或跳过原因
```

## 12. 安全与限制

第一阶段建议配置：

```text
ATTACHMENT_STORAGE_DIR=storage/attachments
ATTACHMENT_MAX_FILE_SIZE_MB=20
ATTACHMENT_PARSE_TIMEOUT_MS=15000
ATTACHMENT_CONTEXT_MAX_CHARS=8000
```

安全规则：

```text
1. 文件名必须清洗。
2. storagePath 不能由用户输入拼接。
3. 不执行附件内任何脚本。
4. 不解压压缩包。
5. 不解析超大文件。
6. 不把原始二进制写入数据库。
7. 附件文本进入 AI 前要做长度裁剪。
```

## 13. 实施清单

### 阶段一：数据库与类型

```text
1. 修改 Prisma schema。
2. 修改 001_initial_persistence.sql 和 docs/initial-empty-postgres-schema.sql。
3. 增加 email_attachments 表。
4. email_messages 增加 has_attachments / attachment_count。
5. 新增领域类型 EmailAttachment / EmailAttachmentInput。
6. 新增 AI 上下文附件类型 AiEmailAttachmentContext。
```

### 阶段二：附件保存

```text
1. IMAP 拉取时读取 parsed.attachments。
2. ReceiveInboundEmailUseCase 接收 attachments。
3. LocalAttachmentStorageAdapter 保存文件。
4. PrismaEmailAttachmentRepository 写入元数据。
5. 更新 email_messages 附件计数字段。
```

### 阶段三：PDF 文本解析

```text
1. 增加 PDF parser adapter。
2. PDF 解析成功写 parsed_text。
3. PDF 解析失败写 parse_error_code。
4. 超大文件和不支持类型标记 skipped。
5. 增加单元测试覆盖 parsed / failed / skipped。
```

### 阶段四：上下文注入

```text
1. BuildAiContextUseCase 查询当前邮件附件。
2. currentEmail.attachments 注入解析文本。
3. 历史邮件附件只注入 preview。
4. sourceReferences 增加 attachment 来源。
5. AiContextSnapshot 保存附件上下文。
```

### 阶段五：前端展示

```text
1. 邮件线程展示附件列表。
2. 邮件详情展示解析文本。
3. 上下文快照展示附件来源。
4. 解析失败时给出明确状态。
```

## 14. 验收场景

### 14.1 客户发送带 PDF 规格书的首次询盘

```text
邮件正文: Please see attached datasheet.
附件: datasheet.pdf
```

预期：

```text
email_messages.has_attachments = true
email_messages.attachment_count = 1
email_attachments.parse_status = parsed
email_attachments.parsed_text 包含 PDF 文本
AI 上下文 currentEmail.attachments 包含 parsedText
AI 能从附件中提取 frequency / power / connector 等参数
```

### 14.2 PDF 加密或无法解析

预期：

```text
email_attachments.parse_status = failed
parse_error_code = encrypted_pdf 或 parse_exception
AI 上下文显示存在附件但解析失败
AI 不应编造附件内容
```

### 14.3 内嵌签名图片

预期：

```text
email_attachments 可记录，也可直接跳过保存。
如果保存，则 is_inline = true, is_context_candidate = false。
不进入 AI 上下文。
```

### 14.4 客户后续回复引用历史附件

预期：

```text
历史附件不会重复解析。
recentThreadMessages 只携带附件 preview。
currentEmail 附件优先展示完整解析文本。
```

## 15. 与当前任务顺序的关系

附件读取应在路由整改前完成，原因是：

```text
1. 邮件线程接口需要返回附件列表。
2. 邮件详情接口需要返回附件解析状态。
3. 上下文快照接口需要展示附件是否进入 AI。
4. 数据库结构会影响后续前后端 DTO。
```

推荐下一步：

```text
先完成附件数据库字段和领域类型。
再完成 IMAP 附件保存。
最后把 PDF 解析文本接入 BuildAiContextUseCase。
```

## 16. 当前实现状态

已落地：

```text
1. email_messages.has_attachments / attachment_count。
2. email_attachments 表与 Prisma EmailAttachment model。
3. IMAP mailparser 附件读取，附件二进制进入 InboundEmail。
4. 本地附件存储 LocalAttachmentStorageAdapter。
5. PDF / text 基础解析 BasicAttachmentParserAdapter。
6. OpenAI PDF Reader Adapter 预接入：
   - ATTACHMENT_AI_READER_ENABLED=true
   - ATTACHMENT_AI_READER_PROVIDER=openai
   - ATTACHMENT_AI_READER_MODEL=gpt-4o
7. PDF 本地解析为空或失败时，可启用 AI reader 生成可读文本。
8. BuildAiContextUseCase 已可从 EmailMessage.attachments 注入上下文。
9. email thread messages 接口返回附件元数据和解析状态。
```

仍未落地：

```text
1. Gemini / Claude PDF Reader Adapter。
2. 图片 OCR Adapter。
3. 前端附件查看、下载和解析文本展示。
4. 附件重解析接口。
5. 附件解析任务队列和超时隔离。
```
