import { describe, it, expect } from 'vitest'
import { GOOGLE_PLAY_URL, playBadgeEnabled } from './storeListing'

describe('Google Play badge (owner SL2)', () => {
  it('links the release applicationId listing', () => {
    expect(GOOGLE_PLAY_URL).toBe('https://play.google.com/store/apps/details?id=com.tappyai.app')
  })
  it('is hidden by default everywhere (Android not public, iOS unavailable) until the flag is set', () => {
    expect(playBadgeEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'production' })).toBe(false)
    expect(playBadgeEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toBe(false)
    expect(playBadgeEnabled({})).toBe(false)
    expect(playBadgeEnabled({ NEXT_PUBLIC_PLAY_LISTING_LIVE: '1' })).toBe(true)
  })
})
