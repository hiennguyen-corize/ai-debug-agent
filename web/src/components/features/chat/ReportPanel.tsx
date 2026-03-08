import type { InvestigationReport } from '#api/types'
import { formatDuration } from '#lib/utils'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-error',
  high: 'text-warning',
  medium: 'text-info',
  low: 'text-text-secondary',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: '🔴 Critical',
  high: '🟠 High',
  medium: '🔵 Medium',
  low: '⚪ Low',
}

export function ReportPanel({ report }: { report: InvestigationReport }) {
  const severityColor = SEVERITY_COLORS[report.severity] ?? 'text-text-secondary'
  const severityLabel = SEVERITY_LABELS[report.severity] ?? report.severity

  const consoleErrors = report.evidence?.filter((e) => e.type === 'console_error') ?? []
  const networkErrors = report.evidence?.filter((e) => e.type === 'network_error') ?? []

  const fixExplanation = typeof report.suggestedFix === 'string'
    ? report.suggestedFix
    : report.suggestedFix?.explanation ?? null

  return (
    <div id="report" className="border border-report/30 border-l-4 border-l-report rounded-lg bg-bg-secondary p-4 space-y-4 shadow-[0_0_12px_rgba(139,92,246,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-report font-mono flex items-center gap-2">
          <span>📋</span> Bug Report
        </h3>
        <span className={`text-xs font-mono ${severityColor}`}>{severityLabel}</span>
      </div>

      {/* Summary */}
      <div>
        <p className="text-sm text-text-primary leading-relaxed">{report.summary}</p>
      </div>

      {/* Root Cause */}
      {report.rootCause && (
        <Section title="Root Cause">
          <p className="text-sm text-text-secondary leading-relaxed">{report.rootCause}</p>
        </Section>
      )}

      {/* Steps to Reproduce */}
      {report.reproSteps.length > 0 && (
        <Section title="Steps to Reproduce">
          <ol className="list-decimal list-inside space-y-1">
            {report.reproSteps.map((step, i) => (
              <li key={i} className="text-sm text-text-secondary">{step}</li>
            ))}
          </ol>
        </Section>
      )}

      {/* Console Errors */}
      {consoleErrors.length > 0 && (
        <Section title="Console Errors">
          {consoleErrors.map((err, i) => (
            <pre key={i} className="text-xs text-error font-mono bg-bg-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {err.description}
            </pre>
          ))}
        </Section>
      )}

      {/* Network Errors */}
      {networkErrors.length > 0 && (
        <Section title="Network Errors">
          {networkErrors.map((err, i) => (
            <pre key={i} className="text-xs text-warning font-mono bg-bg-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {err.description}
            </pre>
          ))}
        </Section>
      )}

      {/* Network Findings */}
      {(report.networkFindings ?? []).length > 0 && (
        <Section title="Network Findings">
          <ul className="space-y-1">
            {(report.networkFindings ?? []).map((finding) => (
              <li key={finding} className="text-sm text-text-secondary font-mono">• {finding}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Suggested Fix */}
      {fixExplanation && (
        <Section title="Suggested Fix">
          <p className="text-sm text-success leading-relaxed">{fixExplanation}</p>
        </Section>
      )}

      {/* Code Location */}
      {report.codeLocation && (
        <Section title="Code Location">
          <code className="text-xs text-text-muted font-mono block">
            {report.codeLocation.file}:{report.codeLocation.line}
            {report.codeLocation.column ? `:${report.codeLocation.column}` : ''}
          </code>
          {report.codeLocation.snippet && (
            <pre className="text-xs text-text-secondary font-mono bg-bg-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap mt-1">
              {report.codeLocation.snippet}
            </pre>
          )}
        </Section>
      )}

      {/* Duration */}
      {report.durationMs !== undefined && report.durationMs > 0 && (
        <div className="text-xs text-text-muted font-mono text-right">
          Completed in {formatDuration(report.durationMs)}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-mono text-text-muted uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  )
}
