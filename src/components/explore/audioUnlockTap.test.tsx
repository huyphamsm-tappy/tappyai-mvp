// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Owner 21/11/2026: on the Khám phá stage the first tap unlocked sound AND paused the clip in the same click, so sound only came on the
// second tap. The stage now skips the pause on the ONE tap that unlocked audio; every later tap pauses as before.
beforeEach(() => { vi.resetModules() })

describe('the tap that unlocks audio', () => {
  it('is reported once, for the first click of the session only', async () => {
    const { consumeAudioUnlockTap, isFeedAudioUnlocked } = await import('./VideoPlayer')
    expect(isFeedAudioUnlocked()).toBe(false)
    let seen: boolean | null = null
    // A bubbling handler, like the stage's onClick, runs after the window capture listener within the same click.
    document.body.addEventListener('click', () => { seen = consumeAudioUnlockTap() })
    document.body.click()
    expect(seen).toBe(true)
    expect(isFeedAudioUnlocked()).toBe(true)
    document.body.click()
    expect(seen).toBe(false) // the second tap is an ordinary tap → the stage pauses
  })

  it('is cleared after the click if nobody consumed it, so a later handler cannot swallow a real pause', async () => {
    vi.useFakeTimers()
    const { consumeAudioUnlockTap } = await import('./VideoPlayer')
    document.body.click() // unlock click, nothing consumed it
    vi.runAllTimers()
    expect(consumeAudioUnlockTap()).toBe(false)
    vi.useRealTimers()
  })

  it('the stage guards its tap-to-pause with it', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/reviews/clipStage.tsx', 'utf8')
    expect(src).toContain('if (consumeAudioUnlockTap()) return; togglePause()')
  })
})
