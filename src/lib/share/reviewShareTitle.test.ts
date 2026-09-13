// A review's share title never leaks the composer's "no place" sentinel.
//
// The bug: a clip posted without a venue is stored with place_name "Chia sẻ",
// and both share entry points handed that straight to the share menu as the
// title — so the preview and every outgoing message carried an internal
// marker as the subject. Pinned here, and pinned at both call sites.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND } from './openGraph'
import { SHARE_ONLY_NAMES, isShareOnlyPlaceName, reviewShareTitle, REVIEW_SHARE_TITLE_MAX } from './reviewShareTitle'

const root = join(__dirname, '..', '..', '..')

describe('reviewShareTitle — place, else caption, else the brand', () => {
  it('a real place name is the title, trimmed', () => {
    expect(reviewShareTitle({ place_name: '  Bún bò Cô Ba ', body: 'Ngon lắm' })).toBe('Bún bò Cô Ba')
  })

  it('a missing place falls back to the caption', () => {
    expect(reviewShareTitle({ place_name: null, body: 'Chiều Sài Gòn mưa' })).toBe('Chiều Sài Gòn mưa')
    expect(reviewShareTitle({ place_name: '', body: 'Chiều Sài Gòn mưa' })).toBe('Chiều Sài Gòn mưa')
    expect(reviewShareTitle({ body: 'Chiều Sài Gòn mưa' })).toBe('Chiều Sài Gòn mưa')
  })

  it.each([...SHARE_ONLY_NAMES])('the sentinel "%s" is never the title — the caption is', (sentinel) => {
    expect(reviewShareTitle({ place_name: sentinel, body: 'Mì lòng heo nóng hổi' })).toBe('Mì lòng heo nóng hổi')
    expect(reviewShareTitle({ place_name: ` ${sentinel} `, body: 'Mì lòng heo nóng hổi' })).toBe('Mì lòng heo nóng hổi')
  })

  it('no place and no caption: the brand, not an invented venue and not the sentinel', () => {
    for (const place of [null, undefined, '', '   ', 'Chia sẻ', 'Chia se']) {
      for (const body of [null, undefined, '', '  \n \n']) {
        const title = reviewShareTitle({ place_name: place, body })
        expect(title).toBe(BRAND.name)
        expect(title).not.toMatch(/chia s/i)
      }
    }
  })

  it('the caption becomes ONE bounded line', () => {
    expect(reviewShareTitle({ place_name: 'Chia sẻ', body: '\n\n  Dòng   đầu  \nDòng hai' })).toBe('Dòng đầu')
    const long = 'x'.repeat(200)
    const title = reviewShareTitle({ place_name: null, body: long })
    expect(title.length).toBe(REVIEW_SHARE_TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
    expect(reviewShareTitle({ place_name: null, body: 'y'.repeat(REVIEW_SHARE_TITLE_MAX) })).toBe('y'.repeat(REVIEW_SHARE_TITLE_MAX))
  })

  it('isShareOnlyPlaceName agrees with the feed: absent OR sentinel', () => {
    expect([null, undefined, '', ' ', 'Chia sẻ', 'Chia se', ' Chia sẻ '].map(isShareOnlyPlaceName)).toEqual([true, true, true, true, true, true, true])
    expect(isShareOnlyPlaceName('Chia sẻ quán')).toBe(false)
    expect(isShareOnlyPlaceName('The Workshop')).toBe(false)
  })
})

describe('both share entry points title through the helper — neither passes place_name raw', () => {
  it('ReviewShareButton (detail page) builds its title from place + caption', () => {
    const src = readFileSync(join(root, 'src/app/reviews/[id]/ReviewShareButton.tsx'), 'utf8')
    expect(src).toContain("import { reviewShareTitle } from '@/lib/share/reviewShareTitle'")
    expect(src).toContain('title={reviewShareTitle({ place_name: placeName, body })}')
    expect(src).not.toContain('title={placeName}')
  })

  it('ShareModal (feed) builds its title from the review', () => {
    const src = readFileSync(join(root, 'src/app/reviews/feedShared.tsx'), 'utf8')
    expect(src).toContain('title={reviewShareTitle(review)}')
    expect(src).not.toContain('title={review.place_name}')
    // One sentinel set, not a second copy that could drift.
    expect(src).toContain('export const isShareOnlyName = isShareOnlyPlaceName')
    expect(src).not.toMatch(/new Set\(\['Chia sẻ'/)
  })

  it('the detail page still hands the caption to the button', () => {
    const src = readFileSync(join(root, 'src/app/reviews/[id]/ReviewDetailView.tsx'), 'utf8')
    expect(src).toMatch(/<ReviewShareButton[\s\S]*?body=\{review\.body\}[\s\S]*?\/>/)
  })

  // The share URL and the server metadata are untouched by this fix.
  it('the share URL is still the canonical review page, and og metadata is not this module’s business', () => {
    const btn = readFileSync(join(root, 'src/app/reviews/[id]/ReviewShareButton.tsx'), 'utf8')
    expect(btn).toContain('absoluteUrl(`/reviews/${reviewId}`)')
    const page = readFileSync(join(root, 'src/app/reviews/[id]/page.tsx'), 'utf8')
    expect(page).not.toContain('reviewShareTitle')
  })
})
