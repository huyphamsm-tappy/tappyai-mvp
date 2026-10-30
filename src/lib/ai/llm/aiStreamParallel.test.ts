// N2 (30/10): AI.stream forwards a request for several tool calls in one step (providerOptions.tappy.parallelTools) the way AI.step
// already does - only when the call carries tools (the API rejects parallel_tool_calls on a request with none). Without the option the
// call is byte-for-byte what it was. streamText and the registry are mocked (no model).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const S = vi.hoisted(() => ({ args: [] as Array<Record<string, any>> }))
vi.mock('ai', async orig => ({ ...(await orig<typeof import('ai')>()), streamText: vi.fn((a: Record<string, any>) => { S.args.push(a); return {} }) }))
vi.mock('./registry', async orig => ({ ...(await orig<typeof import('./registry')>()), modelForRole: () => ({ modelId: 'mock' }) as never, getProvider: () => ({ id: 'mock', isConfigured: () => true }) as never }))

import { AI } from './ai'

const TOOLS = { web_search: { description: 'w', parameters: { type: 'object' } } } as never
beforeEach(() => { S.args.length = 0 })

describe('AI.stream · several tool calls in one step', () => {
  it('no parallelTools → no providerOptions (unchanged)', () => {
    AI.stream({ system: 's', prompt: 'p', tools: TOOLS, maxSteps: 8 })
    expect(S.args[0]).not.toHaveProperty('providerOptions')
  })
  it('tools + parallelTools → tappy.parallelTools', () => {
    AI.stream({ system: 's', prompt: 'p', tools: TOOLS, maxSteps: 8, parallelTools: true })
    expect(S.args[0].providerOptions).toEqual({ tappy: { parallelTools: true } })
  })
  it('parallelTools with no tools is never sent (the API rejects it)', () => {
    AI.stream({ system: 's', prompt: 'p', parallelTools: true })
    expect(S.args[0]).not.toHaveProperty('providerOptions')
  })
})
