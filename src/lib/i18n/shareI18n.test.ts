// The share namespace must exist in BOTH languages.
//
// The old share buttons hardcoded Vietnamese, so an English user saw "Chia sẻ"
// and "Đã copy". A key present in one dictionary and missing from the other
// reintroduces exactly that, silently — the lookup just falls back to the key.

import { describe, it, expect } from 'vitest'
import { vi as shareVi, en as shareEn } from './share'

const REQUIRED = [
  'share.title',
  'share.facebook',
  'share.tiktok',
  'share.zalo',
  'share.copyLink',
  'share.copied',
  'share.more',
  'share.open',
  'share.unavailable',
  'share.copyFailed',
] as const

describe('share i18n', () => {
  it.each(REQUIRED)('%s exists in Vietnamese', (key) => {
    expect(shareVi[key as keyof typeof shareVi]).toBeTruthy()
  })

  it.each(REQUIRED)('%s exists in English', (key) => {
    expect(shareEn[key as keyof typeof shareEn]).toBeTruthy()
  })

  it('has identical key sets — no language can drift', () => {
    expect(Object.keys(shareVi).sort()).toEqual(Object.keys(shareEn).sort())
  })

  it('every key is namespaced under share.', () => {
    for (const key of Object.keys(shareVi)) expect(key).toMatch(/^share\./)
  })

  it('carries the exact product wording', () => {
    expect(shareVi['share.title']).toBe('Chia sẻ')
    expect(shareVi['share.copyLink']).toBe('Sao chép liên kết')
    expect(shareVi['share.copied']).toBe('Đã sao chép')
    expect(shareEn['share.title']).toBe('Share')
    expect(shareEn['share.copyLink']).toBe('Copy link')
    expect(shareEn['share.copied']).toBe('Copied')
  })

  // TappyAI hands the link over; it does not publish. Claiming otherwise in a
  // toast would be a lie the user acts on.
  it.each([
    ['vi', shareVi],
    ['en', shareEn],
  ])('%s never claims a post was published', (_lang, dict) => {
    const text = Object.values(dict).join(' ').toLowerCase()
    expect(text).not.toContain('posted')
    expect(text).not.toContain('published')
    expect(text).not.toContain('đã đăng')
    expect(text).not.toContain('đăng thành công')
  })

  // TikTok the social app, not the Deals commerce partner.
  it('labels TikTok without "Shop"', () => {
    expect(shareVi['share.tiktok']).toBe('TikTok')
    expect(shareEn['share.tiktok']).toBe('TikTok')
  })
})
