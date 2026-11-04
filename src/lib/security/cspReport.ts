// CSP violation reports (Report-Only trial of a script-src without 'unsafe-inline'). The browser POSTs here whenever the stricter policy WOULD have
// blocked something; nothing is blocked. This module turns the two wire formats into a small, privacy-safe record: the directive, WHAT was blocked
// ('inline', 'eval' or a host), and which page path / script path it happened on. No query strings, no fragments, no sample text: a URL can carry
// a token and an inline sample can carry page content.

export interface CspViolation {
  directive: string
  /** 'inline' | 'eval' | 'data' | 'blob' | a host name | 'other' */
  blocked: string
  /** path of the page (no origin, no query) */
  page: string
  /** host + path of the script that triggered it, or '' */
  source: string
}

const clip = (s: unknown, n = 120): string => (typeof s === 'string' ? s.slice(0, n) : '')

/** The pathname of a URL string, never its query or fragment. Unparseable input gives ''. */
export function safePath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return ''
  try { return new URL(raw).pathname.slice(0, 120) } catch { return '' }
}

function blockedKind(raw: unknown): string {
  const v = clip(raw, 300).toLowerCase()
  if (!v || v === 'inline') return v === 'inline' ? 'inline' : 'other'
  if (v === 'eval') return 'eval'
  if (v.startsWith('data:')) return 'data'
  if (v.startsWith('blob:')) return 'blob'
  try { return new URL(v).host.slice(0, 80) || 'other' } catch { return 'other' }
}

function sourceOf(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return ''
  try { const u = new URL(raw); return `${u.host}${u.pathname}`.slice(0, 120) } catch { return '' }
}

function fromLegacy(r: Record<string, unknown>): CspViolation {
  return {
    directive: clip(r['effective-directive'] ?? r['violated-directive'], 60).split(' ')[0] || 'unknown',
    blocked: blockedKind(r['blocked-uri']),
    page: safePath(r['document-uri']),
    source: sourceOf(r['source-file']),
  }
}

function fromReportingApi(b: Record<string, unknown>): CspViolation {
  return {
    directive: clip(b.effectiveDirective ?? b.violatedDirective, 60).split(' ')[0] || 'unknown',
    blocked: blockedKind(b.blockedURL),
    page: safePath(b.documentURL),
    source: sourceOf(b.sourceFile),
  }
}

/** Every violation in a report body, in either format (legacy `{"csp-report": {...}}` or the Reporting API's array). At most 20 per request. */
export function violationsOf(body: unknown): CspViolation[] {
  const out: CspViolation[] = []
  const rows = Array.isArray(body) ? body : [body]
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    if (o['csp-report'] && typeof o['csp-report'] === 'object') out.push(fromLegacy(o['csp-report'] as Record<string, unknown>))
    else if (o.type === 'csp-violation' && o.body && typeof o.body === 'object') out.push(fromReportingApi(o.body as Record<string, unknown>))
    if (out.length >= 20) break
  }
  return out
}

export const violationKey = (v: CspViolation): string => `${v.directive}|${v.blocked}|${v.page}|${v.source}`

/** A per-instance set of what has been logged, so a page view that raises 30 identical reports writes one line. Cleared when it grows past `cap`. */
export function createDedupe(cap = 500): (key: string) => boolean {
  const seen = new Set<string>()
  return (key) => {
    if (seen.has(key)) return false
    if (seen.size >= cap) seen.clear()
    seen.add(key)
    return true
  }
}
