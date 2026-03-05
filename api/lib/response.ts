/**
 * Standardized API response helpers.
 */

import type { Context } from 'hono';

type ApiResponse<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

type ApiErrorResponse = {
  error: string;
  details?: unknown;
};

type PaginatedMeta = {
  total: number;
  limit: number;
};

export const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) =>
  c.json({ data } satisfies ApiResponse<T>, status);

export const created = <T>(c: Context, data: T) =>
  ok(c, data, 201);

export const paginated = <T>(c: Context, data: T[], meta: PaginatedMeta) =>
  c.json({ data, meta } satisfies ApiResponse<T[]>);

export const notFound = (c: Context, message = 'Not found') =>
  c.json({ error: message } satisfies ApiErrorResponse, 404);

export const badRequest = (c: Context, details: unknown) =>
  c.json({ error: 'Validation failed', details } satisfies ApiErrorResponse, 400);
