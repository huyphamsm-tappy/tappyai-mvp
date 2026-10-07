import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPlacesBudget, PLACES_BUDGET_DEFAULT, PLACES_BUDGET_PLANNING } from './placesBudget'
import { withSingleFlight, inFlightCount, getCache, setCache } from './common'

/**
 * The quota-protection layer, exercised without spending a single Google call.
 *
 * Every upstream call here is a stub. That is deliberate and required: the project's SearchText
 * quota is 100 a day, and proving cache/dedup/budget behaviour against the real provider would
 * spend the very resource this layer exists to protect.
 */

describe('retrieval budget — one consultation, one strong retrieval', () => {
  it('a normal turn gets exactly one Google-backed intent', () => {
    const b = createPlacesBudget(PLACES_BUDGET_DEFAULT)
    expect(b.claim('restaurant', 'Quận 1')).toEqual({ allowed: true })
    expect(b.claim('restaurant', 'Quận 3')).toEqual({ allowed: false, reason: 'budget_exhausted' })
    expect(b.used).toBe(1)
  })

  it('the seven-call food consultation is stopped after the first retrieval', () => {
    // The measured failure: seven search_places calls in one turn, each reworded.
    const b = createPlacesBudget(PLACES_BUDGET_DEFAULT)
    const queries = [
      ['restaurant', 'TP HCM'], ['restaurant', 'TP HCM'], ['restaurant', 'TP HCM'],
      ['restaurant', 'TP HCM'], ['restaurant', 'TP HCM'], ['restaurant', 'TP HCM'],
      ['restaurant', 'TP HCM'],
    ] as const
    const allowed = queries.filter(([t, l]) => b.claim(t, l).allowed).length
    expect(allowed).toBe(1)
  })

  it('a reworded question is the same intent and is not searched twice', () => {
    const b = createPlacesBudget(PLACES_BUDGET_PLANNING)
    expect(b.claim('restaurant', 'Đà Lạt').allowed).toBe(true)
    // Same type and location, different words upstream — nothing new to fetch.
    expect(b.claim('restaurant', 'da lat')).toEqual({ allowed: false, reason: 'intent_already_retrieved' })
    expect(b.claim('restaurant', ' ĐÀ  LẠT ')).toEqual({ allowed: false, reason: 'intent_already_retrieved' })
    expect(b.used).toBe(1)
  })

  it('a planning turn may ask its genuinely different questions', () => {
    // eat / see / stay are three answers, none substituting for another.
    const b = createPlacesBudget(PLACES_BUDGET_PLANNING)
    expect(b.claim('restaurant', 'Đà Lạt').allowed).toBe(true)
    expect(b.claim('attraction', 'Đà Lạt').allowed).toBe(true)
    expect(b.claim('hotel', 'Đà Lạt').allowed).toBe(true)
    expect(b.claim('cafe', 'Đà Lạt')).toEqual({ allowed: false, reason: 'budget_exhausted' })
    expect(b.used).toBe(PLACES_BUDGET_PLANNING)
  })

  it('a different location is a different intent', () => {
    const b = createPlacesBudget(PLACES_BUDGET_PLANNING)
    expect(b.claim('restaurant', 'Hà Nội').allowed).toBe(true)
    expect(b.claim('restaurant', 'TP HCM').allowed).toBe(true)
  })

  it('a factual follow-up that names no new intent retrieves nothing new', () => {
    const b = createPlacesBudget(PLACES_BUDGET_DEFAULT)
    b.claim('restaurant', 'Quận 1')
    // The follow-up ("what are its opening hours?") re-asks the same intent.
    expect(b.claim('restaurant', 'Quận 1').allowed).toBe(false)
  })

  it('budgets are per-turn and never shared', () => {
    const a = createPlacesBudget(PLACES_BUDGET_DEFAULT)
    const b = createPlacesBudget(PLACES_BUDGET_DEFAULT)
    expect(a.claim('restaurant', 'Quận 1').allowed).toBe(true)
    expect(b.claim('restaurant', 'Quận 1').allowed).toBe(true)
  })
})

describe('single-flight — concurrent identical questions cost one upstream call', () => {
  it('two concurrent callers on one key share a single upstream request', async () => {
    let calls = 0
    const upstream = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { ok: true } }
    const [a, b] = await Promise.all([
      withSingleFlight('places:bun bo:q1', upstream),
      withSingleFlight('places:bun bo:q1', upstream),
    ])
    expect(calls).toBe(1)
    expect(a).toEqual(b)
  })

  it('different keys are independent', async () => {
    let calls = 0
    const upstream = async () => { calls++; return { ok: true } }
    await Promise.all([
      withSingleFlight('places:bun bo:q1', upstream),
      withSingleFlight('places:sushi:q1', upstream),
    ])
    expect(calls).toBe(2)
  })

  it('a failure does not poison the key for later callers', async () => {
    await expect(withSingleFlight('places:boom', async () => { throw new Error('429') })).rejects.toThrow('429')
    expect(inFlightCount()).toBe(0)
    // The next caller gets a real attempt, not the cached rejection.
    await expect(withSingleFlight('places:boom', async () => 'recovered')).resolves.toBe('recovered')
  })

  it('the map is emptied once a call settles', async () => {
    await withSingleFlight('places:settled', async () => 'x')
    expect(inFlightCount()).toBe(0)
  })
})

describe('cache policy — only a Google answer is worth keeping', () => {
  const KEY = 'places:test:policy'
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('a stored answer is returned until its TTL expires, then refetched', () => {
    setCache(KEY, { source: 'Google Maps', results: [{ name: 'Quán A' }] }, 30 * 60 * 1000)
    expect(getCache(KEY)).not.toBeNull()
    vi.advanceTimersByTime(31 * 60 * 1000)
    // Expired → the next caller must be free to ask Google again.
    expect(getCache(KEY)).toBeNull()
  })

  it('nothing was ever stored for a key that was never written', () => {
    expect(getCache('places:never:written')).toBeNull()
  })
})
