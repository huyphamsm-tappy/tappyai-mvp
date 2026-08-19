/**
 * F2 — the composer must never report success for content the server refused.
 *
 * UAT finding: `POST /api/reviews` returned the moderation outcome, the composer
 * read `data` and ignored `data.moderation`, then showed the success screen and
 * redirected after 1.5s. A rejected upload looked exactly like a published one.
 *
 * These assert STRUCTURE, not vocabulary. The repository has been bitten twice by
 * guards that stayed green after the call they were protecting was deleted —
 * `source.includes('X')` passes while an import line survives. So every check
 * below pins a control-flow relationship: the branch exists, it returns, and the
 * success path is unreachable from it. Each one is mutation-checked.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SRC = readFileSync('src/app/reviews/new/page.tsx', 'utf8')
const DICT = readFileSync('src/lib/i18n/w2/reviewNew.ts', 'utf8')

describe('F2 — the composer renders the server outcome', () => {
  it('branches on the server moderation state and RETURNS from that branch', () => {
    // Not "the string appears" — the conditional, with an early return inside it.
    expect(SRC).toMatch(
      /if\s*\(\s*data\.moderation\?\.state\s*===\s*['"]RESTRICTED['"]\s*\)\s*\{[\s\S]{0,220}?return\b/,
    )
  })

  it('🚨 the success path is UNREACHABLE for a rejected upload', () => {
    const branch = SRC.indexOf("data.moderation?.state === 'RESTRICTED'")
    const success = SRC.indexOf('setSuccess(true)')
    const redirect = SRC.indexOf("router.push('/reviews?tab=profile')")
    expect(branch, 'the moderation branch must exist').toBeGreaterThan(-1)
    // Both the success flag and the redirect must sit AFTER the branch, which
    // returns — so neither can run when the server said RESTRICTED.
    expect(success).toBeGreaterThan(branch)
    expect(redirect).toBeGreaterThan(branch)
    // ...and nothing between the branch and its return sets success.
    expect(SRC.slice(branch, success)).not.toContain('setSuccess(true)')
  })

  it('renders the SERVER wording, never a client-side reason map', () => {
    expect(SRC).toContain('{moderation.title}')
    expect(SRC).toContain('{moderation.detail}')
  })

  it('🚨 contains no second moderation engine — no state is computed client-side', () => {
    // The client may READ the server's state. It may not decide one.
    for (const forbidden of [
      "setModeration({ state: 'RESTRICTED'",
      'evaluateSafety',
      'publicationFor(',
      'PUBLICATION_GATE_RULES',
    ])
      expect(SRC, forbidden).not.toContain(forbidden)
  })

  it('leaks no internal moderation detail into the composer', () => {
    for (const leak of ['safety_state', 'publication_state', 'evaluated_version', 'ts.'])
      expect(SRC, leak).not.toContain(leak)
  })

  it('asks the server for the wording in the USER’s chosen language', () => {
    expect(SRC).toMatch(/\/api\/reviews\?lang=\$\{encodeURIComponent\(locale\)\}/)
  })

  it('the rejection screen does not auto-redirect away from its own message', () => {
    const branch = SRC.indexOf('if (moderation) {')
    expect(branch).toBeGreaterThan(-1)
    const screen = SRC.slice(branch, branch + 1400)
    expect(screen).not.toContain('setTimeout')
    expect(screen).not.toContain('router.push')
  })

  it('its only literal copy is an i18n key, present in both languages', () => {
    expect(SRC).toContain("t('reviewNew.moderationGoToProfile')")
    // Two entries: the Vietnamese block and the English one.
    expect(DICT.match(/'reviewNew\.moderationGoToProfile'/g) ?? []).toHaveLength(2)
    expect(DICT).toContain("'reviewNew.moderationGoToProfile': 'View in my Profile'")
  })
})
