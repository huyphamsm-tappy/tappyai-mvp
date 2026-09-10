// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * P4-05 — the structured blocks are wired into the REAL chat, not only unit-tested in isolation.
 *
 * `ChatInterface` is a 1700-line client component wired to `useChat`, the router, speech
 * recognition and the app's translation store; mounting it in jsdom to assert one card would test
 * the mocks more than the product. So this file pins the WIRING — that the production render path
 * actually reaches these components, and that it reaches them under the approved conditions.
 *
 * The behaviour of each block is covered by its own suite:
 *   ComparisonBlock.test.tsx · ConfirmationPrompt.test.tsx · comparisonFromSynthesis.test.ts
 *
 * This is deliberately a source-level contract. It is worth having because the failure it guards
 * against is precisely the one the previous Phase 4B report had to admit: a component that exists,
 * is tested, and is rendered by nothing.
 */
const SOURCE = readFileSync(resolve(process.cwd(), 'src/components/ChatInterface.tsx'), 'utf8')

describe('ComparisonBlock is reachable from a real assistant reply', () => {
  it('is imported and rendered by ChatInterface', () => {
    expect(SOURCE).toContain("import ComparisonBlock from '@/components/chat/structured/ComparisonBlock'")
    expect(SOURCE).toContain('<ComparisonBlock')
  })

  it('is fed from the shopping decision the reply already carried, not a new request', () => {
    expect(SOURCE).toContain('comparisonFromSynthesis(shopView, t, locale)')
    // No second fetch was introduced to render a comparison.
    const renderRegion = SOURCE.slice(SOURCE.indexOf('<ComparisonBlock') - 900, SOURCE.indexOf('<ComparisonBlock'))
    expect(renderRegion).not.toContain('fetch(')
  })

  it('is withheld while the reply is still streaming', () => {
    // Structured blocks never appear partially decoded (UX spec §2.3).
    const guard = SOURCE.slice(
      SOURCE.indexOf('{shopView && !(isLoading && isLastMessage)'),
      SOURCE.indexOf('<ComparisonBlock'),
    )
    expect(guard.length, 'the comparison must sit behind the not-streaming guard').toBeGreaterThan(0)
  })
})

describe('ConfirmationPrompt guards the one action Tappy takes for the user', () => {
  it('is imported and rendered by ChatInterface', () => {
    expect(SOURCE).toContain("import ConfirmationPrompt from '@/components/chat/structured/ConfirmationPrompt'")
    expect(SOURCE).toContain('<ConfirmationPrompt')
  })

  it('intercepts internal_booking instead of navigating straight away', () => {
    // The click handler must set the pending action, not push the route.
    // Anchored on logCTAClick — the CTA handler specifically, not the first onClick in the file.
    const start = SOURCE.indexOf('logCTAClick(btn)')
    expect(start, 'the CTA click handler must still exist').toBeGreaterThan(0)
    const handler = SOURCE.slice(start, start + 800)
    expect(handler).toContain("btn.type === 'internal_booking'")
    expect(handler).toContain('setPendingBooking(')
    expect(handler, 'the navigation must not run from the click any more').not.toContain('router.push(btn.url)')
  })

  it('performs the navigation only from the confirmed path', () => {
    const runner = SOURCE.slice(SOURCE.indexOf('const runPendingBooking'), SOURCE.indexOf('const stashPendingChat'))
    expect(runner).toContain('router.push(target.url)')
    // The original save-then-navigate ordering is preserved, not rewritten.
    expect(runner).toContain('savePromiseRef.current')
  })

  it('states a consequence rather than asking "are you sure"', () => {
    expect(SOURCE).toContain("t('confirm.bookingConsequence'")
    expect(SOURCE.toLowerCase()).not.toContain('are you sure')
  })

  it('cancelling drops the action — nothing proceeds implicitly', () => {
    expect(SOURCE).toContain('onCancel={() => setPendingBooking(null)}')
  })

  it('leaves hand-off CTAs alone, so confirmation keeps its meaning', () => {
    // Maps/search/call/website go to a destination the user can see and back out of. Confirming
    // all of them would be the confirmation fatigue the UX spec rejects.
    for (const t of ['maps', 'call', 'zalo', 'website', 'search']) {
      expect(SOURCE).not.toContain(`setPendingBooking({ type: '${t}'`)
    }
  })
})
