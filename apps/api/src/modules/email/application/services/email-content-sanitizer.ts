import { load } from 'cheerio';
import { convert } from 'html-to-text';

const QUOTE_SCORE_THRESHOLD = 70;
const HEADER_LOOKAHEAD_LINES = 10;

interface QuoteCandidate {
  index: number;
  score: number;
}

export class EmailContentSanitizer {
  sanitize(bodyText?: string, bodyHtml?: string): string | undefined {
    const source = selectBodySource(bodyText, bodyHtml);
    if (!source) {
      return undefined;
    }

    const normalized = normalizeWhitespace(source);
    const withoutQuotedHistory = stripQuotedHistory(normalized);
    const withoutSignature = stripSignatureAndDisclaimer(withoutQuotedHistory);
    const cleaned = normalizeWhitespace(withoutSignature);

    return cleaned || undefined;
  }
}

function selectBodySource(bodyText?: string, bodyHtml?: string): string | undefined {
  const hasText = Boolean(bodyText?.trim());
  const hasHtml = Boolean(bodyHtml?.trim());

  if (hasHtml && (!hasText || containsTable(bodyHtml as string))) {
    return convertHtmlToText(stripHtmlQuotedHistory(bodyHtml as string));
  }

  return hasText ? bodyText : undefined;
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

function stripQuotedHistory(value: string): string {
  const lines = value.split('\n');
  const boundary = findQuotedHistoryBoundary(lines);

  return boundary === undefined ? value : lines.slice(0, boundary).join('\n');
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

  if (/^On .+ wrote:$/i.test(trimmed) || /^在 .+ 写道：$/.test(trimmed)) {
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
