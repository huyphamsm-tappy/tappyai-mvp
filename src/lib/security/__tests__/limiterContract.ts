// A reusable CONTRACT for a route that is guarded by the shared limiter (`publicRateLimit`). NOT a test file: call `describeSharedLimiterContract` from a route test that
// has already declared its own `vi.mock`s (auth, providers). "Admitted" means "anything but 429": what a passing request does next is the route's own business and is
// stubbed to be cheap; what the contract pins is who is counted, how many, for how long, across instances, and what happens when the store is down.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindFreshGraph, configureNoStore, configureSharedStore, resetLimiterEnv } from './sharedLimiterHarness'

export interface SharedLimiterContract {
  /** Shown in the describe title. */
  label: string
  /** Requests admitted per window, per caller. */
  limit: number
  windowMs: number
  /** Imports the route handler with whatever module state the test needs; called AFTER `vi.resetModules()` + `bindFreshGraph()`. */
  loadRoute: () => Promise<(req: Request) => Promise<Response>>
  /** Makes the next request come from this caller (a user id, or an IP for anonymous routes). */
  actAs: (caller: string) => void
  /** Builds a request; the body may be invalid on purpose so an admitted request stops cheaply. */
  request: () => Request
  /** Counters the route's stubs expose, reset before each test: a refused request must leave them untouched. */
  sideEffects: () => number
  resetSideEffects: () => void
  /** The caller a test starts as. */
  defaultCaller?: string
}

const refused = (r: Response) => r.status === 429
const admittedBy = (r: Response) => r.status !== 429

export function describeSharedLimiterContract(c: SharedLimiterContract): void {
  const caller = c.defaultCaller ?? 'caller-1'
  async function fresh() {
    vi.resetModules() // a new module graph = a new lambda: its in-process counters start empty
    await bindFreshGraph()
    return c.loadRoute()
  }
  const call = (post: (req: Request) => Promise<Response>) => post(c.request())

  describe(`${c.label} — shared limiter contract (${c.limit} per ${c.windowMs / 1000} s)`, () => {
    beforeEach(() => { c.actAs(caller); c.resetSideEffects(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T03:00:00Z')) })
    afterEach(() => { vi.useRealTimers(); resetLimiterEnv() })

    it('admits exactly the limit per caller, then answers 429 rate_limit before the route does any work', async () => {
      configureSharedStore()
      const post = await fresh()
      for (let i = 0; i < c.limit; i++) expect(admittedBy(await call(post)), `request ${i + 1}`).toBe(true)
      c.resetSideEffects()
      const res = await call(post)
      expect(refused(res)).toBe(true)
      expect((await res.json()).error).toBe('rate_limit')
      expect(c.sideEffects()).toBe(0)
    })

    it('keying: a different caller has their own bucket', async () => {
      configureSharedStore()
      const post = await fresh()
      for (let i = 0; i < c.limit; i++) await call(post)
      expect(refused(await call(post))).toBe(true)
      c.actAs('caller-2')
      expect(admittedBy(await call(post))).toBe(true)
    })

    it('shared across instances: the budget is spent on two lambdas together (an in-process counter would admit twice the limit)', async () => {
      const store = configureSharedStore()
      const a = await fresh()
      const b = await fresh()
      const half = Math.ceil(c.limit / 2)
      for (let i = 0; i < half; i++) expect(admittedBy(await call(a))).toBe(true)
      for (let i = half; i < c.limit; i++) expect(admittedBy(await call(b))).toBe(true)
      expect(refused(await call(b))).toBe(true)
      expect(refused(await call(a))).toBe(true)
      expect(store.calls()).toBe(c.limit + 2)
    })

    it('the window is the promised length: still refused at half of it, admitted again after it', async () => {
      configureSharedStore()
      const post = await fresh()
      for (let i = 0; i < c.limit; i++) await call(post)
      expect(refused(await call(post))).toBe(true)
      vi.setSystemTime(Date.now() + Math.floor(c.windowMs / 2))
      expect(refused(await call(post))).toBe(true)
      vi.setSystemTime(Date.now() + Math.floor(c.windowMs / 2) + 1_000)
      expect(admittedBy(await call(post))).toBe(true)
    })

    it('store configured but not answering → FAIL CLOSED (429, no side effect); recovers when the store answers again', async () => {
      const store = configureSharedStore()
      const post = await fresh()
      store.failNext('throw')
      c.resetSideEffects()
      expect(refused(await call(post))).toBe(true)
      expect(c.sideEffects()).toBe(0)
      store.failNext('malformed')
      expect(refused(await call(post))).toBe(true)
      store.failNext(null)
      expect(admittedBy(await call(post))).toBe(true)
    })

    it('no store configured → the in-process limiter with the same limit (per instance — the weakness the shared store removes)', async () => {
      configureNoStore()
      const post = await fresh()
      for (let i = 0; i < c.limit; i++) expect(admittedBy(await call(post))).toBe(true)
      expect(refused(await call(post))).toBe(true)
      const other = await fresh()
      expect(admittedBy(await call(other))).toBe(true)
    })
  })
}
