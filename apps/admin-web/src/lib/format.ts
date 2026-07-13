export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function truncate(value?: string | null, length = 96): string {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export function asCount(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export function jsonPreview(value: unknown): string {
  if (value === undefined || value === null) return '-';
  try {
    const decoded = deepParseStringifiedJson(value);
    const formatted = JSON.stringify(decoded, null, 2);
    return wrapLongLines(formatted, 200);
  } catch {
    return String(value);
  }
}

/**
 * 递归尝试将 JSON 字符串字段二次解析为对象。
 * 处理 messages 中 content 字段是 stringified JSON 的场景。
 */
function deepParseStringifiedJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return deepParseStringifiedJson(parsed);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepParseStringifiedJson);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = deepParseStringifiedJson(val);
    }
    return result;
  }
  return value;
}

/**
 * 将超过 maxLen 的每行文本折叠成多行。
 */
function wrapLongLines(text: string, maxLen: number): string {
  const lines = text.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    if (line.length <= maxLen) {
      result.push(line);
    } else {
      let remaining = line;
      while (remaining.length > 0) {
        result.push(remaining.slice(0, maxLen));
        remaining = remaining.slice(maxLen);
      }
    }
  }
  return result.join('\n');
}
