import { randomUUID } from 'node:crypto';

import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { isOwnEmail } from '../../../../common/email/own-email-address.js';

export interface RecoveredEmail {
  emailMessage: EmailMessage;
}

const QUOTE_BODY_MIN_CHARS = 10;
const EMAIL_IN_BRACKETS = /<([^>]+)>/;
const CHINESE_DATE = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const CHINESE_TIME = /(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[:：]\s*(\d{2}))?/;
const ENGLISH_DATE = /(\d{1,2}\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4})/i;

/**
 * 从引用文本中尝试恢复一封缺失的邮件。
 *
 * @param quotedHistory        被移除的引用文本
 * @param inReplyTo            父邮件的 Message-ID（来自当前邮件 In-Reply-To 头）
 * @param currentSubject       当前邮件主题（用于推导父邮件主题）
 * @param currentFromEmail     当前邮件发件人（用于推导父邮件的收件人）
 * @returns 恢复的邮件数据，若无法解析则返回 undefined
 *
 * 注意：不设置 threadId，让 PrismaEmailMessageRepository.resolveEmailThreadId
 * 通过 externalMessageId (=inReplyTo) 自动匹配到已存在的线程。
 */
export function recoverParentEmailFromQuote(
  quotedHistory: string,
  inReplyTo: string,
  currentSubject: string,
  currentFromEmail: string,
): RecoveredEmail | undefined {
  const lines = quotedHistory.split('\n').map((line) => line.trimEnd());
  if (lines.length === 0) return undefined;

  const attribution = parseAttribution(lines[0]);
  if (!attribution) return undefined;

  const bodyText = extractQuoteBody(lines.slice(1));
  if (!bodyText || bodyText.length < QUOTE_BODY_MIN_CHARS) return undefined;

  const direction = isOwnEmail(attribution.email)
    ? EmailDirection.OUTBOUND
    : EmailDirection.INBOUND;

  return {
    emailMessage: {
      id: `email_${randomUUID()}`,
      externalMessageId: inReplyTo,
      direction,
      source: EmailSource.SYSTEM_DETECTED,
      fromEmail: attribution.email,
      fromName: attribution.name,
      toEmails: direction === EmailDirection.OUTBOUND
        ? [currentFromEmail]
        : [],
      ccEmails: [],
      subject: stripReplyPrefix(currentSubject),
      bodyText,
      receivedAt: attribution.receivedAt,
      createdAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

interface Attribution {
  email: string;
  name?: string;
  receivedAt: Date;
}

/**
 * 解析引用文本的首行（归属行），提取发件人邮箱、姓名和时间。
 *
 * 支持的格式：
 *   Name <email> 于 YYYY年M月D日 ... HH:MM 写道：
 *   Name<email> 在 YYYY年M月D日 ... HH:MM 写道：
 *   Name <email> 于 YYYY年M月D日... HH:MM写道：
 *   On ... wrote:  (英文格式，暂不解析精确时间)
 */
function parseAttribution(line: string): Attribution | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  // 尝试中文格式：Name <email> 于/在 YYYY年M月D日
  const emailMatch = trimmed.match(EMAIL_IN_BRACKETS);
  if (!emailMatch) return undefined;

  const email = emailMatch[1].trim().toLowerCase();
  const name = trimmed.slice(0, trimmed.indexOf('<')).trim() || undefined;

  // 尝试解析日期
  const dateMatch = trimmed.match(CHINESE_DATE);
  if (dateMatch) {
    const year = Number.parseInt(dateMatch[1], 10);
    const month = Number.parseInt(dateMatch[2], 10) - 1; // JS month is 0-based
    const day = Number.parseInt(dateMatch[3], 10);
    const timeMatch = trimmed.match(CHINESE_TIME);
    const hour = timeMatch ? Number.parseInt(timeMatch[1], 10) : 0;
    const minute = timeMatch ? Number.parseInt(timeMatch[2], 10) : 0;
    const second = timeMatch && timeMatch[3] ? Number.parseInt(timeMatch[3], 10) : 0;
    const receivedAt = new Date(year, month, day, hour, minute, second);

    if (!Number.isNaN(receivedAt.getTime())) {
      return { email, name, receivedAt };
    }
  }

  // 尝试英文格式 On ... wrote:
  const englishDateMatch = trimmed.match(ENGLISH_DATE);
  if (englishDateMatch) {
    const receivedAt = new Date(englishDateMatch[1]);
    if (!Number.isNaN(receivedAt.getTime())) {
      return { email, name, receivedAt };
    }
  }

  return { email, name, receivedAt: new Date() };
}

/**
 * 提取引用块中归属行之后的正文内容。
 * 遇到下一个归属行（新的嵌套引用）时停止。
 * 自动移除 > 前缀和 HTML 实体。
 */
function extractQuoteBody(lines: string[]): string | undefined {
  const bodyLines: string[] = [];
  let inBody = false;

  for (const raw of lines) {
    // 跳过首行后的空行
    if (!inBody && raw.trim() === '') continue;

    // 一旦遇到非空行，进入正文区域
    if (!inBody && raw.trim() !== '') {
      inBody = true;
    }

    // 检测下一个归属行（嵌套引用）→ 停止
    if (inBody && isAttributionLine(raw)) break;

    if (inBody) {
      const cleaned = raw
        .replace(/^[>\s]+/, '')         // 移除 > 前缀
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trimEnd();
      if (cleaned) bodyLines.push(cleaned);
    }
  }

  const result = bodyLines.join('\n').trim();
  return result || undefined;
}

/**
 * 粗略判断一行是否是邮件归属行。
 * 匹配中文 "于/在 ... 写道" 或英文 "wrote:"。
 */
function isAttributionLine(line: string): boolean {
  return (
    /[于在]\s*\d{4}\s*年/.test(line) ||
    /写道/.test(line) ||
    /\bwrote\s*:?\s*$/i.test(line)
  );
}

/**
 * 去掉主题的回复前缀（Re: / 回复：/ 回复: 等）以推导父邮件主题。
 */
function stripReplyPrefix(subject: string): string {
  return subject
    .replace(/^(?:Re|回复|回复|AW|WG|RIF|FW|转发)\s*[:：\s]+/i, '')
    .trim();
}
