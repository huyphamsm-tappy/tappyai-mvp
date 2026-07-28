import type {
  DurableStore, EventEmitter, ExploreSessionDeps, ExploreState, FeedType, FreezeTrigger,
  InvalidateReason, RestoreResult, SessionPhase, Snapshot,
} from './exploreTypes'

/**
 * ExploreSession — single owner of Explore navigation state.
 * Implements docs/CANONICAL_EXPLORE_NAVIGATION_SPEC.md §3 (contract), §5
 * (lifecycle), §6 (invariants). UI-agnostic by construction (P4/I11): no React,
 * no DOM, no router — storage, clock, id-gen and telemetry are all injected.
 *
 * Ownership (I2): this class is the ONLY writer of ExploreState. The UI reports
 * plain data in (reportActiveItem/setQueryShape) and receives decisions out
 * (restore). It never reads history, and nothing here may ever do so (I1/I4).
 */

const STORAGE_KEY = 'tappy:exploreSession.v1'
const DEFAULT_STALE_MS = 30 * 60 * 1000 // frozen default: 30 minutes

function defaultState(): ExploreState {
  return {
    schemaVersion: 1,
    activeReviewId: null,
    activeIndex: 0,
    scrollOffset: 0,
    feedType: 'for-you',
    sort: null,
    query: null,
    filters: {},
  }
}

export class ExploreSession {
  private phase: SessionPhase = 'idle'
  private state: ExploreState = defaultState()
  private snap: Snapshot | null = null
  private restoredThisEntry = false
  private userInputSinceEntry = false
  private disposed = false
  private sessionId: string
  private version = 0

  private readonly store: DurableStore | null
  private readonly emit: EventEmitter
  private readonly now: () => number
  private readonly staleAfterMs: number

  constructor(deps: ExploreSessionDeps = {}) {
    this.store = deps.store ?? null
    this.emit = deps.emit ?? (() => {})
    this.now = deps.now ?? (() => Date.now())
    this.staleAfterMs = deps.staleAfterMs ?? DEFAULT_STALE_MS
    this.sessionId = (deps.newId ?? (() => 's-' + Math.random().toString(36).slice(2, 10)))()
    // Cold start: adopt a durable mirror if one exists (spec F5). Invalid or
    // unsupported payloads are rejected without throwing (contract 3.9).
    const raw = this.safeGet()
    if (raw !== null) this.hydrate(raw)
  }

  // ── Reads (P3 inspectable) ───────────────────────────────────────────────
  getState(): ExploreState { return JSON.parse(JSON.stringify(this.state)) }
  getPhase(): SessionPhase { return this.phase }
  snapshot(): Snapshot | null { return this.snap ? JSON.parse(JSON.stringify(this.snap)) : null }

  // ── §3.1 enterExplore ────────────────────────────────────────────────────
  enterExplore(context?: Partial<Pick<ExploreState, 'feedType' | 'sort' | 'query' | 'filters' | 'tab'>>): void {
    if (this.disposed) return
    this.restoredThisEntry = false
    this.userInputSinceEntry = false
    if (this.snap) {
      const age = this.now() - this.snap.frozenAt
      if (age > this.staleAfterMs) {
        this.invalidate('stale')
      } else if (context && this.shapeConflicts(context)) {
        this.invalidate('filters-changed')
      } else {
        // Adopt the frozen state (query shape restored BEFORE any fetch — §3.1).
        this.state = JSON.parse(JSON.stringify(this.snap.state))
        this.phase = 'restoring'
        this.emit({ name: 'explore_session.restore_attempt', sessionId: this.sessionId, version: this.snap.version, ageMs: age })
        return
      }
    }
    if (context) this.state = { ...this.state, ...sanitizeContext(context) }
    this.phase = 'active'
  }

  // ── §3.2 leaveExplore ────────────────────────────────────────────────────
  leaveExplore(trigger: FreezeTrigger): Snapshot | null {
    if (this.disposed) return null
    // Idempotent (I7/F6): repeated departure signals return the same snapshot.
    if (this.phase === 'frozen' && this.snap) return this.snapshot()
    this.version += 1
    this.snap = {
      schemaVersion: 1,
      sessionId: this.sessionId,
      version: this.version,
      frozenAt: this.now(),
      trigger,
      state: JSON.parse(JSON.stringify(this.state)),
    }
    this.phase = 'frozen'
    this.mirror()
    this.emit({
      name: 'explore_session.freeze', sessionId: this.sessionId, version: this.version,
      activeReviewId: this.state.activeReviewId, activeIndex: this.state.activeIndex,
      feedType: this.state.feedType, trigger,
    })
    return this.snapshot()
  }

  // ── §3.3 reportActiveItem ────────────────────────────────────────────────
  reportActiveItem(input: { reviewId: string | null; index: number; scrollOffset?: number }): void {
    if (this.disposed) return
    if (!Number.isFinite(input.index) || input.index < 0) return // contract: no-op
    if (this.phase === 'restoring') this.userInputSinceEntry = true // scrolling during restore = user input (F7)
    this.state.activeReviewId = input.reviewId
    this.state.activeIndex = Math.floor(input.index)
    if (typeof input.scrollOffset === 'number' && input.scrollOffset >= 0) this.state.scrollOffset = input.scrollOffset
    if (this.phase === 'idle') this.phase = 'active'
  }

  // ── §3.4 setQueryShape ───────────────────────────────────────────────────
  setQueryShape(shape: Partial<Pick<ExploreState, 'feedType' | 'sort' | 'query' | 'filters' | 'tab'>>): void {
    if (this.disposed) return
    const clean = sanitizeContext(shape)
    const changed = (Object.keys(clean) as (keyof typeof clean)[]).some(k => JSON.stringify(this.state[k]) !== JSON.stringify(clean[k]))
    if (!changed) return
    this.state = { ...this.state, ...clean }
    // A different query shape can invalidate a held snapshot (F3) — but only
    // for fields that change WHICH ROWS the feed contains. `tab` is a view
    // switch, not a row filter.
    const rowShaping: (keyof ExploreState)[] = ['feedType', 'sort', 'query', 'filters']
    if (this.snap && rowShaping.some(k => k in clean && JSON.stringify(this.snap!.state[k]) !== JSON.stringify(this.state[k]))) {
      this.invalidate('filters-changed')
    }
  }

  // ── §3.5 restore ─────────────────────────────────────────────────────────
  restore(feedReviewIds: string[]): RestoreResult {
    const done = (r: RestoreResult): RestoreResult => {
      this.restoredThisEntry = true
      this.phase = this.phase === 'restoring' ? 'active' : this.phase
      this.emit({ name: 'explore_session.restore_result', outcome: r.outcome, targetReviewId: r.targetReviewId, resolvedIndex: r.resolvedIndex })
      if (r.outcome !== 'none') this.clearMirror() // consumed
      return r
    }
    if (this.disposed || this.phase !== 'restoring' || this.restoredThisEntry) {
      return { outcome: 'none', targetReviewId: null, resolvedIndex: null, scrollOffset: null }
    }
    if (this.userInputSinceEntry) return done({ outcome: 'aborted_user_input', targetReviewId: this.state.activeReviewId, resolvedIndex: null, scrollOffset: null })

    const target = this.snap?.state ?? this.state
    // I5: id first…
    if (target.activeReviewId) {
      const idx = feedReviewIds.indexOf(target.activeReviewId)
      if (idx >= 0) {
        this.state.activeIndex = idx
        return done({ outcome: 'exact', targetReviewId: target.activeReviewId, resolvedIndex: idx, scrollOffset: target.scrollOffset })
      }
    }
    // …index second…
    if (target.activeIndex > 0 && target.activeIndex < feedReviewIds.length) {
      const id = feedReviewIds[target.activeIndex] ?? null
      this.state.activeReviewId = id
      return done({ outcome: 'fallback_index', targetReviewId: id, resolvedIndex: target.activeIndex, scrollOffset: null })
    }
    // …top last — reported, never silent (I6).
    this.state.activeIndex = 0
    this.state.activeReviewId = feedReviewIds[0] ?? null
    return done({ outcome: 'fallback_top', targetReviewId: this.state.activeReviewId, resolvedIndex: 0, scrollOffset: null })
  }

  // ── §3.6 invalidate ──────────────────────────────────────────────────────
  invalidate(reason: InvalidateReason): void {
    if (this.disposed) return
    this.snap = null
    this.clearMirror()
    this.phase = 'invalidated'
    this.emit({ name: 'explore_session.invalidated', reason })
    // An invalidated session starts its next entry clean.
    if (reason === 'auth-changed' || reason === 'filters-changed') {
      this.state = { ...defaultState(), feedType: this.state.feedType, sort: this.state.sort, query: this.state.query, filters: this.state.filters, tab: this.state.tab }
    }
  }

  // ── §3.7 hydrate ─────────────────────────────────────────────────────────
  hydrate(raw: string): boolean {
    if (this.disposed) return false
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return false }
    if (!parsed || typeof parsed !== 'object') return false
    const s = parsed as Partial<Snapshot> & { schemaVersion?: unknown }
    if (s.schemaVersion !== 1) {
      if (typeof s.schemaVersion === 'number' && s.schemaVersion > 1) this.invalidate('schema-unsupported') // V5
      return false
    }
    if (!s.state || typeof s.state !== 'object' || (s.state as ExploreState).schemaVersion !== 1) return false
    // Audit hardening: a v1 envelope with a missing/invalid frozenAt would make
    // the staleness check `now - frozenAt > staleAfterMs` compare against NaN
    // (always false) and restore an unbounded-age snapshot. Reject instead.
    if (typeof s.frozenAt !== 'number' || !Number.isFinite(s.frozenAt)) return false
    if (typeof s.sessionId !== 'string' || s.sessionId.length === 0) return false
    // V3: unknown 1.x fields inside the parsed objects are preserved as-is.
    this.snap = s as Snapshot
    this.sessionId = s.sessionId ?? this.sessionId
    this.version = typeof s.version === 'number' ? s.version : this.version
    this.phase = 'frozen'
    return true
  }

  // ── §3.8 dispose ─────────────────────────────────────────────────────────
  dispose(): void { this.disposed = true }

  // ── internals ────────────────────────────────────────────────────────────
  private shapeConflicts(ctx: Partial<ExploreState>): boolean {
    if (!this.snap) return false
    const rowShaping: (keyof ExploreState)[] = ['feedType', 'sort', 'query', 'filters']
    return rowShaping.some(k => k in ctx && ctx[k] !== undefined && JSON.stringify(ctx[k]) !== JSON.stringify(this.snap!.state[k]))
  }

  private mirror(): void {
    if (!this.store || !this.snap) return
    try { this.store.set(STORAGE_KEY, JSON.stringify(this.snap)) } catch { this.emit({ name: 'explore_session.durability_unavailable' }) }
  }

  private clearMirror(): void {
    try { this.store?.remove(STORAGE_KEY) } catch { /* F4: never throw */ }
  }

  private safeGet(): string | null {
    try { return this.store?.get(STORAGE_KEY) ?? null } catch { this.emit({ name: 'explore_session.durability_unavailable' }); return null }
  }
}

function sanitizeContext(ctx: Partial<Pick<ExploreState, 'feedType' | 'sort' | 'query' | 'filters' | 'tab'>>) {
  const out: Partial<ExploreState> = {}
  if (ctx.feedType === 'for-you' || ctx.feedType === 'following' || ctx.feedType === 'latest') out.feedType = ctx.feedType as FeedType
  if ('sort' in ctx) out.sort = ctx.sort ?? null
  if ('query' in ctx) out.query = ctx.query ?? null
  if (ctx.filters && typeof ctx.filters === 'object') out.filters = ctx.filters
  if ('tab' in ctx) out.tab = ctx.tab
  return out
}
