// review 02/11: a Deep Research answer whose reader went away (the page closed, the connection dropped) stops the run and gives it back.
import { describe, it, expect, vi } from 'vitest'
import { deepResearchResponse, type DeepResearchTurn } from './deepResearchResponse'
import type { DeepResearchDeps } from './deepResearch'

const PLAN = { title: 'T', steps: [{ title: 'A', queries: ['a'] }] }

function turn(stop: AbortController, over: Partial<DeepResearchDeps> = {}) {
  const onFailed = vi.fn(async () => undefined)
  let gathering!: () => void
  const started = new Promise<void>(r => { gathering = r })
  const deps: DeepResearchDeps = {
    plan: async () => PLAN,
    // the search waits until the run is stopped (as a real request aborted by the deps' signal does)
    gather: async () => { gathering(); await new Promise(r => stop.signal.addEventListener('abort', r, { once: true })); throw new Error('aborted') },
    notes: async () => [],
    write: async function* () { yield 'x' },
    ...over,
  }
  const t: DeepResearchTurn = { question: 'q', context: '', lang: 'vi', deps, cost: { usd: 0, calls: 0 }, serperUsd: () => ({ usd: 0, calls: 0 }), onFailed, stop }
  return { t, onFailed, started }
}

describe('deepResearchResponse - the person left', () => {
  it('the body is cancelled (page closed): the run is stopped and given back as client_gone', async () => {
    const stop = new AbortController()
    const { t, onFailed, started } = turn(stop)
    const res = deepResearchResponse(t)
    const reader = res.body!.getReader()
    await reader.read()
    await started
    await reader.cancel()
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalledWith('client_gone'))
    expect(stop.signal.aborted).toBe(true)
  })
  it('the request is aborted (the route links the request signal to `stop`): same outcome', async () => {
    const stop = new AbortController()
    const { t, onFailed, started } = turn(stop)
    const res = deepResearchResponse(t)
    const reader = res.body!.getReader()
    await reader.read()
    await started
    stop.abort()
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalledWith('client_gone'))
  })
})
