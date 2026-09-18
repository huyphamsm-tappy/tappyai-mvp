// ─────────────────────────────────────────────────────────────────────────────
// TappyAI G1 Growth — the canonical analytics contract.
//
// ONE vocabulary for the growth loop, layered on the ONE existing pipeline:
// `src/lib/tracking/tracker.ts` → `POST /api/track` → `public.user_events`.
// This file adds no transport, no table and no vendor. It names the seven
// events the G1 metrics are computed from, the attribution sources a visit can
// carry, and the definitions (active / activated / D7 / useful result) that
// every dashboard, gate and test must agree on.
//
// 🚨 DEFINITIONS ARE VERSIONED, NOT SILENTLY EDITED. The D7 window below is a
// deliberate v1 widening (day 5–9) because the first cohorts are small; if it
// ever changes, bump `G1_DEFINITIONS_VERSION` and record why in
// docs/growth/G1_GROWTH_ARCHITECTURE.md so a historical number stays readable.
// ─────────────────────────────────────────────────────────────────────────────

export const G1_DEFINITIONS_VERSION = 1

/** The seven canonical growth events. Everything in G1 is computed from these. */
export const ANALYTICS_EVENTS = [
  'first_visit',
  'query',
  'result_action',
  'share_created',
  'share_viewed',
  'signup',
  'return',
] as const
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/**
 * Where a visit came from. Carried as `metadata.source` on every G1 event.
 *
 * `tgdd` is RESERVED: it is in the enum so a future partnership can attribute
 * without a contract change, and nothing in G1 emits it. Only a first `query`
 * with `source: 'tgdd'` will ever count as TGDĐ activation — an APK install is
 * not activation.
 */
export const ANALYTICS_SOURCES = [
  'wedge_scam',
  'share_out',
  'zalo_mini',
  'zalo_link',
  'qr_pos',
  'tgdd',
  'geo_google',
  'geo_chatgpt',
  'direct_share',
  'web_share_target',
  'direct',
] as const
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number]

/**
 * The observable actions that make a result "useful". A result with at least
 * one of these is a useful result — there is deliberately no separate event
 * for that; it is a query over `result_action`.
 *
 * `outbound_booking` is ALSO the affiliate/commerce attribution event. There is
 * no second revenue event: an affiliate click is a result_action carrying
 * `result_id`, and the outbound link carries the same attribution downstream.
 */
export const RESULT_ACTION_TYPES = [
  'outbound_booking',
  'outbound_map',
  'outbound_tiktok',
  'follow_up_query',
  'share',
] as const
export type ResultActionType = (typeof RESULT_ACTION_TYPES)[number]

const SOURCE_SET: ReadonlySet<string> = new Set(ANALYTICS_SOURCES)
const EVENT_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENTS)
const ACTION_SET: ReadonlySet<string> = new Set(RESULT_ACTION_TYPES)

export function isAnalyticsSource(value: unknown): value is AnalyticsSource {
  return typeof value === 'string' && SOURCE_SET.has(value)
}
export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === 'string' && EVENT_SET.has(value)
}
export function isResultActionType(value: unknown): value is ResultActionType {
  return typeof value === 'string' && ACTION_SET.has(value)
}

/**
 * Coerce an untrusted source string (a `?src=` query parameter, a header, a
 * Zalo launch parameter) to a canonical value. Anything unknown becomes
 * `direct` rather than being stored verbatim — an open string column is how a
 * source enum stops being an enum.
 */
export function coerceSource(value: unknown, fallback: AnalyticsSource = 'direct'): AnalyticsSource {
  return isAnalyticsSource(value) ? value : fallback
}

// ── Event property schemas ───────────────────────────────────────────────────
//
// Kept flat and PII-free by construction. `POST /api/track` already rejects any
// metadata that contains an email or phone number; these shapes never carry
// free text, only identifiers and enums, so nothing here can trip that filter
// or leak a query.

export interface G1BaseProps {
  /** Attribution source for the visit this event belongs to. */
  source: AnalyticsSource
  /** The share that brought this visitor in, if any (public `shared_results.id`). */
  share_id?: string
  /** Where the event was emitted from. Not a second platform field — a surface within one. */
  surface?: 'web' | 'public_result' | 'zalo_mini' | 'android' | 'ios'
}

export interface QueryProps extends G1BaseProps {
  /** Product domain of the query, when the client knows it. */
  domain?: string
  /** A stable per-turn id so `result_action` can point back at the result. */
  result_id?: string
  /** True when this is the visitor's first query ever (activation cohort day). */
  is_first_query?: boolean
  /** True when asked from a public shared result as an anonymous follow-up. */
  is_follow_up?: boolean
}

export interface ResultActionProps extends G1BaseProps {
  action_type: ResultActionType
  result_id?: string
  /** Outbound host (never the full URL — it may carry affiliate parameters). */
  target_host?: string
  /** The affiliate click id when the outbound builder issued one. */
  click_id?: string
  /** Set when the action happened on a public shared result rather than in chat. */
  share_id?: string
}

export interface ShareCreatedProps extends G1BaseProps {
  share_id: string
  slug: string
  domain?: string
  result_id?: string
  channel?: string
}

export interface ShareViewedProps extends G1BaseProps {
  share_id: string
  slug: string
  /** Where the viewer opened it — the referrer/UA class, not a raw referrer string. */
  channel?: 'zalo' | 'messenger' | 'facebook' | 'other'
}

export interface SignupProps extends G1BaseProps {
  method?: string
  /** First-touch source recorded on the very first visit, if different from `source`. */
  first_source?: AnalyticsSource
  first_share_id?: string
}

export interface ReturnProps extends G1BaseProps {
  /** VN calendar days since the visitor's first query. */
  days_since_first_query: number
}

export interface FirstVisitProps extends G1BaseProps {
  landing_path?: string
}

export type G1EventProps = {
  first_visit: FirstVisitProps
  query: QueryProps
  result_action: ResultActionProps
  share_created: ShareCreatedProps
  share_viewed: ShareViewedProps
  signup: SignupProps
  return: ReturnProps
}

/**
 * Validate a G1 event's properties. Used at the emit boundary (client) and by
 * the metrics layer (server) so both sides reject the same malformed rows.
 * Returns the reason for rejection or null when valid.
 */
export function validateG1Event(event: unknown, props: unknown): string | null {
  if (!isAnalyticsEvent(event)) return 'unknown_event'
  if (!props || typeof props !== 'object') return 'missing_props'
  const p = props as Record<string, unknown>
  if (!isAnalyticsSource(p.source)) return 'invalid_source'
  if (event === 'result_action' && !isResultActionType(p.action_type)) return 'invalid_action_type'
  if ((event === 'share_created' || event === 'share_viewed') && typeof p.share_id !== 'string') return 'missing_share_id'
  if (event === 'return' && typeof p.days_since_first_query !== 'number') return 'missing_days_since_first_query'
  return null
}

// ── Canonical definitions ────────────────────────────────────────────────────

/**
 * Retention window for "D7", in days after the FIRST QUERY day.
 *
 * v1 deliberately measures day 5–9 inclusive rather than exactly day 7: with a
 * few hundred users, a one-day bracket is dominated by noise. The cohort day is
 * the visitor's first `query` (not registration, not first visit), in
 * Asia/Ho_Chi_Minh — the reporting timezone the rest of analytics uses.
 */
export const D7_WINDOW = { fromDay: 5, toDay: 9 } as const

export const G1_DEFINITIONS = {
  version: G1_DEFINITIONS_VERSION,
  activeUser: 'An anon_id or user_id with at least one `query` event in the measurement period.',
  activatedUser: 'A user with at least one `result_action` during the session of their first `query`.',
  d7: `Cohort by first query date (VN day); retained if active (a \`query\`) on any of day ${D7_WINDOW.fromDay}–${D7_WINDOW.toDay} after it.`,
  usefulResult: 'A result with at least one `result_action` (outbound_booking | outbound_map | outbound_tiktok | follow_up_query | share).',
  tgddActivation: 'Only a first `query` carrying `source: "tgdd"`. An APK install is NOT activation.',
} as const

/**
 * Gate thresholds. v1 heuristics, configurable here and only here. Changing a
 * number is a product decision that must be recorded, not a silent edit.
 */
export const G1_GATES = {
  gate0_product_signal: {
    sampleMin: 30,
    sampleMax: 50,
    activationTarget: 0.5,
    activationFail: 0.3,
    onFail: 'fix product; do not expand acquisition channels',
  },
  gate1_retention: {
    sampleMin: 300,
    d7Target: 0.2,
    d7Fail: 0.1,
    onFail: 'stop expanding channels',
  },
  gate2_viral: {
    kFactorTarget: 0.2,
    kFactorFail: 0.1,
    onFail: 'cut/repair the loop; do not add acquisition traffic',
  },
} as const

/** Which of the seven events the ingestion route treats as "known". */
export const G1_KNOWN_EVENT_TYPES: ReadonlySet<string> = EVENT_SET
