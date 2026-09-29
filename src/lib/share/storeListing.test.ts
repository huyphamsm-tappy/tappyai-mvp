import { describe, it, expect } from 'vitest'
import { GOOGLE_PLAY_URL, playBadgeEnabled } from './storeListing'

describe('Google Play badge (owner SL2)', () => {
  it('links the release applicationId listing', () => {
    expect(GOOGLE_PLAY_URL).toBe('https://play.google.com/store/apps/details?id=com.tappyai.app')
  })
  it('stays off on production until the public listing is confirmed live', () => {
    expect(playBadgeEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'production' })).toBe(false)
    expect(playBadgeEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'production', NEXT_PUBLIC_PLAY_LISTING_LIVE: '1' })).toBe(true)
    expect(playBadgeEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toBe(true)
  })
})
