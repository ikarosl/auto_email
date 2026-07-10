import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { load } from 'cheerio';
import { convert } from 'html-to-text';

const QUOTE_SCORE_THRESHOLD = 70;
const HEADER_LOOKAHEAD_LINES = 10;

interface QuoteCandidate {
  index: number;
  score: number;
}

export interface SanitizeResult {
  /** 清洗后的正文（移除了引用历史、签名、免责声明） */
  cleaned: string | undefined;
  /** 被移除的引用历史文本（引用的旧邮件内容），无引用时 undefined */
  quotedHistory: string | undefined;
}

export interface EmailContentSanitizerMetadata {
  emailMessageId?: string;
  externalMessageId?: string;
  fromEmail?: string;
  subject?: string;
  sourceKind?: string;
}

export class EmailContentSanitizer {
  sanitize(
    bodyText?: string,
    bodyHtml?: string,
    metadata?: EmailContentSanitizerMetadata,
  ): SanitizeResult {
    const selected = selectBodySource(bodyText, bodyHtml);
    if (!selected.text) {
      return { cleaned: undefined, quotedHistory: undefined };
    }

    logSanitizerInput({
      metadata,
      bodyText,
      bodyHtml,
      selectedTextOriginal: selected.text,
      sourceKind: selected.sourceKind,
    });

    const normalized = normalizeWhitespace(selected.text);
    const { clean: withoutQuotedHistory, quoted: quotedHistory } = stripQuotedHistory(normalized);
    const withoutSignature = stripSignatureAndDisclaimer(withoutQuotedHistory);
    const cleaned = normalizeWhitespace(withoutSignature);

    return {
      cleaned: cleaned || undefined,
      quotedHistory: quotedHistory || undefined,
    };
  }
}

interface SelectedBodySource {
  text?: string;
  sourceKind: 'plain_text' | 'html_converted' | 'none';
}

function selectBodySource(bodyText?: string, bodyHtml?: string): SelectedBodySource {
  const hasText = Boolean(bodyText?.trim());
  const hasHtml = Boolean(bodyHtml?.trim());

  if (hasHtml && (!hasText || containsTable(bodyHtml as string))) {
    return {
      text: convertHtmlToText(stripHtmlQuotedHistory(bodyHtml as string)),
      sourceKind: 'html_converted',
    };
  }

  return {
    text: hasText ? bodyText : undefined,
    sourceKind: hasText ? 'plain_text' : 'none',
  };
}

function containsTable(html: string): boolean {
  const $ = load(html);
  return $('table').length > 0;
}

function stripHtmlQuotedHistory(html: string): string {
  const $ = load(html);
  const selectors = [
    { selector: '.gmail_quote', score: 90 },
    { selector: '#divRplyFwdMsg', score: 90 },
    { selector: 'blockquote', score: 80 },
  ];

  for (const signal of selectors) {
    if (signal.score >= QUOTE_SCORE_THRESHOLD) {
      $(signal.selector).remove();
    }
  }

  return $.html();
}

function convertHtmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      {
        selector: 'p',
        options: {
          leadingLineBreaks: 1,
          trailingLineBreaks: 1,
        },
      },
      {
        selector: 'div',
        options: {
          leadingLineBreaks: 1,
          trailingLineBreaks: 1,
        },
      },
      {
        selector: 'table',
        format: 'dataTable',
        options: {
          uppercaseHeaderCells: false,
          maxColumnWidth: 80,
        },
      },
    ],
  });
}

/**
 * 移除引用历史，同时返回被移除的引用文本。
 *
 * @returns clean - 引用历史前的正文；quoted - 被移除的引用文本（无引用时 undefined）
 */
function stripQuotedHistory(value: string): { clean: string; quoted: string | undefined } {
  const lines = value.split('\n');
  const boundary = findQuotedHistoryBoundary(lines);

  if (boundary === undefined) {
    return { clean: value, quoted: undefined };
  }

  return {
    clean: lines.slice(0, boundary).join('\n'),
    quoted: lines.slice(boundary).join('\n'),
  };
}

function findQuotedHistoryBoundary(lines: string[]): number | undefined {
  const candidates: QuoteCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const score = scoreQuoteBoundary(lines, index);
    if (score >= QUOTE_SCORE_THRESHOLD) {
      candidates.push({ index, score });
    }
  }

  return candidates.sort((a, b) => a.index - b.index || b.score - a.score)[0]?.index;
}

function scoreQuoteBoundary(lines: string[], index: number): number {
  const trimmed = lines[index]?.trim() ?? '';

  if (
    /^--- Original Message ---$/i.test(trimmed)
    || /^-----Original Message-----$/i.test(trimmed)
    || /^----- Forwarded Message -----$/i.test(trimmed)
  ) {
    return 100;
  }

  if (
    /^On .+ wrote:$/i.test(trimmed)
    || /^(?:.+\s)?\u5728\s*.+\s*\u5199\u9053[:\uff1a]$/.test(trimmed)
    || isReplyAttributionLine(trimmed)
  ) {
    return 90;
  }

  if (countConsecutiveQuotedLines(lines, index) >= 3) {
    return 70;
  }

  return scoreMailHeaderSignals(lines, index);
}

function countConsecutiveQuotedLines(lines: string[], startIndex: number): number {
  let count = 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index]?.trimStart().startsWith('>')) {
      break;
    }
    count += 1;
  }

  return count;
}

function isReplyAttributionLine(line: string): boolean {
  if (!hasEmailAddress(line)) {
    return false;
  }

  return hasDateOrTimeSignal(line) && hasReplyVerbSignal(line);
}

function hasDateOrTimeSignal(line: string): boolean {
  return (
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(line)
    || /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(line)
    || /\b\d{4}\s*\u5e74\s*\d{1,2}\s*\u6708\s*\d{1,2}\s*\u65e5/.test(line)
    || /\b\d{1,2}\s*\u6708\s*\d{1,2}\s*\u65e5/.test(line)
    || /\b\d{1,2}\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}\b/i.test(line)
    || /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2},?\s+\d{4}\b/i.test(line)
    || /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|cest|cet|gmt|utc|est|edt|pst|pdt|cst|cdt)?\b/i.test(line)
  );
}

function hasReplyVerbSignal(line: string): boolean {
  return (
    /\bwrote\s*:?\s*$/i.test(line)
    || /\bha\s+scritto\s*:?\s*$/i.test(line)
    || /\ba\s+\u00e9crit\s*:?\s*$/i.test(line)
    || /\bescribi\u00f3\s*:?\s*$/i.test(line)
    || /\bescreveu\s*:?\s*$/i.test(line)
    || /\bschrieb\s*:?\s*$/i.test(line)
    || /\bnapisa\u0142(?:a)?\s*:?\s*$/i.test(line)
    || /\bschreef\s*:?\s*$/i.test(line)
    || /\u5199\u9053\s*[:\uff1a]?\s*$/.test(line)
    || /\u66f8\u304d\u307e\u3057\u305f\s*[:\uff1a]?\s*$/.test(line)
    || /\uc791\uc131\s*[:\uff1a]?\s*$/.test(line)
  );
}

function scoreMailHeaderSignals(lines: string[], startIndex: number): number {
  const firstLine = lines[startIndex]?.trim() ?? '';
  if (!isHeader(firstLine, 'from') || !hasSufficientBodyBeforeHeader(lines, startIndex)) {
    return 0;
  }

  const window = lines
    .slice(startIndex, startIndex + HEADER_LOOKAHEAD_LINES)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasFrom = window.some((line) => isHeader(line, 'from'));
  const hasSent = window.some((line) => isHeader(line, 'sent') || isHeader(line, 'date'));
  const hasTo = window.some((line) => isHeader(line, 'to'));
  const hasSubject = window.some((line) => isHeader(line, 'subject'));

  let score = 0;

  if (hasFrom && hasSent && hasTo && hasSubject) {
    score += 90;
  } else if (hasFrom && hasSent && hasSubject) {
    score += 80;
  } else if (hasFrom && hasTo && hasSubject) {
    score += 75;
  }

  if (hasFrom && hasEmailAddress(firstLine)) {
    score += 25;
  }
  if (hasSent) {
    score += 25;
  }
  if (hasTo) {
    score += 20;
  }
  if (hasSubject) {
    score += 25;
  }

  return score;
}

function hasSufficientBodyBeforeHeader(lines: string[], startIndex: number): boolean {
  const precedingBodyLines = lines
    .slice(0, startIndex)
    .map((line) => line.trim())
    .filter(Boolean);

  if (precedingBodyLines.length < 3) {
    return false;
  }

  return precedingBodyLines.join(' ').length >= 20;
}

function isHeader(line: string, type: 'from' | 'sent' | 'date' | 'to' | 'subject'): boolean {
  const labels: Record<typeof type, readonly string[]> = {
    from: ['from', '发件人'],
    sent: ['sent', '发送时间'],
    date: ['date', '日期'],
    to: ['to', '收件人'],
    subject: ['subject', '主题'],
  };

  return labels[type].some((label) => new RegExp(`^${label}\\s*[:：]`, 'i').test(line));
}

function hasEmailAddress(value: string): boolean {
  return /[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[a-z]{2,}/i.test(value);
}

function stripSignatureAndDisclaimer(value: string): string {
  const lines = value.split('\n');
  const searchStart = Math.max(0, lines.length - 15);
  const signatureBoundary = lines.findIndex((line, index) => {
    if (index < searchStart) {
      return false;
    }

    const trimmed = line.trim();
    return (
      /^--\s*$/.test(trimmed)
      || /^(best regards|kind regards|regards|sincerely|thanks|thank you)[,!]?$/i.test(trimmed)
      || /^(此邮件及其附件|本邮件及其附件|confidentiality notice|this e-?mail.*confidential)/i.test(trimmed)
    );
  });

  return signatureBoundary >= 0 ? lines.slice(0, signatureBoundary).join('\n') : value;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v\u00a0]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function logSanitizerInput(input: {
  metadata?: EmailContentSanitizerMetadata;
  bodyText?: string;
  bodyHtml?: string;
  selectedTextOriginal: string;
  sourceKind: 'plain_text' | 'html_converted' | 'none';
}): void {
  if (!isSanitizerDebugLogEnabled()) {
    return;
  }

  const logPath = resolve(
    process.cwd(),
    process.env.EMAIL_SANITIZER_DEBUG_LOG_PATH || 'logs/email-sanitizer-debug.jsonl',
  );
  const linesOriginal = input.selectedTextOriginal.split(/\r\n|\r|\n/);
  const payload = {
    occurredAt: new Date().toISOString(),
    emailMessageId: input.metadata?.emailMessageId,
    externalMessageId: input.metadata?.externalMessageId,
    fromEmail: input.metadata?.fromEmail,
    subject: input.metadata?.subject,
    sourceKind: input.metadata?.sourceKind ?? input.sourceKind,
    selectedBodySourceKind: input.sourceKind,
    bodyTextOriginal: input.bodyText,
    bodyHtmlExists: Boolean(input.bodyHtml?.trim()),
    selectedTextOriginal: input.selectedTextOriginal,
    selectedTextOriginalUtf8Base64: Buffer.from(input.selectedTextOriginal, 'utf8').toString('base64'),
    linesOriginal: linesOriginal.map((line, index) => ({
      index,
      text: line,
      utf8Base64: Buffer.from(line, 'utf8').toString('base64'),
      codePoints: Array.from(line).map((character) =>
        `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
      ),
    })),
  };

  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // Debug logging must never block email ingestion.
  }
}

function isSanitizerDebugLogEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.EMAIL_SANITIZER_DEBUG_LOG_ENABLED ?? '').toLowerCase(),
  );
}
