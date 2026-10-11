// @vitest-environment node
// Phase 8 M1 — a cancelled agent tool invocation stops spending Serper: no new request is sent once its signal is aborted, and the
// in-flight fetch receives the signal. Outside a Phase 8 tool scope nothing changes.
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/security/kvCounter', () => ({ incrDailyCounter: async () => ({ count: 1, scope: 'shared' }) }))

import { serperPost } from './serperClient'
import { withSerperToolScope, withSerperTurnBudget, currentSerperSignal } from './serperToolBudget'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Serper cancellation (TAPPY_AGENT=2 tool scope)', () => {
  it('an aborted scope sends nothing and returns null (no credit spent)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const ctrl = new AbortController()
    ctrl.abort()
    const r = await withSerperTurnBudget(12, () => withSerperToolScope(8, ctrl.signal, () => serperPost('search', 'k', { q: 'x' }, 1000)))
    expect(r.value.value).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(r.spent).toBe(0)
  })

  it('the in-flight fetch carries the scope signal', async () => {
    let got: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { got = init.signal ?? undefined; return new Response('{"organic":[]}', { status: 200 }) }))
    const ctrl = new AbortController()
    await withSerperToolScope(8, ctrl.signal, () => serperPost('search', 'k', { q: 'x' }, 1000))
    expect(got).toBe(ctrl.signal)
  })

  it('outside a Phase 8 scope there is no signal (legacy and TAPPY_AGENT=1 unchanged)', async () => {
    let init: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_u: string, i: RequestInit) => { init = i; return new Response('{}', { status: 200 }) }))
    expect(currentSerperSignal()).toBeUndefined()
    await serperPost('search', 'k', { q: 'x' }, 1000)
    expect(init && 'signal' in init).toBe(false)
  })
})
