/**
 * ExploreSession unit tests — Canonical Explore Navigation Spec conformance.
 *
 * DELIBERATELY NO jsdom environment: this file runs in plain Node, which IS the
 * proof of invariant I11 (UI-agnostic — no React, no DOM, no router). It also
 * covers: contract §3, versioning V1–V5, failure scenarios F1–F9, invariants
 * I3–I7, and I12 (lossless JSON round-trip).
 *
 * Replaces the behaviours of feedBackRestore.test.tsx (Bug #8 / Bug #17), per
 * migration M6 — the regressions are re-expressed against the session (history
 * plays no part, by design). Full L16 mapping:
 *   1. restore-by-id (+ marker cleared)  → 'restores the exact clip by id…',
 *      'restores by id when the feed re-ordered', mirror lifecycle tests
 *   2. fresh visit does not restore      → 'a plain visit with no snapshot…'
 *   3. cross-document Back (Bug #17)     → 'mirrors to the store on freeze and
 *      hydrates on cold start (F5)' — navigation type is no longer an input
 *   4. push-visit ≠ Back                 → SUPERSEDED by the spec: ANY re-entry
 *      restores (BT-03); the old assertion encoded the history dependency the
 *      migration removes. Recorded here so the inversion is deliberate.
 * Plus the NAV-004 / My-Profile regression (BT-02/BT-03) below.
 */
import { describe, it, expect, vi } from 'vitest'
import { ExploreSession } from './ExploreSession'
import type { DurableStore, ExploreSessionEvent } from './exploreTypes'

function memStore(broken = false): DurableStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: (k) => { if (broken) throw new Error('denied'); return data.get(k) ?? null },
    set: (k, v) => { if (broken) throw new Error('denied'); data.set(k, v) },
    remove: (k) => { if (broken) throw new Error('denied'); data.delete(k) },
  }
}

function mk(over: { store?: DurableStore | null; now?: () => number; staleAfterMs?: number } = {}) {
  const events: ExploreSessionEvent[] = []
  const session = new ExploreSession({ store: over.store ?? null, emit: (e) => events.push(e), now: over.now, staleAfterMs: over.staleAfterMs, newId: () => 'test-session' })
  return { session, events }
}

const FEED = ['r0', 'r1', 'r2', 'r3', 'r4']

describe('core freeze/restore (BT-01 mechanism, Bug #8 equivalent)', () => {
  it('restores the exact clip by id after leave + enter', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2, scrollOffset: 1624 })
    session.leaveExplore('route-change')
    session.enterExplore()
    const r = session.restore(FEED)
    expect(r.outcome).toBe('exact')
    expect(r.targetReviewId).toBe('r2')
    expect(r.resolvedIndex).toBe(2)
    expect(r.scrollOffset).toBe(1624)
  })

  it('tab-switch freezes identically to route-change — NO unmount, NO history (I3/I4/I9)', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r3', index: 3 })
    session.leaveExplore('tab-switch') // the My-Profile path
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('exact')
  })

  it('restores by id when the feed re-ordered (BT-07 / I5)', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('route-change')
    session.enterExplore()
    const r = session.restore(['r4', 'r0', 'r2', 'r1']) // r2 moved
    expect(r.outcome).toBe('exact')
    expect(r.resolvedIndex).toBe(2)
  })

  it('falls back to index, then top, and always reports (F1/I6)', () => {
    const { session, events } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'gone', index: 2 })
    session.leaveExplore('route-change')
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('fallback_index')

    const b = mk()
    b.session.enterExplore()
    b.session.reportActiveItem({ reviewId: 'gone', index: 99 })
    b.session.leaveExplore('route-change')
    b.session.enterExplore()
    expect(b.session.restore(FEED).outcome).toBe('fallback_top')
    expect(events.filter(e => e.name === 'explore_session.restore_result')).toHaveLength(1)
  })

  it('a plain visit with no snapshot does not restore (Bug #17 equivalent)', () => {
    const { session } = mk()
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('none')
  })
})

describe('NAV-004 — My-Profile regression (BT-02/BT-03, I9)', () => {
  it('tab switch → view post (route-change) → return restores the exact clip; the snapshot is the FEED state', () => {
    const { session } = mk()
    // On the feed tab, clip r2.
    session.enterExplore()
    session.setQueryShape({ tab: 'home' })
    session.reportActiveItem({ reviewId: 'r2', index: 2, scrollOffset: 1624 })
    // NAV-004's exact path: switch to My Profile (freeze at intent — no
    // unmount, no history entry)…
    const frozen = session.leaveExplore('tab-switch')
    session.setQueryShape({ tab: 'profile' }) // live tab moves on AFTER the freeze
    // …then leave /reviews from the profile tab (view own post). Idempotent:
    // the feed snapshot — not the profile view — is what survives (I7/F6).
    const again = session.leaveExplore('route-change')
    expect(again!.version).toBe(frozen!.version)
    expect(again!.trigger).toBe('tab-switch')
    expect(again!.state.tab).toBe('home')
    // Return: any re-entry restores (BT-03) — identical to the other-user
    // profile path (I9), with zero history input.
    session.enterExplore()
    const r = session.restore(FEED)
    expect(r.outcome).toBe('exact')
    expect(r.targetReviewId).toBe('r2')
    expect(r.resolvedIndex).toBe(2)
    expect(session.getState().tab).toBe('home')
  })

  it('tab change alone never invalidates the feed snapshot (view switch, not row filter)', () => {
    const { session, events } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r1', index: 1 })
    session.leaveExplore('tab-switch')
    session.setQueryShape({ tab: 'profile' })
    session.setQueryShape({ tab: 'inbox' })
    session.setQueryShape({ tab: 'home' })
    expect(events.filter(e => e.name === 'explore_session.invalidated')).toHaveLength(0)
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('exact')
  })
})

describe('contract guarantees (§3)', () => {
  it('freeze is idempotent — second leave returns same snapshot, version bumps once (F6/I7)', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r1', index: 1 })
    const s1 = session.leaveExplore('tab-switch')
    const s2 = session.leaveExplore('route-change')
    expect(s2!.version).toBe(s1!.version)
  })

  it('restore runs at most once per entry (I7)', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('route-change')
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('exact')
    expect(session.restore(FEED).outcome).toBe('none')
  })

  it('user input during RESTORING wins (F7 / BT-25)', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('route-change')
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r4', index: 4 }) // user swiped mid-restore
    expect(session.restore(FEED).outcome).toBe('aborted_user_input')
  })

  it('invalid inputs are no-ops, not errors', () => {
    const { session } = mk()
    session.enterExplore()
    expect(() => session.reportActiveItem({ reviewId: 'x', index: -1 })).not.toThrow()
    expect(session.getState().activeIndex).toBe(0)
  })

  it('getState returns a defensive copy (P5)', () => {
    const { session } = mk()
    const s = session.getState()
    s.activeIndex = 999
    expect(session.getState().activeIndex).toBe(0)
  })

  it('dispose makes everything a silent no-op', () => {
    const { session, events } = mk()
    session.dispose()
    session.enterExplore()
    session.leaveExplore('explicit')
    expect(session.restore(FEED).outcome).toBe('none')
    expect(events).toHaveLength(0)
  })
})

describe('invalidation (F3/F9/F10, BT-10/19/20)', () => {
  it('query-shape change invalidates a held snapshot', () => {
    const { session, events } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('route-change')
    session.setQueryShape({ feedType: 'latest' })
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('none')
    expect(events.some(e => e.name === 'explore_session.invalidated' && e.reason === 'filters-changed')).toBe(true)
  })

  it('tab change alone does NOT invalidate (view switch, not row filter)', () => {
    const { session } = mk()
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('tab-switch')
    session.setQueryShape({ tab: 'profile' })
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('exact')
  })

  it('stale snapshot invalidates on entry (F9)', () => {
    let t = 1_000_000
    const { session, events } = mk({ now: () => t, staleAfterMs: 30 * 60 * 1000 })
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('route-change')
    t += 31 * 60 * 1000
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('none')
    expect(events.some(e => e.name === 'explore_session.invalidated' && e.reason === 'stale')).toBe(true)
  })

  it('conflicting entry context invalidates (return into a different shape)', () => {
    const { session } = mk()
    session.enterExplore({ feedType: 'for-you' })
    session.reportActiveItem({ reviewId: 'r2', index: 2 })
    session.leaveExplore('route-change')
    session.enterExplore({ feedType: 'latest' })
    expect(session.restore(FEED).outcome).toBe('none')
  })
})

describe('durability + versioning (V1–V5, F4/F5, BT-14/21)', () => {
  it('mirrors to the store on freeze and hydrates on cold start (F5)', () => {
    const store = memStore()
    const a = mk({ store })
    a.session.enterExplore()
    a.session.reportActiveItem({ reviewId: 'r3', index: 3 })
    a.session.leaveExplore('route-change')
    // "new process": a fresh session over the same store
    const b = mk({ store })
    b.session.enterExplore()
    expect(b.session.restore(FEED).outcome).toBe('exact')
    expect(b.session.getState().activeReviewId).toBe('r3')
  })

  it('broken storage never throws and reports durability_unavailable (F4)', () => {
    const { session, events } = mk({ store: memStore(true) })
    session.enterExplore()
    session.reportActiveItem({ reviewId: 'r1', index: 1 })
    expect(() => session.leaveExplore('route-change')).not.toThrow()
    expect(events.some(e => e.name === 'explore_session.durability_unavailable')).toBe(true)
    // in-memory restore still works within the same session (BT-21)
    session.enterExplore()
    expect(session.restore(FEED).outcome).toBe('exact')
  })

  it('hydrate rejects a v1 envelope with missing/invalid frozenAt or sessionId (audit hardening)', () => {
    const state = { schemaVersion: 1, activeReviewId: 'r1', activeIndex: 1, scrollOffset: 0, feedType: 'for-you', sort: null, query: null, filters: {} }
    const { session } = mk()
    // No frozenAt → staleness would compare against NaN and never trigger.
    expect(session.hydrate(JSON.stringify({ schemaVersion: 1, sessionId: 's', version: 1, trigger: 'route-change', state }))).toBe(false)
    expect(session.hydrate(JSON.stringify({ schemaVersion: 1, sessionId: 's', version: 1, frozenAt: 'yesterday', trigger: 'route-change', state }))).toBe(false)
    expect(session.hydrate(JSON.stringify({ schemaVersion: 1, sessionId: '', version: 1, frozenAt: 1, trigger: 'route-change', state }))).toBe(false)
    expect(session.hydrate(JSON.stringify({ schemaVersion: 1, sessionId: 's', version: 1, frozenAt: 1, trigger: 'route-change', state }))).toBe(true)
  })

  it('hydrate rejects malformed payloads and missing schemaVersion (V1)', () => {
    const { session } = mk()
    expect(session.hydrate('{{{')).toBe(false)
    expect(session.hydrate(JSON.stringify({ foo: 1 }))).toBe(false)
    expect(session.hydrate(JSON.stringify({ sessionId: 'x', state: {} }))).toBe(false)
  })

  it('unsupported major version → invalidated, never a crash (V5)', () => {
    const { session, events } = mk()
    expect(session.hydrate(JSON.stringify({ schemaVersion: 2, state: { schemaVersion: 2 } }))).toBe(false)
    expect(events.some(e => e.name === 'explore_session.invalidated' && e.reason === 'schema-unsupported')).toBe(true)
  })

  it('unknown 1.x fields are preserved through hydrate → snapshot (V3) and JSON round-trip is lossless (I12)', () => {
    const { session } = mk()
    const snap = {
      schemaVersion: 1, sessionId: 's', version: 3, frozenAt: 123, trigger: 'route-change',
      futureField: 'kept',
      state: { schemaVersion: 1, activeReviewId: 'r1', activeIndex: 1, scrollOffset: 10, feedType: 'for-you', sort: null, query: null, filters: {}, futureStateField: 42 },
    }
    expect(session.hydrate(JSON.stringify(snap))).toBe(true)
    const out = session.snapshot() as unknown as Record<string, unknown>
    expect(out.futureField).toBe('kept')
    expect((out.state as Record<string, unknown>).futureStateField).toBe(42)
    expect(JSON.parse(JSON.stringify(out))).toEqual(out)
  })
})
