import { describe, it, expect, vi } from 'vitest'

// Cost optimization (2026-09-18): two prompt-cache breakpoints — the FIRST system message (the
// static rulebook) and the LAST user message (so the second step of a tool turn reads the
// request-shaped prefix from cache instead of re-paying it). Nothing else is marked.

vi.stubEnv('ANTHROPIC_API_KEY', 'test')
const { createClaudeProvider } = await import('./claude')

const mark = { anthropic: { cacheControl: { type: 'ephemeral' } } }

describe('claude provider — cache breakpoints', () => {
  const p = createClaudeProvider({})
  it('marks the first system message and the last user message only', () => {
    const out = p.decorateMessages!([
      { role: 'system', content: 'shared' },
      { role: 'system', content: 'dynamic' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ])
    expect(out[0].providerOptions).toEqual(mark)
    expect(out[1].providerOptions).toBeUndefined()
    expect(out[2].providerOptions).toBeUndefined()
    expect(out[3].providerOptions).toBeUndefined()
    expect(out[4].providerOptions).toEqual(mark)
  })
  it('with no user message only the system breakpoint exists', () => {
    const out = p.decorateMessages!([{ role: 'system', content: 's' }])
    expect(out[0].providerOptions).toEqual(mark)
  })
})
