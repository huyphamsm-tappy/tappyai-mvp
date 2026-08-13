// The iOS share UI, asserted from source.
//
// There is no Xcode and no device on this machine, so this proves the Swift *says* the right thing,
// not that a build succeeds or a tap works. That is a real limit and it is stated in the report as
// SOURCE VERIFIED rather than BUILD VERIFIED.
//
// It is still worth having: the defect it guards against is not subtle behaviour but plain wiring —
// `ReviewShareSheet.swift` shipped with hardcoded Vietnamese, an injected baseURL, and no Facebook,
// TikTok or Zalo at all, while `TappyShare.swift` sat next to it unused.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARE_TARGETS } from './shareTargets'

const root = join(__dirname, '..', '..', '..')
const sheet = readFileSync(
  join(root, 'ios', 'TappyAI', 'Features', 'Reviews', 'UI', 'ReviewShareSheet.swift'),
  'utf8'
)
const catalog = JSON.parse(
  readFileSync(join(root, 'ios', 'TappyAI', 'Resources', 'Localizable.xcstrings'), 'utf8')
) as { strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }> }

const SHARE_KEYS = [
  'share.title',
  'share.facebook',
  'share.tiktok',
  'share.zalo',
  'share.copyLink',
  'share.copied',
  'share.moreApps',
  'share.tiktokHint',
  'share.close',
]

describe('the iOS sheet is wired to the shared contract', () => {
  it('uses TappyShare rather than its own rules', () => {
    expect(sheet).toContain('TappyShare')
  })

  it('takes the canonical URL from TappyShare.reviewURL', () => {
    expect(sheet).toContain('TappyShare.reviewURL(review.id)')
  })

  // An injected baseURL is how a preview or staging host reaches a shared link.
  it('does not build the URL from an injected baseURL', () => {
    expect(sheet).not.toContain('let baseURL')
    expect(sheet).not.toMatch(/\\\(baseURL\)/)
  })

  it('renders the targets declared by the contract', () => {
    expect(sheet).toContain('TappyShare.targets')
  })

  it('builds handoffs through buildShareURL', () => {
    expect(sheet).toContain('TappyShare.buildShareURL')
  })

  it.each(SHARE_TARGETS.map((t) => t.id))('handles the %s target', (id) => {
    expect(sheet.toLowerCase()).toContain(id)
  })
})

describe('the iOS sheet is honest about TikTok', () => {
  it('presents the system sheet rather than a fabricated endpoint', () => {
    expect(sheet).toContain('UIActivityViewController')
    expect(sheet).not.toMatch(/tiktok\.com\/share/i)
    expect(sheet).not.toMatch(/tiktok\.com\/upload/i)
  })

  it('never claims a post happened', () => {
    expect(sheet).not.toMatch(/posted successfully|published successfully|đã đăng/i)
  })
})

describe('the iOS sheet leaks no internal URL', () => {
  it.each([
    ['a Blob object', /blob\.vercel-storage\.com/],
    ['a Cloud Storage object', /storage\.googleapis\.com/],
    ['a preview deployment', /vercel\.app/],
    ['an API route', /["']\/api/],
    ['an admin route', /["']\/admin/],
    ['a query-string token', /[?&]token=/],
  ])('carries no %s', (_what, pattern) => {
    expect(sheet).not.toMatch(pattern)
  })
})

describe('the iOS sheet has no hardcoded user-visible strings', () => {
  // The exact literals that shipped.
  it.each(['Chia sẻ bài review', 'Sao chép link', 'Đã sao chép!', 'Chia sẻ qua...', 'Đóng'])(
    'no longer hardcodes %s',
    (literal) => {
      expect(sheet).not.toContain(literal)
    }
  )

  it('references the share string keys', () => {
    for (const key of SHARE_KEYS) {
      expect(sheet).toContain(key)
    }
  })
})

describe('the string catalog covers both languages', () => {
  it.each(SHARE_KEYS)('%s exists', (key) => {
    expect(catalog.strings[key]).toBeDefined()
  })

  it.each(SHARE_KEYS)('%s has English and Vietnamese', (key) => {
    const locales = catalog.strings[key]?.localizations ?? {}
    expect(Object.keys(locales).sort()).toEqual(['en', 'vi'])
    expect(locales.en?.stringUnit?.value).toBeTruthy()
    expect(locales.vi?.stringUnit?.value).toBeTruthy()
  })

  it('translates the labels the owner specified', () => {
    expect(catalog.strings['share.copyLink']?.localizations?.en?.stringUnit?.value).toBe('Copy link')
    expect(catalog.strings['share.copyLink']?.localizations?.vi?.stringUnit?.value).toBe(
      'Sao chép liên kết'
    )
    expect(catalog.strings['share.moreApps']?.localizations?.en?.stringUnit?.value).toBe('More apps')
    expect(catalog.strings['share.moreApps']?.localizations?.vi?.stringUnit?.value).toBe(
      'Ứng dụng khác'
    )
  })
})
