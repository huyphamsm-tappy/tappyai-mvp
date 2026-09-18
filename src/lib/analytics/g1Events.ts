// ─────────────────────────────────────────────────────────────────────────────
// G1 event emitters — the seven canonical growth events, over the ONE tracker.
//
// Browser-only, best-effort, and deliberately thin: each emitter stamps the
// current attribution (`source`, `share_id`) onto the properties defined in
// analytics-contract.ts and hands the event to `track()`. No transport of its
// own, no vendor, no server call that the pipeline does not already make.
//
// Once-only guarantees (`first_visit`, `share_viewed` per share per session,
// `return` per day) live here in first-party storage so a page refresh cannot
// inflate a metric. `POST /api/track` dedups on event_id as a second line, and
// the metrics layer counts DISTINCT identities as a third — see growthMetrics.
// ─────────────────────────────────────────────────────────────────────────────

import { track } from '@/lib/tracking/tracker'
import { vnToday } from '@/lib/config/product'
import {
  validateG1Event,
  type AnalyticsEvent,
  type G1EventProps,
  type ResultActionType,
  type ShareViewedProps,
} from './analytics-contract'
import { getAttribution, getFirstTouchAttribution } from './attribution'

export const FIRST_VISIT_KEY = 'tappy_g1_first_visit_at'
export const FIRST_QUERY_KEY = 'tappy_g1_first_query_day'
export const RETURN_DAY_KEY = 'tappy_g1_last_return_day'
const SHARE_VIEWED_PREFIX = 'tappy_g1_share_viewed:'

function lsGet(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function lsSet(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* best effort */ } }
function ssGet(key: string): string | null { try { return sessionStorage.getItem(key) } catch { return null } }
function ssSet(key: string, v: string) { try { sessionStorage.setItem(key, v) } catch { /* best effort */ } }

/**
 * Emit one canonical event with attribution stamped in. Invalid props are
 * dropped here rather than sent — a malformed growth event is worse than a
 * missing one, because it silently pollutes a rate.
 */
export function emitG1<E extends AnalyticsEvent>(
  event: E,
  props: Omit<G1EventProps[E], 'source' | 'share_id'> & Partial<Pick<G1EventProps[E], 'source' | 'share_id'>>,
): boolean {
  if (typeof window === 'undefined') return false
  const attr = getAttribution()
  const full = {
    source: attr.source,
    ...(attr.share_id ? { share_id: attr.share_id } : {}),
    ...props,
  } as G1EventProps[E]
  if (validateG1Event(event, full)) return false
  track(event, full as unknown as Record<string, unknown>)
  return true
}

/** `first_visit` — once per browser, on the first meaningful page load. */
export function emitFirstVisit(landingPath?: string): boolean {
  if (typeof window === 'undefined') return false
  if (lsGet(FIRST_VISIT_KEY)) return false
  lsSet(FIRST_VISIT_KEY, new Date().toISOString())
  return emitG1('first_visit', { landing_path: landingPath ?? location.pathname })
}

/** `query` — every question sent to Tappy. Records the first-query day for D7 cohorts. */
export function emitQuery(props: { domain?: string; result_id?: string; is_follow_up?: boolean; surface?: G1EventProps['query']['surface'] }): boolean {
  if (typeof window === 'undefined') return false
  const first = lsGet(FIRST_QUERY_KEY)
  const isFirst = !first
  if (isFirst) lsSet(FIRST_QUERY_KEY, vnToday())
  return emitG1('query', { ...props, is_first_query: isFirst })
}

/** `result_action` — an observable action on a result. This is what makes a result "useful". */
export function emitResultAction(props: {
  action_type: ResultActionType
  result_id?: string
  target_host?: string
  click_id?: string
  share_id?: string
  surface?: G1EventProps['result_action']['surface']
}): boolean {
  return emitG1('result_action', props)
}

export function emitShareCreated(props: { share_id: string; slug: string; domain?: string; result_id?: string; channel?: string }): boolean {
  return emitG1('share_created', props)
}

/**
 * `share_viewed` — once per share per SESSION. Twenty refreshes of /r/<slug>
 * are one view here; the metrics layer additionally counts distinct viewer
 * anon_ids, so the same person across sessions is still one unique viewer.
 */
export function emitShareViewed(props: { share_id: string; slug: string; channel?: ShareViewedProps['channel'] }): boolean {
  if (typeof window === 'undefined') return false
  const key = SHARE_VIEWED_PREFIX + props.share_id
  if (ssGet(key)) return false
  ssSet(key, '1')
  return emitG1('share_viewed', { ...props, share_id: props.share_id, surface: 'public_result' })
}

/** `signup` — a first-ever authenticated session. Carries first-touch attribution. */
export function emitSignup(method?: string): boolean {
  const first = getFirstTouchAttribution()
  return emitG1('signup', {
    ...(method ? { method } : {}),
    ...(first ? { first_source: first.source, ...(first.share_id ? { first_share_id: first.share_id } : {}) } : {}),
  })
}

/** VN-day difference between two YYYY-MM-DD strings. Pure. */
export function daysBetweenVnDays(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`)
  const b = Date.parse(`${toDay}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * `return` — a visitor who queried on an earlier VN day is back. Emitted at
 * most once per VN day, on session start. Pure enough to test: pass `today`.
 */
export function emitReturnIfDue(today: string = vnToday()): boolean {
  if (typeof window === 'undefined') return false
  const firstDay = lsGet(FIRST_QUERY_KEY)
  if (!firstDay || firstDay === today) return false
  if (lsGet(RETURN_DAY_KEY) === today) return false
  lsSet(RETURN_DAY_KEY, today)
  return emitG1('return', { days_since_first_query: daysBetweenVnDays(firstDay, today) })
}

// ── Classification helpers (pure) ────────────────────────────────────────────

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i
const MAPS_HOST_RE = /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|openstreetmap\.org)$/i
const BOOKING_CTA_TYPES = new Set(['booking', 'internal_booking', 'affiliate', 'purchase', 'order', 'delivery', 'reservation', 'ticket'])
/**
 * Commerce/booking destinations the product actually links to (offer rows,
 * delivery and stay buttons). A click here with no CTA type is still a booking
 * intent. Deliberately a short, named list — not "any external link".
 */
const COMMERCE_HOST_RE = /(^|\.)(shopee\.vn|shopeefood\.vn|lazada\.vn|tiki\.vn|sendo\.vn|grab\.com|be\.com\.vn|foody\.vn|booking\.com|agoda\.com|traveloka\.com|klook\.com|ivivu\.com|mytour\.vn|vntrip\.vn|dienmayxanh\.com|thegioididong\.com|fptshop\.com\.vn|cellphones\.com\.vn|hasaki\.vn|beautybox\.com\.vn)$/i

/**
 * Map an outbound CTA (its `type` and URL) to a result_action type, or null
 * when the click is not one G1 counts. `website`/`call`/`search` are not
 * useful-result signals by definition and return null on purpose.
 */
export function classifyOutboundAction(ctaType: string | undefined, url: string | undefined): ResultActionType | null {
  let host = ''
  try { host = url ? new URL(url, 'https://www.tappyai.com').hostname : '' } catch { host = '' }
  if (TIKTOK_HOST_RE.test(host)) return 'outbound_tiktok'
  if (ctaType === 'maps' || ctaType === 'directions' || MAPS_HOST_RE.test(host) && /maps/i.test(url ?? '')) return 'outbound_map'
  if (ctaType && BOOKING_CTA_TYPES.has(ctaType)) return 'outbound_booking'
  if (COMMERCE_HOST_RE.test(host)) return 'outbound_booking'
  return null
}

/** Host only — an outbound URL may carry affiliate parameters that must not be logged. */
export function hostOf(url: string | undefined): string | undefined {
  try { return url ? new URL(url).hostname : undefined } catch { return undefined }
}

/** The share channel a viewer arrived through, from referrer/UA class only. */
export function detectShareChannel(referrer: string | null | undefined, userAgent: string | null | undefined): ShareViewedProps['channel'] {
  const ua = userAgent ?? ''
  const ref = referrer ?? ''
  if (/\bZalo/i.test(ua) || /zalo\.me|zaloapp\.com/i.test(ref)) return 'zalo'
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua) || /messenger\.com|m\.me/i.test(ref)) return 'messenger'
  if (/facebook\.com|fb\.com/i.test(ref)) return 'facebook'
  return 'other'
}
