// ── Wave 3 · W1 · robots.txt for the pages the consult research opens (RFC 9309) ─────────────────────────────────────────────────────────────────
//
// Owner decision (Wave 3, 26/10): when the research reads a page, the site's robots.txt is honoured - cached per host, a page it forbids is not opened.
//
//   · the group that names our token (`tappyai`) wins, else the `*` group, else everything is allowed;
//   · inside a group the LONGEST matching path pattern wins and Allow beats Disallow on a tie; `*` matches any run of characters and a trailing `$` anchors the end;
//   · robots.txt answered 4xx (none there)  -> everything allowed;  answered but cannot be reached (5xx, timeout, network, refused address)  -> everything disallowed for the cache window (RFC 9309 2.3.1.4);
//   · the file is read with the same SSRF-safe fetcher as the pages, only the first 500 KB count, and only plain text is parsed.
//
// Pure parser + a small cached gate with an injectable fetcher (tests use a fake; nothing here touches the network on its own).

import type { PageFetchResult } from './safePageFetch'

export const ROBOTS_TOKEN = 'tappyai'
export const ROBOTS_MAX_BYTES = 500_000

interface Rule { allow: boolean; pattern: string }
export interface RobotsRules { groups: Array<{ agents: string[]; rules: Rule[] }> }
export type RobotsVerdict = { kind: 'rules'; rules: RobotsRules } | { kind: 'allow_all' } | { kind: 'disallow_all' }

/** Pure. Parses a robots.txt body. Unknown lines are ignored; a rule line before any user-agent line belongs to no group. */
export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules['groups'] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const rawLine of text.slice(0, ROBOTS_MAX_BYTES).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const field = line.slice(0, i).trim().toLowerCase()
    const value = line.slice(i + 1).trim()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if ((field === 'allow' || field === 'disallow') && current) current.rules.push({ allow: field === 'allow', pattern: value })
  }
  return { groups }
}

/** A path pattern as a matcher: `*` is any run, a trailing `$` is the end. Returns the match length (the specificity), or -1. */
function matchLength(pattern: string, target: string): number {
  if (pattern === '') return -1 // an empty Disallow matches nothing
  if (pattern.length > 300 || (pattern.match(/\*/g)?.length ?? 0) > 6) return -1 // a hostile file cannot make the matcher expensive: such a rule is ignored
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  // the pattern becomes an anchored-at-start regular expression: every character is literal except `*`; the length of the pattern is its specificity
  const re = new RegExp(`^${body.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`)
  return re.test(target) ? body.length : -1
}

/** Pure. May `token` fetch `pathAndQuery` under these rules? */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string, token: string = ROBOTS_TOKEN): boolean {
  const named = rules.groups.filter(g => g.agents.some(a => a !== '*' && a !== '' && token.startsWith(a)))
  const group = named.length > 0 ? named : rules.groups.filter(g => g.agents.includes('*'))
  if (group.length === 0) return true
  let best = -1
  let allowed = true
  for (const r of group.flatMap(g => g.rules)) {
    const len = matchLength(r.pattern, pathAndQuery)
    if (len < 0) continue
    if (len > best || (len === best && r.allow)) { best = len; allowed = r.allow }
  }
  return allowed
}

type Fetcher = (url: string, signal?: AbortSignal) => Promise<PageFetchResult>
const OK_TTL_MS = 60 * 60_000
const FAIL_TTL_MS = 10 * 60_000
const MAX_HOSTS = 200

/** A cached robots.txt gate. One per process in the route; tests build their own with a fake fetcher and clock. */
export function createRobotsGate(o: { fetchPage: Fetcher; now?: () => number }) {
  const now = o.now ?? Date.now
  const cache = new Map<string, { verdict: RobotsVerdict; at: number; ttl: number }>()
  const inflight = new Map<string, Promise<RobotsVerdict>>()

  async function load(origin: string, signal?: AbortSignal): Promise<{ verdict: RobotsVerdict; ttl: number }> {
    const r = await o.fetchPage(`${origin}/robots.txt`, signal)
    if (r.ok) {
      if (!/^text\//i.test(r.contentType)) return { verdict: { kind: 'allow_all' }, ttl: OK_TTL_MS } // not a robots file (an HTML page answered): nothing to honour
      return { verdict: { kind: 'rules', rules: parseRobots(r.body) }, ttl: OK_TTL_MS }
    }
    if (r.reason === 'http_error' && r.status !== undefined && r.status >= 400 && r.status < 500) return { verdict: { kind: 'allow_all' }, ttl: OK_TTL_MS }
    return { verdict: { kind: 'disallow_all' }, ttl: FAIL_TTL_MS }
  }

  async function verdictFor(origin: string, signal?: AbortSignal): Promise<RobotsVerdict> {
    const hit = cache.get(origin)
    if (hit && now() - hit.at < hit.ttl) return hit.verdict
    const pending = inflight.get(origin)
    if (pending) return pending
    const p = load(origin, signal).then(({ verdict, ttl }) => {
      cache.set(origin, { verdict, at: now(), ttl })
      if (cache.size > MAX_HOSTS) cache.delete(cache.keys().next().value as string)
      return verdict
    }).finally(() => { inflight.delete(origin) })
    inflight.set(origin, p)
    return p
  }

  return {
    /** May the page at `url` be opened? Never throws; a URL that does not parse is not allowed. */
    async check(url: string, signal?: AbortSignal): Promise<{ allowed: boolean; reason: 'allowed' | 'disallowed_by_rules' | 'robots_unreachable' | 'bad_url' }> {
      let u: URL
      try { u = new URL(url) } catch { return { allowed: false, reason: 'bad_url' } }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return { allowed: false, reason: 'bad_url' }
      const v = await verdictFor(u.origin, signal)
      if (v.kind === 'allow_all') return { allowed: true, reason: 'allowed' }
      if (v.kind === 'disallow_all') return { allowed: false, reason: 'robots_unreachable' }
      return robotsAllows(v.rules, `${u.pathname}${u.search}`) ? { allowed: true, reason: 'allowed' } : { allowed: false, reason: 'disallowed_by_rules' }
    },
    __reset(): void { cache.clear(); inflight.clear() },
  }
}
export type RobotsGate = ReturnType<typeof createRobotsGate>
