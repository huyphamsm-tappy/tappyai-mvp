import { describe, it, expect } from 'vitest'
import { GOOGLE_PLAY_URL, playBadgeEnabled } from './storeListing'

describe('Google Play badge (owner SL2)', () => {
  it('links the release applicationId listing', () => {
    expect(GOOGLE_PLAY_URL).toBe('https://play.google.com/store/apps/details?id=com.tappyai.app')
  })
  it('is on by default (the listing is public since 21/11/2026) and can be switched off with the flag', () => {
    expect(playBadgeEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'production' })).toBe(true)
    expect(playBadgeEnabled({})).toBe(true)
    expect(playBadgeEnabled({ NEXT_PUBLIC_PLAY_LISTING_LIVE: '1' })).toBe(true)
    expect(playBadgeEnabled({ NEXT_PUBLIC_PLAY_LISTING_LIVE: '0' })).toBe(false)
  })
  it('the App Store link is the verified public listing, an https apps.apple.com URL', async () => {
    const { APP_STORE_URL } = await import('./storeListing')
    expect(APP_STORE_URL).toMatch(/^https:\/\/apps\.apple\.com\/vn\/app\/tappyai\/id\d+$/)
  })
})
