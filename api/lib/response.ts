/**
 * Standardized API response helpers.
 */

import type { Context } from 'hono';
import type { TypedResponse } from 'hono/types';

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

export const ok = (c: Context, data: unknown, status: 200 | 201 = 200): TypedResponse => {
  return c.json({ data } satisfies ApiResponse<unknown>, status);
};

export const created = (c: Context, data: unknown): TypedResponse => {
  return ok(c, data, 201);
};

export const paginated = (c: Context, data: unknown[], meta: PaginatedMeta): TypedResponse => {
  return c.json({ data, meta } satisfies ApiResponse<unknown[]>);
};

export const notFound = (c: Context, message = 'Not found'): TypedResponse => {
  return c.json({ error: message } satisfies ApiErrorResponse, 404);
};

export const badRequest = (c: Context, details: unknown): TypedResponse => {
  return c.json({ error: 'Validation failed', details } satisfies ApiErrorResponse, 400);
};
