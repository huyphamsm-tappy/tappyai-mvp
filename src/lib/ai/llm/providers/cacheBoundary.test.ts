import { describe, it, expect } from 'vitest'
import type { CoreMessage } from 'ai'
import { createClaudeProvider } from './claude'

// ── P2 · the cache breakpoint lands where the cost model assumes ─────────────
//
// WHY THIS FILE LIVES IN providers/
// It has to name Anthropic's own cache option to assert anything, and
// `no-vendor-cache-logic` (scripts/architecture/check.mjs) allows that ONLY
// under src/lib/ai/llm/providers/. Same reasoning as modelIdentity.test.ts: the
// test belongs to the adapter it describes, so it sits inside the zone instead
// of asking for an exemption.
//
// WHAT IT PROTECTS. The whole prompt-cache design rests on ONE placement rule:
// the marker goes on the FIRST system segment, so the cached prefix ends before
// anything request-shaped. Put it on the last segment instead and the cached
// prefix swallows the clock, the memory block and the need brief — at which
// point every request is a cache MISS that also pays a 1.25x write, which is
// strictly worse than not caching at all.
//
// The comment in claude.ts already says this. A comment is not a test: the two
// placements differ by one boolean and produce identical types, identical
// output shapes and identical passing suites everywhere else.

const provider = () => createClaudeProvider({})

/** True when this message carries a cache breakpoint. Read structurally — the
 *  test asserts WHERE a marker is, never reconstructs the vendor literal. */
const marked = (m: CoreMessage): boolean => {
  const opts = (m as { providerOptions?: Record<string, unknown> }).providerOptions
  return !!opts && Object.keys(opts).length > 0
}

const SHARED: CoreMessage = { role: 'system', content: 'RULEBOOK — byte-identical for everyone' }
const DYNAMIC: CoreMessage = { role: 'system', content: 'clock + memory + need brief' }
const USER: CoreMessage = { role: 'user', content: 'quán phở nào ngon ở Quận 1?' }

describe('P2 · the breakpoint is on the STABLE segment, never the request-shaped one', () => {
  it('marks the first system message', () => {
    const out = provider().decorateMessages!([SHARED, DYNAMIC, USER])
    expect(marked(out[0])).toBe(true)
  })

  it('🔑 does NOT mark the second system message — that would cache the clock', () => {
    const out = provider().decorateMessages!([SHARED, DYNAMIC, USER])
    expect(marked(out[1])).toBe(false)
  })

  it('marks exactly one message, whatever the shape', () => {
    for (const msgs of [
      [SHARED, DYNAMIC, USER],
      [SHARED, USER],
      [SHARED, DYNAMIC, USER, { role: 'assistant', content: 'x' } as CoreMessage, USER],
    ]) {
      expect(provider().decorateMessages!(msgs).filter(marked)).toHaveLength(1)
    }
  })

  it('never marks a user or assistant message', () => {
    const out = provider().decorateMessages!([SHARED, DYNAMIC, USER])
    expect(marked(out[2])).toBe(false)
  })

  it('marks nothing when there is no system segment at all', () => {
    expect(provider().decorateMessages!([USER]).filter(marked)).toHaveLength(0)
  })

  it('changes nothing else about the messages', () => {
    const input = [SHARED, DYNAMIC, USER]
    const out = provider().decorateMessages!(input)
    expect(out.map(m => ({ role: m.role, content: m.content })))
      .toEqual(input.map(m => ({ role: m.role, content: m.content })))
  })
})
