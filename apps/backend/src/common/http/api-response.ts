export interface ApiPageResult<T> {
  success: true;
  data: T;
  total: number;
  page: number;
  limit: number;
}

export function parsePage(value: unknown): number {
  return parsePositiveInteger(value, 1);
}

export function parseLimit(value: unknown): number {
  const limit = parsePositiveInteger(value, 20);
  return Math.min(limit, 100);
}

export function pageResponse<T>(input: {
  data: T;
  total: number;
  page: number;
  limit: number;
}): ApiPageResult<T> {
  return {
    success: true,
    data: input.data,
    total: input.total,
    page: input.page,
    limit: input.limit,
  };
}

export function itemResponse<T>(data: T): ApiPageResult<T> {
  return pageResponse({
    data,
    total: data === undefined || data === null ? 0 : 1,
    page: 1,
    limit: 1,
  });
}

export function toDateIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toStringOrNull(value: bigint | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (Array.isArray(value)) return parsePositiveInteger(value[0], fallback);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
