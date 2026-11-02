/**
 * Round 3J · characterization (SPEC of current behaviour, not a wanted behaviour): which AsyncLocalStorage budget scope does a Serper request
 * see when it is SENT? Mock only; production code unchanged. The probe is the real turnCreditsRemaining()/turnCreditsSpent() read inside the
 * fetch stub (the call that serperPost makes to fetch). Outside a scope the probe returns null; inside, the scope limit (remaining + spent).
 * The fetch stub never reaches the network; every other URL throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serperPost } from './serperClient'
import { serperSearch } from './common'
import { withSerperTurnBudget, turnCreditsRemaining, turnCreditsSpent } from './serperToolBudget'

// The request is identified by its query (the body), not by a tag set by the test, because the query is what the test asserts on.
const seen: Array<{ q: string; scopeLimit: number | null }> = []
const probe = (): number | null => {
  const remaining = turnCreditsRemaining()
  if (!Number.isFinite(remaining)) return null
  return remaining + turnCreditsSpent()
}
const sentFor = (q: string) => seen.filter(s => s.q === q)

beforeEach(() => {
  seen.length = 0
  // serperSearch reads SERPER_API_KEY from the environment (no key = no request at all, observed).
  vi.stubEnv('SERPER_API_KEY', 'test-key-not-real')
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      let q = ''
      try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
      seen.push({ q, scopeLimit: probe() })
      await new Promise(r => setTimeout(r, 5))
      return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com/a', snippet: 's' }], credits: 1 }), { status: 200 })
    }
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('characterization: the scope a Serper request sees when it is sent (observed, mock; not a budget proof)', () => {
  it('control: a request sent with no scope around it sees NO scope (the probe discriminates)', async () => {
    await serperPost('search', 'k', { q: 'control query' }, 2000)
    expect(sentFor('control query')).toEqual([{ q: 'control query', scopeLimit: null }])
  })

  it('direct: a request sent inside withSerperTurnBudget sees that scope limit', async () => {
    await withSerperTurnBudget(4444, () => serperPost('search', 'k', { q: 'direct query' }, 2000))
    expect(sentFor('direct query')).toEqual([{ q: 'direct query', scopeLimit: 4444 }])
  })

  it('concurrency: two turns with different scopes run together; each request sees its own scope (no mixing)', async () => {
    const a = withSerperTurnBudget(1000, () => serperPost('search', 'k', { q: 'A one' }, 2000).then(() => serperPost('search', 'k', { q: 'A two' }, 2000)))
    const b = withSerperTurnBudget(2000, () => serperPost('search', 'k', { q: 'B one' }, 2000).then(() => serperPost('search', 'k', { q: 'B two' }, 2000)))
    await Promise.all([a, b])
    expect(sentFor('A one').map(s => s.scopeLimit)).toEqual([1000])
    expect(sentFor('A two').map(s => s.scopeLimit)).toEqual([1000])
    expect(sentFor('B one').map(s => s.scopeLimit)).toEqual([2000])
    expect(sentFor('B two').map(s => s.scopeLimit)).toEqual([2000])
  })

  it('two concurrent identical queries (observed): one request reaches fetch, recorded with scope limit 5000', async () => {
    const leader = withSerperTurnBudget(5000, () => serperSearch('same single flight query'))
    const follower = withSerperTurnBudget(6000, () => serperSearch('same single flight query'))
    await Promise.all([leader, follower])
    const sent = sentFor('same single flight query')
    process.stdout.write('PROBE_SF ' + JSON.stringify(sent) + '\n')
    // Recorded as observed. The follower's budget allocation is NOT asserted: the future counter's allocation rule is not decided.
    expect(sent.length).toBe(1)
    expect(sent[0].scopeLimit).toBe(5000)
  })

  it('timeout race: a request whose fetch outlives its timeout still had the scope when fetch was called', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      let q = ''
      try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
      seen.push({ q, scopeLimit: probe() })
      await new Promise(r => setTimeout(r, 60))
      return new Response('{}', { status: 200 })
    }))
    let outcome = 'none'
    let sawScope: number | null = null
    await withSerperTurnBudget(7000, async () => {
      sawScope = probe()
      try { await serperPost('search', 'k', { q: 'slow query' }, 5); outcome = 'response' } catch (e) { outcome = 'threw:' + (e instanceof Error ? e.message : 'x') }
    })
    process.stdout.write('PROBE_TIMEOUT ' + JSON.stringify({ sawScopeAtCall: sawScope, outcome, sent: sentFor('slow query') }) + '\n')
    expect(sentFor('slow query').map(s => s.scopeLimit)).toEqual([7000])
    // Observed: serperPost rejects with a timeout (it does not return null). Whether the credits are refunded is NOT asserted here.
    expect(outcome).toBe('threw:timeout')
  })
})
