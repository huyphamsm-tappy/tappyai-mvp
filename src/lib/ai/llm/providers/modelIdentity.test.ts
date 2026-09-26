import { describe, it, expect } from 'vitest'
import { CLAUDE_DEFAULT_MODELS } from './claude'
import type { ModelRole } from '../types'

// ── P1-4: model identity ─────────────────────────────────────────────────────
//
// WHY THIS FILE LIVES IN providers/
// It has to spell out concrete model ids to assert anything useful, and
// `no-hardcoded-model-ids` (scripts/architecture/check.mjs) allows those ONLY
// under src/lib/ai/llm/providers/. That rule is not weakened for this test:
// the test belongs to the adapter it describes, so it sits inside the zone
// rather than asking for an exemption.
//
// TWO PROPERTIES, failing for different reasons:
//
//   PINNED    every default model id names a dated snapshot. A floating alias
//             lets the vendor change what serves production with no diff on our
//             side, so "which model answered that request" stops being
//             answerable from the repository.
//
//   COHERENT  roles resolving to the SAME model use the SAME identifier string.
//             This is the one that was broken: `fast` carried
//             'claude-haiku-4-5' while `smart` carried
//             'claude-haiku-4-5-20251001'. Anthropic keys a prompt cache per
//             model id, so the two roles could not share a cached prefix even
//             though buildSystem() hands both the byte-identical ~11k-token
//             `shared` segment. route.ts picks `fast` for a short FIRST message
//             (isSimpleQuery), which is the most common opening turn there is —
//             so a typical conversation's first real question paid a cache
//             WRITE at 1.25x on a lineage the SECOND turn could never read.
//
// Asserted against the SHIPPED table (imported, never retyped): a copy of the
// mapping inside the test would let the two drift apart and still pass.

const ROLES: readonly ModelRole[] = ['fast', 'smart', 'planning', 'vision']

/**
 * A dated Anthropic snapshot: `<family>-<YYYYMMDD>`.
 *
 * Anchored at BOTH ends deliberately. Without `$` an alias would match through
 * a partial scan; without `^` a prefix could be smuggled in. Eight digits is
 * exactly what separates a snapshot from every alias Anthropic publishes
 * ('claude-haiku-4-5', 'claude-haiku-4-5-latest').
 */
const DATED_SNAPSHOT = /^[a-z0-9.-]+-\d{8}$/

describe('P1-4 · every role resolves to a PINNED model snapshot', () => {
  it.each(ROLES)('%s is a dated snapshot, not a floating alias', (role) => {
    expect(CLAUDE_DEFAULT_MODELS[role]).toMatch(DATED_SNAPSHOT)
  })

  it('the table covers every role — a new role cannot arrive unpinned', () => {
    expect(Object.keys(CLAUDE_DEFAULT_MODELS).sort()).toEqual([...ROLES].sort())
  })

  // The regex IS the guard here, so prove it rejects the exact string this task
  // removed. A pattern that matched everything would leave every assertion
  // above green while enforcing nothing.
  it('the pattern rejects the aliases this fix removed', () => {
    expect('claude-haiku-4-5').not.toMatch(DATED_SNAPSHOT)
    expect('claude-haiku-4-5-latest').not.toMatch(DATED_SNAPSHOT)
    expect('claude-haiku-4-5-2025100').not.toMatch(DATED_SNAPSHOT)   // 7 digits
    expect('claude-haiku-4-5-202510012').not.toMatch(DATED_SNAPSHOT) // 9 digits
    expect('claude-haiku-4-5-20251001').toMatch(DATED_SNAPSHOT)
  })
})

describe('P1-4 · roles that share a model share a prompt-cache lineage', () => {
  it('fast and smart resolve to the SAME identifier string', () => {
    // Not "the same family", not "both pinned" — the same STRING, because that
    // is what the provider keys the cache on. This is the assertion that fails
    // if the alias ever comes back.
    expect(CLAUDE_DEFAULT_MODELS.fast).toBe(CLAUDE_DEFAULT_MODELS.smart)
  })

  it('all four roles currently resolve to one model, so all four share one lineage', () => {
    expect(new Set(ROLES.map(r => CLAUDE_DEFAULT_MODELS[r])).size).toBe(1)
  })
})

describe('P1-4 · the pin did not change model capability', () => {
  // The fix is allowed to change an IDENTIFIER. It is not allowed to move
  // production onto a different model family or tier — that would be a
  // behaviour change smuggled in under a caching fix.
  it('every role still resolves to the Haiku 4.5 family', () => {
    for (const role of ROLES) {
      expect(CLAUDE_DEFAULT_MODELS[role]).toMatch(/^claude-haiku-4-5-/)
    }
  })
})
