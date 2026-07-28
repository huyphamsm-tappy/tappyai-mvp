/**
 * Canonical Explore Navigation Specification — data model (v1).
 * Source of Truth: docs/CANONICAL_EXPLORE_NAVIGATION_SPEC.md (Design Freeze 2026-07-28).
 *
 * Everything here is plain serializable data (P3 No Hidden State): no closures,
 * no element handles, no framework objects. Snapshot must round-trip through
 * JSON losslessly (I12).
 */

export type FeedType = 'for-you' | 'following' | 'latest'

/** ExploreState v1 — spec §2.1. */
export interface ExploreState {
  schemaVersion: 1
  activeReviewId: string | null
  activeIndex: number
  scrollOffset: number
  feedType: FeedType
  sort: string | null
  query: string | null
  filters: Record<string, string | number | boolean | null>
  /** Additive optional 1.x field (spec V2): which Explore tab was active
   *  ('home' | 'explore' | 'inbox' | 'profile'). Replaces the legacy
   *  sessionStorage 'reviews_tab' side-channel (migration item L8/L11/L12). */
  tab?: string
}

export type FreezeTrigger = 'route-change' | 'tab-switch' | 'viewer-open' | 'background' | 'explicit'

/** Snapshot v1 — spec §2.2. Pure JSON envelope produced by freeze(). */
export interface Snapshot {
  schemaVersion: 1
  sessionId: string
  version: number
  frozenAt: number
  trigger: FreezeTrigger
  state: ExploreState
}

export type RestoreOutcome = 'exact' | 'fallback_index' | 'fallback_top' | 'invalidated' | 'aborted_user_input' | 'none'

export interface RestoreResult {
  outcome: RestoreOutcome
  targetReviewId: string | null
  resolvedIndex: number | null
  scrollOffset: number | null
}

export type InvalidateReason = 'filters-changed' | 'stale' | 'auth-changed' | 'schema-unsupported' | 'explicit'

export type SessionPhase = 'idle' | 'active' | 'frozen' | 'restoring' | 'invalidated'

/** Telemetry — spec §7. Observation only; must never influence behaviour (I2). */
export type ExploreSessionEvent =
  | { name: 'explore_session.freeze'; sessionId: string; version: number; activeReviewId: string | null; activeIndex: number; feedType: FeedType; trigger: FreezeTrigger }
  | { name: 'explore_session.restore_attempt'; sessionId: string; version: number; ageMs: number }
  | { name: 'explore_session.restore_result'; outcome: RestoreOutcome; targetReviewId: string | null; resolvedIndex: number | null }
  | { name: 'explore_session.invalidated'; reason: InvalidateReason }
  | { name: 'explore_session.durability_unavailable' }

export type EventEmitter = (event: ExploreSessionEvent) => void

/** Injected durable mirror — sessionStorage on Web, but the session never
 *  touches a browser global itself (P4 UI-agnostic / I11). */
export interface DurableStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export interface ExploreSessionDeps {
  store?: DurableStore | null
  emit?: EventEmitter
  now?: () => number
  /** Staleness threshold; frozen default 30 minutes (recorded at Design Freeze). */
  staleAfterMs?: number
  /** Session id generator (injected — the session itself must stay replayable). */
  newId?: () => string
}
