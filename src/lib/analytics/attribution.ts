// ─────────────────────────────────────────────────────────────────────────────
// G1 attribution — how "where did this visitor come from" survives the loop:
//
//   discovery → landing → query → share → public result → new visitor → signup
//
// Two records, both first-party and PII-free:
//   · SESSION attribution (sessionStorage)  — the source of the CURRENT visit.
//     Stamped onto every G1 event as `metadata.source` / `metadata.share_id`.
//   · FIRST-TOUCH attribution (localStorage) — set once, never overwritten.
//     Reported on `signup` as `first_source` / `first_share_id`, which is what
//     makes "viewer → signup" attributable to the share that started it.
//
// THE BRIDGE IS `share_id`, NOT A URL PARAMETER. A public result link is bare
// (`/r/<slug>`; `isShareableUrl` refuses query strings), so the share page
// itself calls `setShareAttribution(share_id)` once it knows which share it is
// rendering. Nothing about the sharer — user_id, session, anon_id — is in the
// URL or in this record.
//
// `?src=` is accepted only on ENTRY surfaces we control (QR posters, the Zalo
// Mini App launcher, Web Share Target) and is coerced through the enum, so an
// arbitrary string can never become a source value.
// ─────────────────────────────────────────────────────────────────────────────

import { coerceSource, type AnalyticsSource } from './analytics-contract'

export const SESSION_ATTR_KEY = 'tappy_attr_session'
export const FIRST_ATTR_KEY = 'tappy_attr_first'
/** The only query parameter G1 reads for a source. */
export const SOURCE_PARAM = 'src'

export interface Attribution {
  source: AnalyticsSource
  share_id?: string
  /** ISO timestamp of when this attribution was captured. */
  at: string
  /** A per-landing nonce so "is this landing the first touch?" is exact, not a timestamp comparison. */
  n?: string
}

const SHARE_PATH_RE = /^\/r\/[A-Za-z0-9_-]+\/?$/

const SEARCH_REFERRER_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:google\.[a-z]{2,6}(?:\.[a-z]{2})?|search\.yahoo\.com|duckduckgo\.com|coccoc\.com)(?:\/|$)/i
const BING_REFERRER_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*bing\.com(?:\/|$)/i
const AI_REFERRER_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:chatgpt\.com|openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai)(?:\/|$)/i

/**
 * GEO attribution from the referrer class only. Pure. A search engine or an AI
 * answer engine sending a visitor to a public page is the discovery loop
 * closing; both are recorded as their canonical source, never the raw referrer.
 */
export function sourceFromReferrer(referrer: string | null | undefined): AnalyticsSource | null {
  if (!referrer) return null
  if (AI_REFERRER_RE.test(referrer)) return 'geo_chatgpt'
  // Bing is its own index (and feeds Copilot/ChatGPT Search), so it is
  // reported apart from Google; an AI Overview click is NOT separable from
  // a Google blue link by referrer, so there is deliberately no 'google_ai'.
  if (BING_REFERRER_RE.test(referrer)) return 'bing_search'
  if (SEARCH_REFERRER_RE.test(referrer)) return 'geo_google'
  return null
}

/** True for Zalo's in-app browser and the Zalo Mini App webview. */
export function isZaloUserAgent(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && /\bZalo(?:Theme|Pay|App|\/|\b)/i.test(ua)
}

/**
 * Decide the attribution for a landing, from data alone (pure, testable).
 *
 * Priority: an explicit, valid `?src=` wins; otherwise a public result path is
 * a share-out landing (Zalo's browser refines it to `zalo_link`); otherwise
 * `direct`. `share_id` is NOT derived here — the slug is not the id, and the
 * page sets it once the share is resolved (`setShareAttribution`).
 */
export function parseLandingAttribution(input: {
  pathname: string
  search?: string
  referrer?: string | null
  userAgent?: string | null
  now?: Date
}): Attribution {
  const at = (input.now ?? new Date()).toISOString()
  const params = new URLSearchParams(input.search ?? '')
  const explicit = params.get(SOURCE_PARAM)
  if (explicit !== null) {
    const source = coerceSource(explicit)
    // A coerced-to-direct value means the parameter was junk; treat as absent.
    if (source !== 'direct' || explicit === 'direct') return { source, at }
  }
  // A search engine or AI answer engine referrer is the GEO loop closing — it
  // outranks the share-path heuristic because the page was DISCOVERED, not sent.
  const geo = sourceFromReferrer(input.referrer)
  if (geo) return { source: geo, at }
  if (SHARE_PATH_RE.test(input.pathname)) {
    if (isZaloUserAgent(input.userAgent)) return { source: 'zalo_link', at }
    return { source: 'share_out', at }
  }
  return { source: 'direct', at }
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
function writeJson(storage: Storage, key: string, value: unknown) {
  try { storage.setItem(key, JSON.stringify(value)) } catch { /* best effort */ }
}

/**
 * Capture attribution for this landing. Browser-only, idempotent within a
 * session: the session record is written once per session (a later in-app
 * navigation must not re-attribute the visit), the first-touch record once
 * per browser.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  const existing = readJson<Attribution>(sessionStorage, SESSION_ATTR_KEY)
  if (existing) return existing
  const attr: Attribution = {
    ...parseLandingAttribution({
      pathname: location.pathname,
      search: location.search,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
    }),
    n: Math.random().toString(36).slice(2, 10),
  }
  writeJson(sessionStorage, SESSION_ATTR_KEY, attr)
  if (!readJson<Attribution>(localStorage, FIRST_ATTR_KEY)) writeJson(localStorage, FIRST_ATTR_KEY, attr)
  return attr
}

/** The current visit's attribution. Falls back to `direct` when nothing was captured. */
export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return { source: 'direct', at: new Date(0).toISOString() }
  return captureAttribution() ?? { source: 'direct', at: new Date().toISOString() }
}

/**
 * Force the session source for an ENTRY surface that knows what it is (the
 * Web Share Target page, the Zalo Mini App shell). Explicit beats heuristic;
 * first touch is set only when this is the browser's first landing.
 */
export function setSessionSource(source: AnalyticsSource): Attribution | null {
  if (typeof window === 'undefined') return null
  const current = captureAttribution() ?? { source: 'direct' as AnalyticsSource, at: new Date().toISOString() }
  const next: Attribution = { ...current, source }
  writeJson(sessionStorage, SESSION_ATTR_KEY, next)
  const first = readJson<Attribution>(localStorage, FIRST_ATTR_KEY)
  if (!first || isSameLanding(first, current)) writeJson(localStorage, FIRST_ATTR_KEY, next)
  return next
}

/** True when the first-touch record was written by THIS landing (same nonce, or legacy same timestamp). */
function isSameLanding(first: Attribution, current: Attribution): boolean {
  return first.n && current.n ? first.n === current.n : first.at === current.at
}

/** The first-touch attribution for this browser, if any. */
export function getFirstTouchAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  return readJson<Attribution>(localStorage, FIRST_ATTR_KEY)
}

/**
 * Attach the share that this visit landed on. Called by the public result
 * page once it has resolved the share. Upgrades a `direct` session to
 * `share_out` (the page was reached without a recognisable landing, e.g. an
 * in-app link) but never downgrades a more specific source such as
 * `zalo_link` or `zalo_mini`.
 */
export function setShareAttribution(shareId: string, source?: AnalyticsSource): Attribution | null {
  if (typeof window === 'undefined') return null
  const current = captureAttribution() ?? { source: 'direct' as AnalyticsSource, at: new Date().toISOString() }
  const next: Attribution = {
    source: source ?? (current.source === 'direct' ? 'share_out' : current.source),
    share_id: current.share_id ?? shareId,
    at: current.at,
    ...(current.n ? { n: current.n } : {}),
  }
  writeJson(sessionStorage, SESSION_ATTR_KEY, next)
  // First touch gains the share id only when THIS landing is the first touch
  // (same capture timestamp). An earlier first touch is never rewritten.
  const first = readJson<Attribution>(localStorage, FIRST_ATTR_KEY)
  if (!first || (!first.share_id && isSameLanding(first, current))) writeJson(localStorage, FIRST_ATTR_KEY, next)
  return next
}
