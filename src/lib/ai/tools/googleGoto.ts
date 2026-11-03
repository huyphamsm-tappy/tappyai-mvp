// ── 31/10: Serper's result links are mostly Google redirect tokens - resolve them to the page they point to ─────────────────────────────────
//
// Measured 31/10 on the live API: 7 of 10 organic rows came back as `https://www.google.com/goto?url=<opaque token>` (displayedLink names the
// real site). The token cannot be decoded; Google answers it with a 302 whose Location is the real page. Every consumer downstream (the page
// reader, the source lists, Deep Research's canonicalSourceUrl) either dropped such a row as "a Google page" or showed google.com as the
// source - most of every search was lost. Each token is resolved ONCE here, before any consumer sees the row:
//   · only `https://www.google.com/goto` / `https://google.com/goto` is ever requested (a fixed host and path; the token is the query);
//   · the redirect is NOT followed: its Location is read as a string and checked like every other hop (validateHop: http/https, public
//     host, no credentials) - and it may not be another Google redirect;
//   · bounded (2.5 s each, all rows of a search at once), cached per token; anything that fails leaves the row exactly as it was.
import { validateHop } from '@/lib/security/safePageFetch'

const GOTO = /^https:\/\/(?:www\.)?google\.com\/goto\?/i
export const isGoogleGoto = (u: unknown): u is string => typeof u === 'string' && u.length < 2048 && GOTO.test(u)

const MAX_CACHE = 500
const cache = new Map<string, string | null>()
/**
 * Measured 31/10: after the first redirect, Google answers further tokens with a 200 bot-check page (a timed refresh needing its cookie). That
 * check is never worked around: on the first such answer the resolver stops asking Google for PAUSE_MS, and rows keep their token meanwhile.
 */
const PAUSE_MS = 10 * 60 * 1000
let pausedUntil = 0

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** The page a goto token points to, or null (not a token, no redirect, a Location that fails the hop check, a timeout). */
export async function resolveGoogleGoto(link: string, o: { fetch?: Fetch; timeoutMs?: number } = {}): Promise<string | null> {
  if (!isGoogleGoto(link)) return null
  if (cache.has(link)) return cache.get(link) ?? null
  if (Date.now() < pausedUntil) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 2500)
  let out: string | null = null
  try {
    const res = await (o.fetch ?? fetch)(link, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; TappyAI/1.0)' } })
    // not a redirect (the bot-check page): stop asking for a while, and do not remember this token as unresolvable
    if (res.status < 300 || res.status >= 400) { pausedUntil = Date.now() + PAUSE_MS; return null }
    const loc = res.headers.get('location')
    // review 02/11: a redirect to another Google page (the rate-limit "sorry" page, the consent page) is the bot check as well - never a source
    if (loc && /^https?:\/\/(?:[\w-]+\.)*google\.[a-z.]+(?:[/?#:]|$)/i.test(loc) && !/^https?:\/\/(?:[\w-]+\.)*google\.[a-z.]+\/(?:goto|url)\b/i.test(loc)) { pausedUntil = Date.now() + PAUSE_MS; return null }
    if (loc && !/^https?:\/\/(?:[\w-]+\.)*google\.[a-z.]+\/(?:goto|url)\b/i.test(loc)) {
      const hop = validateHop(loc, { allowHttp: true })
      out = 'url' in hop ? hop.url.toString() : null
    }
  } catch { out = null } finally { clearTimeout(timer) }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(link, out)
  return out
}

/** The rows of one search with every goto link replaced by its page (all at once); a row that cannot be resolved stays as it was. */
export async function resolveGotoRows<T extends { link: string }>(rows: T[], o: { fetch?: Fetch; timeoutMs?: number } = {}): Promise<{ rows: T[]; resolved: number; failed: number }> {
  let resolved = 0, failed = 0
  const out = await Promise.all(rows.map(async r => {
    if (!isGoogleGoto(r.link)) return r
    const real = await resolveGoogleGoto(r.link, o)
    if (!real) { failed++; return r }
    resolved++
    return { ...r, link: real }
  }))
  return { rows: out, resolved, failed }
}

/** The site Google shows for a result ("https://tridenstechnology.com › E-Mobility" → "tridenstechnology.com"); not a host → null. Pure. */
export function displayedSite(d: unknown): string | null {
  if (typeof d !== 'string') return null
  const head = d.split(/\s+›\s+|\s+>\s+/)[0].trim()
  let host = head
  try { host = new URL(/^https?:\/\//i.test(head) ? head : `https://${head}`).hostname } catch { return null }
  host = host.toLowerCase().replace(/^www\./, '')
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host) && !/(^|\.)google\.[a-z.]+$/.test(host) ? host : null
}

/** Test-only. */
export function __resetGotoCache(): void { cache.clear(); pausedUntil = 0 }
