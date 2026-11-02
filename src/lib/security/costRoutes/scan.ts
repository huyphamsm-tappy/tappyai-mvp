// SEC4 coverage ratchet — the scanner and the rule checker (test-time only: nothing in the app imports this file).
// Design and acceptance criteria: docs/phase8/SEC4-ROUTE-MATRIX.md §3. The scan is a HEURISTIC and says so: it reads the route source plus the
// project files it imports (depth 3) for provider-cost call patterns, and reads the limiter patterns from the ROUTE SOURCE itself.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type LimiterKind = 'distributed' | 'public' | 'quota' | 'inprocess' | 'local' | 'cron'
export type RouteStatus = 'covered' | 'known-gap' | 'exempt'

export interface CostRouteDecl {
  /** Path under src/app/api without the trailing /route.ts, e.g. 'voice/tts' or 'group/[id]/suggest'. */
  route: string
  /** What a call can cost (provider / resource). */
  cost: string
  /** Limiter kinds present in the route source — must equal what the scan finds (both directions). */
  limiters: readonly LimiterKind[]
  /** Who is counted (user id, ip, admin id …); free text, reviewed. */
  key: string
  status: RouteStatus
  /** known-gap: the missing control (>= 20 chars). exempt: why no limiter is needed (>= 40 chars). */
  note: string
  /** known-gap only: the slice of docs/phase8/SEC4-ROUTE-MATRIX.md §5 that closes it (2..6). */
  slice?: number
}

/** Cost signals — provider calls and cost-bearing resources. Names are stable ids used in messages. */
export const COST_SIGNALS: ReadonlyArray<readonly [string, RegExp]> = [
  ['llm', /\bAI\.(generate|extract|stream)\w*\s*\(|\b(streamText|generateText|generateObject)\s*\(/],
  ['serper', /\b(serperSearch|serperPlaces|serperShopping|serperImages)\s*\(|google\.serper\.dev/],
  ['google-speech-vision', /texttospeech\.googleapis|speech\.googleapis|vision\.googleapis|translation\.googleapis/],
  ['openai-anthropic-http', /api\.openai\.com|api\.anthropic\.com/],
  ['stripe', /new Stripe\(|from 'stripe'/],
  ['storage', /\b(getMediaProvider|createUploadSession)\b/],
  ['push-email', /\b(emitNotification|sendNotificationToUser|sendEmail)\b|from 'resend'/],
  ['provider-lookup', /webrisk\.googleapis\.com|safebrowsing\.googleapis|virustotal\.com|urlscan\.io/],
  ['places', /places\.googleapis\.com|\bfetchPlacePhoto\b/],
]

/**
 * Limiter patterns — read from the ROUTE source only, with comments removed (`stripComments`) and as CALLS (`name(`), not as bare words. A limiter that is only
 * imported, or only mentioned in a comment, does not count (2026-10-10: before this, `// publicRateLimit` or an unused import satisfied the ratchet).
 * Still a heuristic: it proves a limiter is CALLED somewhere in the route file, not that it runs before the provider call, on every method, or that its result is honoured.
 */
export const LIMITER_PATTERNS: ReadonlyArray<readonly [LimiterKind, RegExp]> = [
  ['distributed', /\b(distributedRateLimit|sharedRateLimit)\s*\(/],
  ['public', /\b(publicRateLimit|publicDailyRateLimit)\s*\(/],
  ['quota', /\b(consumeAiQuestion|consumeAiQuota)\s*\(/],
  ['inprocess', /\brateLimit\s*\(/],
  ['local', /\bcheckRL\s*\(/],
  ['cron', /\bcronAuth\b|CRON_SECRET/],
]

export const SCAN_DEPTH = 3

/** Removes block and line comments (a `//` that follows `:` or a quote is kept: URLs inside strings). Heuristic, used for limiter detection only. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

export interface RouteScan { route: string; signals: string[]; limiters: LimiterKind[] }

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** Scans `<srcRoot>/app/api/**\/route.ts`. `srcRoot` is the project's `src` directory (or a fixture tree with the same layout). */
export function scanRoutes(srcRoot: string): RouteScan[] {
  const apiRoot = join(srcRoot, 'app', 'api')
  const routes = walk(apiRoot).filter((f) => /[\\/]route\.ts$/.test(f))
  const cache = new Map<string, string>()
  const read = (f: string) => { if (!cache.has(f)) cache.set(f, existsSync(f) ? readFileSync(f, 'utf8') : ''); return cache.get(f)! }
  const resolveImport = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? join(srcRoot, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
    if (!base) return null
    for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base]) if (existsSync(c) && statSync(c).isFile()) return c
    return null
  }
  const importsOf = (f: string): string[] =>
    [...read(f).matchAll(/(?:import|export)\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => resolveImport(m[1] ?? m[2], f))
      .filter((x): x is string => !!x && !/\.test\.tsx?$/.test(x) && !/[\\/]app[\\/]api[\\/]/.test(x))
  const closure = (f: string): Set<string> => {
    const seen = new Set([f])
    let frontier = [f]
    for (let d = 0; d < SCAN_DEPTH; d++) {
      const next: string[] = []
      for (const x of frontier) for (const y of importsOf(x)) if (!seen.has(y)) { seen.add(y); next.push(y) }
      frontier = next
    }
    return seen
  }
  return routes.map((r) => {
    const route = r.slice(apiRoot.length + 1).replace(/\\/g, '/').replace(/\/route\.ts$/, '')
    const signals = new Set<string>()
    for (const f of closure(r)) for (const [name, re] of COST_SIGNALS) if (re.test(read(f))) signals.add(name)
    const source = stripComments(read(r))
    return { route, signals: [...signals].sort(), limiters: LIMITER_PATTERNS.filter(([, re]) => re.test(source)).map(([k]) => k).sort() as LimiterKind[] }
  }).sort((a, b) => a.route.localeCompare(b.route))
}

export interface RegistryInput {
  entries: readonly CostRouteDecl[]
  /** Admin routes that are allowed to lack `distributedRateLimit` — each is also a known-gap entry. */
  adminExceptions: readonly string[]
  knownGapBudget: number
}

/** The ratchet rules (AC1–AC5). Returns human-readable problems; an empty list means the registry matches the code. */
export function checkRegistry(scan: readonly RouteScan[], reg: RegistryInput): string[] {
  const problems: string[] = []
  const byRoute = new Map(reg.entries.map((e) => [e.route, e]))
  const scanned = new Map(scan.map((s) => [s.route, s]))
  const sameSet = (a: readonly string[], b: readonly string[]) => [...a].sort().join(',') === [...b].sort().join(',')

  for (const s of scan) {
    if (!s.signals.length) continue
    const entry = byRoute.get(s.route)
    if (s.route.startsWith('admin/')) {
      if (!s.limiters.includes('distributed') && !reg.adminExceptions.includes(s.route)) {
        problems.push(`AC1 admin route '${s.route}' (signals: ${s.signals.join(', ')}) has no distributedRateLimit and is not a recorded exception`)
      }
      if (entry && !reg.adminExceptions.includes(s.route)) problems.push(`AC1 admin route '${s.route}' must not have an individual entry unless it is an exception (it is governed by the group rule)`)
      continue
    }
    if (s.route.startsWith('cron/')) {
      if (!s.limiters.includes('cron')) problems.push(`AC1 cron route '${s.route}' (signals: ${s.signals.join(', ')}) does not check the cron secret`)
      continue
    }
    if (!entry) problems.push(`AC1 cost-bearing route '${s.route}' (signals: ${s.signals.join(', ')}; limiters in source: ${s.limiters.join(', ') || 'none'}) has no declaration in costRouteRegistry.ts`)
  }

  for (const e of reg.entries) {
    const s = scanned.get(e.route)
    if (!s) { problems.push(`AC2 declaration '${e.route}' refers to a route that does not exist`); continue }
    if (!sameSet(e.limiters, s.limiters)) problems.push(`AC3 '${e.route}' declares limiters [${e.limiters.join(', ')}] but the route source contains [${s.limiters.join(', ')}]`)
    if (e.status === 'covered') {
      if (!e.limiters.some((l) => l === 'distributed' || l === 'public' || l === 'quota' || l === 'cron')) problems.push(`AC4 '${e.route}' is 'covered' but declares no distributed / public / quota / cron limiter`)
    } else if (e.status === 'known-gap') {
      if (e.note.trim().length < 20) problems.push(`AC4 known-gap '${e.route}' must name the missing control (note >= 20 characters)`)
      if (!Number.isInteger(e.slice) || (e.slice as number) < 2 || (e.slice as number) > 6) problems.push(`AC4 known-gap '${e.route}' must name the closing slice (2..6)`)
    } else if (e.status === 'exempt') {
      if (e.note.trim().length < 40) problems.push(`AC4 exempt '${e.route}' needs a reason of at least 40 characters`)
    } else problems.push(`AC4 '${e.route}' has an unknown status`)
  }

  for (const route of reg.adminExceptions) {
    const e = byRoute.get(route)
    if (!e || e.status !== 'known-gap') problems.push(`AC4 admin exception '${route}' must also be a known-gap entry`)
  }
  const gaps = reg.entries.filter((e) => e.status === 'known-gap').length
  if (gaps > reg.knownGapBudget) problems.push(`AC5 ${gaps} known-gap entries exceed the budget of ${reg.knownGapBudget} (the list may only shrink; raising the budget is a reviewed change)`)
  if (gaps < reg.knownGapBudget) problems.push(`AC5 only ${gaps} known-gap entries remain but the budget is ${reg.knownGapBudget}: lower KNOWN_GAP_BUDGET so the closed gap cannot reopen unnoticed`)
  return problems
}
