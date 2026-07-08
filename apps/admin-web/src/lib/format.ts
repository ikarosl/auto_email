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
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
