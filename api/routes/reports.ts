/**
 * Routes: /reports
 *
 * GET / — list investigation reports, filterable by severity and url
 */

import { Hono } from 'hono';
import { REPORT_SEVERITY, type ReportSeverity } from '@ai-debug/shared';

const VALID_SEVERITIES = new Set<string>(Object.values(REPORT_SEVERITY));

const parseSeverity = (raw: string | undefined): ReportSeverity | undefined =>
  raw !== undefined && VALID_SEVERITIES.has(raw) ? (raw as ReportSeverity) : undefined;

export const reportsRoute = new Hono();

reportsRoute.get('/', async (c) => {
  const { listReports } = await import('@ai-debug/mcp-client/reporter/registry');
  const severity = parseSeverity(c.req.query('severity'));
  const url = c.req.query('url');

  const filters: { severity?: ReportSeverity; url?: string } = {};
  if (severity !== undefined) filters.severity = severity;
  if (url !== undefined) filters.url = url;

  const reports = await listReports(filters);

  return c.json(reports);
});
