import { describe, it, expect } from 'vitest'
import { reviewActionsForPlace, reviewActionsForProduct } from './reviewAction'

describe('reviewActionsForPlace — Phase A A11 priority order', () => {
  it('verified TikTok wins when has_tiktok_review=true and URL present', () => {
    const acts = reviewActionsForPlace({
      name: 'Phở Nhất Phẩm',
      place_id: 'ChIJx',
      has_tiktok_review: true,
      tiktok_review_url: 'https://www.tiktok.com/@user/video/123',
      maps_link: 'https://maps.google.com/x',
      website_uri: 'https://phonhatpham.vn',
    })
    expect(acts.length).toBeGreaterThan(0)
    expect(acts[0].kind).toBe('tiktok_verified')
    expect(acts[0].attributed).toBe(true)
    expect(acts[0].url).toContain('tiktok.com')
  })

  it('drops TikTok when has_tiktok_review=false — never fabricated', () => {
    const acts = reviewActionsForPlace({
      name: 'Quán X',
      has_tiktok_review: false,
      maps_link: 'https://maps.google.com/x',
    })
    for (const a of acts) expect(a.kind).not.toBe('tiktok_verified')
  })

  it('when no verified specific content, Google Maps + website count as attributed platforms', () => {
    const acts = reviewActionsForPlace({
      name: 'Nhất Phẩm',
      maps_link: 'https://maps.google.com/x',
      website_uri: 'https://nhatpham.vn',
    })
    expect(acts.map(a => a.kind)).toContain('google_maps')
    expect(acts.map(a => a.kind)).toContain('official_website')
    // Both platform URLs are attributed (belong to the place unambiguously).
    for (const a of acts) expect(a.attributed).toBe(true)
  })

  it('YouTube search fallback ONLY when nothing else exists', () => {
    const acts = reviewActionsForPlace({ name: 'Quán Vô Danh' })
    expect(acts).toHaveLength(1)
    expect(acts[0].kind).toBe('youtube_search_fallback')
    expect(acts[0].attributed).toBe(false)
    expect(acts[0].url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/)
    // The name is URL-encoded, and " review" is appended.
    expect(decodeURIComponent(acts[0].url.split('search_query=')[1])).toBe('Quán Vô Danh review')
  })

  it('drops YouTube fallback the moment any attributed URL exists', () => {
    const acts = reviewActionsForPlace({
      name: 'Q',
      maps_link: 'https://maps.google.com/q',
    })
    expect(acts.every(a => a.kind !== 'youtube_search_fallback')).toBe(true)
  })

  it('never emits an action from a bad URL (typo, missing http)', () => {
    const acts = reviewActionsForPlace({
      name: 'Q',
      tiktok_review_url: 'tiktok.com/@x',   // missing scheme — rejected
      has_tiktok_review: true,
      maps_link: 'not-a-url',                // rejected
    })
    // Only the fallback survives.
    expect(acts).toHaveLength(1)
    expect(acts[0].kind).toBe('youtube_search_fallback')
  })

  it('nameless input → empty (never a fabricated search URL)', () => {
    const acts = reviewActionsForPlace({ name: '' })
    expect(acts).toHaveLength(0)
  })
})

describe('reviewActionsForProduct', () => {
  it('verified YouTube review URL wins over sản-thương-mại link', () => {
    const acts = reviewActionsForProduct({
      title: 'Sony WH-1000XM5',
      link: 'https://shopee.vn/sony-xm5',
      youtube_review_url: 'https://www.youtube.com/watch?v=abcdef',
    })
    expect(acts[0].kind).toBe('youtube_verified')
    expect(acts[0].attributed).toBe(true)
  })

  it('falls back to search when neither review URL nor product page exists', () => {
    const acts = reviewActionsForProduct({ title: 'Vô Danh' })
    expect(acts).toHaveLength(1)
    expect(acts[0].kind).toBe('youtube_search_fallback')
  })

  it('nameless product → empty', () => {
    const acts = reviewActionsForProduct({ title: '' })
    expect(acts).toHaveLength(0)
  })
})
