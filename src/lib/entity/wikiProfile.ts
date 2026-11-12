// Entity chips (owner 12/11): the profile a chip opens. SOURCE: Wikipedia's public REST summary, nothing else. No model call, no cost.
//
// Hard rules, each one has a test that fails without it (wikiProfile.test.ts, route test):
//   · FIXED HOSTS: the request goes to https://vi.wikipedia.org or https://en.wikipedia.org and nowhere else; the person supplies only a TITLE, URL-encoded into the path.
//   · TITLE VALIDATION: length, charset (letters, digits, space and a few punctuation marks), no slash, backslash, percent, colon (namespaces), control character, dot-only title.
//   · BOUNDED: a time limit per request and a byte limit on the body (safeGetText: every hop re-validated, destination address pinned).
//   · the answer's FINAL host must still be the same wiki (a redirect cannot lead elsewhere).
//   · HONEST: kept only when Wikipedia's page is a standard article (not a disambiguation page) whose title matches the name; the picture only from upload.wikimedia.org (https);
//     the link only an article page. A name Wikipedia cannot resolve yields null (no chip).
//   · no cookies, no credentials: the request carries a fixed User-Agent and nothing of the visitor.
import { safeGetText } from '@/lib/security/safeFetch'
import { sameSubject } from '@/lib/media/wikiEntity'
import { isAllowedMediaPage } from '@/lib/media/mediaHosts'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

export interface WikiProfile {
  /** the name the answer used (what the chip shows) */
  name: string
  /** Wikipedia's own title of the article */
  title: string
  description: string
  extract: string
  image: string | null
  href: string
  lang: 'vi' | 'en'
  source: 'Wikipedia'
}

export const MAX_TITLE_LENGTH = 80
export const MAX_BODY_BYTES = 80_000
export const REQUEST_TIMEOUT_MS = 2500

/** letters / digits first and last (a closing bracket or dot may end), inside: letters, digits, space and . , ' ’ & ( ) - */
const TITLE_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} .,'’&()-]{0,78}[\p{L}\p{N}.)]$|^[\p{L}\p{N}]$/u

/** The title the route will look up, or null. Never lets a slash, a percent escape, a colon, a control character or a dot-only title through. Pure. */
export function validEntityTitle(raw: unknown): string | null {
  if (typeof raw !== 'string' || /[\p{Cc}\p{Cf}]/u.test(raw)) return null
  const t = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!t || t.length > MAX_TITLE_LENGTH) return null
  if (!TITLE_RE.test(t)) return null
  if (/^[.\s-]+$/.test(t) || t.includes('..')) return null
  return t
}

const HOSTS = { vi: 'vi.wikipedia.org', en: 'en.wikipedia.org' } as const

/** The one URL a lookup may use: a fixed host and the encoded title. Exported for the tests. */
export function summaryUrl(lang: 'vi' | 'en', title: string): string {
  return `https://${HOSTS[lang]}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`
}

const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Only a picture hosted on Wikimedia's own image hosts (https, no credentials, no odd port). */
export function wikimediaImage(u: unknown): string | null {
  if (typeof u !== 'string' || u.length > 1024 || !isSafeHttpsUrl(u)) return null
  try {
    const x = new URL(u)
    // Wikipedia's summary serves its thumbnails from thumb.wikimedia.org (measured 12/11) and the originals from upload.wikimedia.org: those two hosts, nothing else
    return (x.hostname === 'upload.wikimedia.org' || x.hostname === 'thumb.wikimedia.org') && !x.port && !x.username && !x.password ? u : null
  } catch { return null }
}

export type GetText = (url: string, signal: AbortSignal, opts: { maxBytes: number }) => Promise<{ text: string; finalUrl: string }>

const defaultGetText: GetText = (url, signal, opts) => safeGetText(url, signal, { maxBytes: opts.maxBytes })

/** Parse one summary payload into a profile, or null when it is not an honest match for `name`. Pure. */
export function profileFromSummary(json: unknown, name: string, lang: 'vi' | 'en'): WikiProfile | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  if (j.type !== 'standard') return null
  const title = clip(j.title, 120)
  const extract = clip(j.extract, 800)
  const description = clip(j.description, 160)
  // an article with no short description is the bare homonym of a word ("Tesla" = the unit of magnetic flux density on vi.wikipedia, measured 12/11): too likely to be another thing than the answer's
  if (!title || !extract || !description || !sameSubject(title, name)) return null
  const content = (j.content_urls as { desktop?: { page?: unknown } } | undefined)?.desktop?.page
  if (!isAllowedMediaPage(content)) return null
  const thumb = (j.thumbnail as { source?: unknown } | undefined)?.source ?? (j.originalimage as { source?: unknown } | undefined)?.source
  return { name, title, description, extract, image: wikimediaImage(thumb), href: content, lang, source: 'Wikipedia' }
}

/** One name → its Wikipedia profile (Vietnamese Wikipedia first, then English), or null. Never throws. */
export async function fetchWikiProfile(rawName: string, getText: GetText = defaultGetText): Promise<WikiProfile | null> {
  const name = validEntityTitle(rawName)
  if (!name) return null
  for (const lang of ['vi', 'en'] as const) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await getText(summaryUrl(lang, name), ctrl.signal, { maxBytes: MAX_BODY_BYTES })
      let host = ''
      try { host = new URL(res.finalUrl).hostname } catch { continue }
      if (host !== HOSTS[lang]) continue
      const p = profileFromSummary(JSON.parse(res.text), name, lang)
      if (p) return p
    } catch { /* not found, timeout, too large, blocked, bad JSON: try the next wiki, then give up */ } finally { clearTimeout(timer) }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// cache: names repeat across answers (Elon Musk, Tesla ...), and Wikipedia asks clients to be gentle. Per server instance, bounded, with a short life for "not found".
// ---------------------------------------------------------------------------------------------------------------------

const HIT_TTL_MS = 6 * 60 * 60 * 1000
const MISS_TTL_MS = 30 * 60 * 1000
const MAX_ENTRIES = 400
const cache = new Map<string, { at: number; profile: WikiProfile | null }>()

const keyOf = (name: string) => name.toLowerCase()

/** Cached lookup. `now` and `getText` are injectable for the tests. */
export async function lookupWikiProfile(rawName: string, getText: GetText = defaultGetText, now: number = Date.now()): Promise<WikiProfile | null> {
  const name = validEntityTitle(rawName)
  if (!name) return null
  const k = keyOf(name)
  const hit = cache.get(k)
  if (hit && now - hit.at < (hit.profile ? HIT_TTL_MS : MISS_TTL_MS)) return hit.profile ? { ...hit.profile, name } : null
  const profile = await fetchWikiProfile(name, getText)
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(k, { at: now, profile })
  return profile
}

/** Test hook. */
export const __clearWikiProfileCache = (): void => { cache.clear() }
