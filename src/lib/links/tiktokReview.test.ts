import { describe, it, expect } from 'vitest'
import { isValidTikTokContentUrl, pickTikTokReviewUrl } from './tiktokReview'

// ── TikTok review/video links in AI Consultative ─────────────────────────────
//
// Product decision (2026-08-16): consultative answers MAY carry a TikTok review/video link, but
// ONLY one the backend validated out of a real provider result. The model must never invent,
// guess or construct one.
//
// Scope: this is the CONSULTATIVE contract only. The review composer's
// LINK_VIDEO_PROVIDERS = ['youtube'] is a separate contract and is deliberately untouched — see
// crossClientParity.test.ts / clientProviderParity.test.ts, which still pin it.
//
// A "review link" is a specific piece of CONTENT. A profile, a search page, a hashtag feed or
// the homepage is not a review, and a URL a model assembled from a place name is not evidence of
// anything — so the validator is an allowlist of content shapes, not a domain check.

const VIDEO = 'https://www.tiktok.com/@banhmihuynhhoa/video/7312345678901234567'

describe('isValidTikTokContentUrl accepts only real TikTok content', () => {
  it('accepts a canonical video URL', () => {
    expect(isValidTikTokContentUrl(VIDEO)).toBe(true)
  })

  it('accepts a photo post', () => {
    expect(isValidTikTokContentUrl('https://www.tiktok.com/@quanan/photo/7312345678901234567')).toBe(true)
  })

  it('accepts the apex host without www', () => {
    expect(isValidTikTokContentUrl('https://tiktok.com/@quanan/video/7312345678901234567')).toBe(true)
  })

  it('accepts a vm.tiktok.com short link', () => {
    expect(isValidTikTokContentUrl('https://vm.tiktok.com/ZSdKqK8vN/')).toBe(true)
  })

  it('rejects the homepage', () => {
    expect(isValidTikTokContentUrl('https://www.tiktok.com/')).toBe(false)
  })

  it('rejects a search URL — a search is not a review', () => {
    expect(isValidTikTokContentUrl('https://www.tiktok.com/search?q=banh%20mi')).toBe(false)
  })

  it('rejects a bare profile — a profile is not a specific review', () => {
    expect(isValidTikTokContentUrl('https://www.tiktok.com/@banhmihuynhhoa')).toBe(false)
  })

  it('rejects a hashtag feed', () => {
    expect(isValidTikTokContentUrl('https://www.tiktok.com/tag/banhmi')).toBe(false)
  })

  it('rejects a video id that is not numeric — a guessed id', () => {
    expect(isValidTikTokContentUrl('https://www.tiktok.com/@quanan/video/PLACE_NAME_HERE')).toBe(false)
  })

  it('rejects http', () => {
    expect(isValidTikTokContentUrl('http://www.tiktok.com/@quanan/video/7312345678901234567')).toBe(false)
  })

  it('rejects javascript:', () => {
    expect(isValidTikTokContentUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects an unrelated domain', () => {
    expect(isValidTikTokContentUrl('https://example.com/@quanan/video/7312345678901234567')).toBe(false)
  })

  it('rejects a look-alike host', () => {
    expect(isValidTikTokContentUrl('https://tiktok.com.evil.example/@a/video/7312345678901234567')).toBe(false)
  })

  it('rejects empty and malformed values', () => {
    for (const v of [null, undefined, '', 'not a url', '//tiktok.com/@a/video/1']) {
      expect(isValidTikTokContentUrl(v as string), String(v)).toBe(false)
    }
  })
})

describe('pickTikTokReviewUrl selects from real provider results only', () => {
  it('returns the first valid content URL', () => {
    const picked = pickTikTokReviewUrl([
      { link: 'https://www.tiktok.com/search?q=x' },
      { link: VIDEO },
      { link: 'https://www.tiktok.com/@other/video/7300000000000000001' },
    ])
    expect(picked).toBe(VIDEO)
  })

  it('returns null when the provider found nothing usable', () => {
    expect(pickTikTokReviewUrl([
      { link: 'https://www.tiktok.com/' },
      { link: 'https://www.tiktok.com/tag/an-uong' },
      { link: 'https://facebook.com/somepage' },
    ])).toBeNull()
  })

  it('returns null for an empty or absent result set — no source, no link', () => {
    expect(pickTikTokReviewUrl([])).toBeNull()
    expect(pickTikTokReviewUrl(null)).toBeNull()
    expect(pickTikTokReviewUrl(undefined)).toBeNull()
  })

  it('never returns a URL that was not in the provider results', () => {
    const picked = pickTikTokReviewUrl([{ link: 'https://facebook.com/x' }])
    expect(picked).toBeNull()
  })
})
