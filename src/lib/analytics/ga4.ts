// Google Analytics 4 — the web's interim production measurement layer.
//
// This module is deliberately small and has ONE emitter path: `mirrorToGa4` is called from
// `track()` in lib/tracking/tracker.ts, so a GA4 event exists only where the in-app tracker
// already emits one. Nothing else in the app calls gtag directly. That keeps the taxonomy
// closed (the allowlist below IS the taxonomy) and makes "fires exactly once" a property of
// the tracker rather than of every call site.
//
// Privacy rules, enforced here and not left to callers:
//   - only the parameters named in GA4_EVENT_MAP are forwarded; everything else in the
//     tracker's metadata (review_id, place names, queries, ids) is dropped on the floor;
//   - page_location never carries a query string or hash (`/login?email=1`, `?returnTo=`,
//     search terms), and UUID path segments (chat threads, review ids) are collapsed;
//   - no user_id, no email, no message text, no AI output, no tokens — ever.
//
// Enabled only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set. Scope that variable to the
// Production environment in Vercel and preview / local traffic never reaches the property.
// See docs/analytics/GA4_SETUP.md.

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

// Read as a literal so Next inlines it into the client bundle.
export const GA4_MEASUREMENT_ID: string | undefined = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined

export const GTAG_SCRIPT_HOST = 'https://www.googletagmanager.com'

export function isGa4Enabled(): boolean {
  return typeof window !== 'undefined' && !!GA4_MEASUREMENT_ID
}

type GaParams = Record<string, string | number | boolean>

// The gtag() stub: pushes the `arguments` object onto dataLayer exactly like Google's
// snippet does. gtag.js drains the queue when it loads, so calls made before the script
// arrives are not lost and ordering (js → config → events) is preserved.
function gtag(...args: unknown[]) {
  const w = window
  w.dataLayer = w.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments)
}

let initialised = false
let lastPageViewPath: string | null = null

/** Idempotent. Pushes `js` + `config` once. Automatic page_view is OFF: the app sends it. */
export function ga4Init() {
  if (!isGa4Enabled() || initialised) return
  initialised = true
  gtag('js', new Date())
  gtag('config', GA4_MEASUREMENT_ID, {
    send_page_view: false,
    // The tag would otherwise read document.location (query string included) for every hit.
    page_location: sanitizeLocation(window.location.pathname),
  })
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `/chat/2f1c…-…` → `/chat/_id`. Slugs and short ids are kept: they are page identity, not a person's. */
export function normalizePath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].split('#')[0]
  return path
    .split('/')
    .map(seg => (UUID_SEGMENT.test(seg) ? '_id' : seg))
    .join('/') || '/'
}

/** origin + normalised path. Never the query string, never the hash. */
export function sanitizeLocation(pathname: string): string {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  return `${origin}${normalizePath(pathname)}`
}

/**
 * One page_view per route change. The in-app tracker's `page_view` fires from a
 * `usePathname` effect, so a query-only change never counts as a new page and a repeated
 * effect for the same path (React strict mode, remounts) is collapsed here.
 */
export function ga4PageView(pathname: string) {
  if (!isGa4Enabled()) return
  ga4Init()
  const path = normalizePath(pathname)
  if (path === lastPageViewPath) return
  lastPageViewPath = path
  const page_location = sanitizeLocation(path)
  // Re-issue config so every later event on this page carries the sanitised location too.
  gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false, page_location })
  gtag('event', 'page_view', { page_location, page_path: path, page_title: document.title })
}

export function ga4Event(name: string, params: GaParams = {}) {
  if (!isGa4Enabled()) return
  ga4Init()
  gtag('event', name, params)
}

type Meta = Record<string, unknown> | undefined

function pick(meta: Meta, keys: string[]): GaParams {
  const out: GaParams = {}
  if (!meta) return out
  for (const k of keys) {
    const v = meta[k]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out
}

interface Ga4Mapping {
  /** GA4 event name. Google's recommended names are used where one fits (login, sign_up, share, search). */
  name: string
  /** The ONLY metadata keys forwarded, all low-cardinality enums or booleans. */
  params: string[]
  /** Constant params added to every hit of this event. */
  constant?: GaParams
}

/**
 * THE TAXONOMY. Internal tracker event → GA4 event. An internal event absent from this map
 * is not sent to GA4 at all. `page_view` is handled by ga4PageView, not listed here.
 */
export const GA4_EVENT_MAP: Readonly<Record<string, Ga4Mapping>> = {
  // ── Auth (Event Catalog §4) — Google recommended names ──
  auth_signup_completed: { name: 'sign_up', params: ['method'] },
  auth_login_completed: { name: 'login', params: ['method', 'is_first_login'] },
  auth_login_failed: { name: 'login_failed', params: ['method', 'reason'] },
  auth_logout_completed: { name: 'logout', params: ['method'] },

  // ── Main Chat / AI (Event Catalog §5) — one hit per completed AI answer; `feature` is the
  //    domain (food / travel / shopping / entertainment / spa …), never the text. ──
  chat_response_received: { name: 'chat_response', params: ['feature'] },

  // ── Saves ──
  search_result_saved: { name: 'save_place', params: ['place_type'], constant: { source: 'chat' } },
  place_save: { name: 'save_place', params: [], constant: { source: 'reviews' } },

  // ── Reviews / feed ── (review_id and place names are NOT forwarded)
  review_search: { name: 'search', params: [], constant: { search_type: 'reviews' } },
  review_like: { name: 'review_like', params: ['liked'] },
  review_share: { name: 'share', params: [], constant: { content_type: 'review' } },

  // ── Funnel completeness (RUNBOOK §3.19) — added 2026-09-21, all enum/boolean only ──
  // A recommended place/product card was tapped. `domain` is the vertical enum
  // (food / travel / shopping / entertainment / spa), never the place or product.
  recommendation_click: { name: 'recommendation_click', params: ['domain'] },
  // Content report (F-031). Mirrors the existing internal `report` event; only the
  // fixed reason enum (spam / harassment / copyright / …) is forwarded, never the
  // reported id, author or text.
  report: { name: 'report_submitted', params: ['reason'] },
  // Scam Shield ran a check. `check_type` ∈ url|qr|message, `risk_level` is the
  // verdict enum — NEVER the checked URL, message text, QR contents or any number
  // extracted from them.
  scam_check: { name: 'scam_check', params: ['check_type', 'risk_level'] },
  // The main chat was opened. No metadata is forwarded (see chat_opened fire site).
  chat_opened: { name: 'chat_opened', params: [] },
  // A commerce / buy link was followed. Fired GA-ONLY at the commerce-handoff tap
  // (lib/recommendation/handoff.ts → trackGa), so it is not a second parallel
  // user_events row: the internal record is the handoff beacon (CCP event 6). Only
  // the vertical, the provider slug and whether a tracking wrapper was applied are
  // forwarded — never the destination URL or the opaque link ids.
  affiliate_click: { name: 'affiliate_click', params: ['domain', 'provider', 'tracked'] },
  // The "Tìm trên …" search-redirect link on a shopping card was tapped. A demand
  // signal while real buy buttons are sparse — kept SEPARATE from affiliate_click so
  // it can never inflate that metric (this is a search redirect, not an affiliate
  // link). `platform` is the marketplace ENUM (shopee/lazada/tiki/tiktok/other),
  // never the seller string, the product name or the URL.
  shopping_search_click: { name: 'shopping_search_click', params: ['domain', 'platform'] },
}

/** Called by tracker.track() for every in-app event. Safe to call when GA4 is disabled. */
export function mirrorToGa4(eventType: string, metadata?: Record<string, unknown>) {
  if (!isGa4Enabled()) return
  if (eventType === 'page_view') {
    const path = metadata && typeof metadata.path === 'string' ? metadata.path : window.location.pathname
    ga4PageView(path)
    return
  }
  const mapping = GA4_EVENT_MAP[eventType]
  if (!mapping) return
  ga4Event(mapping.name, { ...pick(metadata, mapping.params), ...(mapping.constant ?? {}) })
}

/** Test seam only. */
export function __resetGa4ForTests() {
  initialised = false
  lastPageViewPath = null
  if (typeof window !== 'undefined') window.dataLayer = []
}
