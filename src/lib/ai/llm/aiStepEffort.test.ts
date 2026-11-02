// C2 Phase 2/3 — AI.step forwards a per-step reasoning effort (C2_TOOL_ROUND_EFFORT) to the provider as providerOptions.tappy.effort, next to
// the existing parallelTools request; without it the call is byte-for-byte what it was. generateText and the registry are mocked (no model).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const G = vi.hoisted(() => ({ args: [] as Array<Record<string, any>> }))
vi.mock('ai', async orig => ({ ...(await orig<typeof import('ai')>()), generateText: vi.fn(async (a: Record<string, any>) => { G.args.push(a); return { text: 'ok' } }) }))
vi.mock('./registry', async orig => ({ ...(await orig<typeof import('./registry')>()), modelForRole: () => ({ modelId: 'mock' }) as never, getProvider: () => ({ id: 'mock', isConfigured: () => true }) as never }))

import { AI } from './ai'

const TOOLS = { web_search: { description: 'w', parameters: { type: 'object' } } } as never
beforeEach(() => { G.args.length = 0 })

describe('AI.step · per-step effort', () => {
  it('no effort, no tools → no providerOptions at all (unchanged)', async () => {
    await AI.step({ system: 's', prompt: 'p' })
    expect(G.args[0]).not.toHaveProperty('providerOptions')
  })
  it('tools + parallelTools, no effort → only parallelTools (unchanged)', async () => {
    await AI.step({ system: 's', prompt: 'p', tools: TOOLS, parallelTools: true })
    expect(G.args[0].providerOptions).toEqual({ tappy: { parallelTools: true } })
  })
  it('an effort travels as tappy.effort, with or without tools', async () => {
    await AI.step({ system: 's', prompt: 'p', effort: 'low' })
    await AI.step({ system: 's', prompt: 'p', tools: TOOLS, parallelTools: true, effort: 'medium' })
    expect(G.args[0].providerOptions).toEqual({ tappy: { effort: 'low' } })
    expect(G.args[1].providerOptions).toEqual({ tappy: { parallelTools: true, effort: 'medium' } })
  })
  it('parallelTools without tools is still never sent (the API rejects it)', async () => {
    await AI.step({ system: 's', prompt: 'p', parallelTools: true, effort: 'high' })
    expect(G.args[0].providerOptions).toEqual({ tappy: { effort: 'high' } })
  })
})
