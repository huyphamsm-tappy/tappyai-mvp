import { describe, it, expect } from 'vitest'
import { markdownSafeRevealEnd, formatMessage } from './ChatInterface'

// The typewriter reveal slices the streamed reply at an arbitrary character. formatMessage only
// recognises a COMPLETE `![alt](https://…)`, so a cut inside one paints the raw URL as visible
// text. Production showed exactly that: working ShopeeFood/GrabFood links beside a giant raw
// `![Ảnh địa điểm](https://encrypted-tbn0…`, both from the same injected block. Short link
// tokens clear the window in a frame or two; a ~120-char thumbnail URL does not.
//
// These assertions walk EVERY prefix, because the defect only exists at particular cut points.

const IMG_URL =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSM2ZOP-RL6NMNfxn0_DePKKC5NQr0b7KDiN_nxObbeDQ&s=10'
const FIXTURE = [
  '**BẾP ÔNG CẬU | BÚN BÒ THỐ ĐÁ QUẬN 1**',
  '**4.9⭐ (1,001 đánh giá Google Maps)**',
  '4E Võ Thị Sáu, Tân Định, Quận 1 — quán bún bò đậm vị, giá (khoảng 50k) hợp lý.',
  `![Ảnh địa điểm](${IMG_URL})`,
  '[ShopeeFood](https://shopeefood.vn/tim-kiem?q=bun%20bo) · [GrabFood](https://food.grab.com/vn/en/s?searchKeyword=bun+bo)',
  '[CTA_BUTTONS]{"buttons":[{"label":"📍 Google Maps","type":"maps","url":"https://maps.google.com/?cid=1"}]}[/CTA_BUTTONS]',
  '[FOLLOWUPS]quán khác gần đây|giá rẻ hơn[/FOLLOWUPS]',
].join('\n')

/** Visible text after rendering — what the user actually sees. */
const rendered = (s: string) => formatMessage(s)

describe('no prefix of a streamed reply ever shows raw markdown', () => {
  it('never exposes a partial image token at any cut point', () => {
    const bad: number[] = []
    for (let end = 1; end <= FIXTURE.length; end++) {
      const html = rendered(FIXTURE.slice(0, markdownSafeRevealEnd(FIXTURE, end)))
      if (html.includes('![Ảnh địa điểm]')) bad.push(end)
    }
    expect(bad).toEqual([])
  })

  it('never exposes a partial link token at any cut point', () => {
    const bad: number[] = []
    for (let end = 1; end <= FIXTURE.length; end++) {
      const html = rendered(FIXTURE.slice(0, markdownSafeRevealEnd(FIXTURE, end)))
      // A revealed '](' with no anchor built means a half-token is on screen.
      if (html.includes('](http')) bad.push(end)
    }
    expect(bad).toEqual([])
  })
})

describe('the specific cut points named in the defect', () => {
  const imgStart = FIXTURE.indexOf('![Ảnh')
  const cuts: Array<[string, number]> = [
    ['before the token', imgStart],
    ['inside alt text', imgStart + 5],
    ['inside "](" ', FIXTURE.indexOf('](', imgStart) + 1],
    ['inside the URL', FIXTURE.indexOf('encrypted-tbn0') + 20],
    ['one char before the closing paren', FIXTURE.indexOf(')', imgStart) - 1],
  ]
  for (const [name, cut] of cuts) {
    it(`${name} withholds the token`, () => {
      const safe = markdownSafeRevealEnd(FIXTURE, cut)
      expect(safe).toBeLessThanOrEqual(imgStart)
      expect(rendered(FIXTURE.slice(0, safe))).not.toContain('![Ảnh địa điểm]')
    })
  }

  it('the complete token reveals and renders as an image', () => {
    const afterClose = FIXTURE.indexOf(')', FIXTURE.indexOf('encrypted-tbn0')) + 1
    expect(markdownSafeRevealEnd(FIXTURE, afterClose)).toBe(afterClose)
    expect(rendered(FIXTURE.slice(0, afterClose))).toContain('<img')
  })
})

describe('ordinary text is never delayed', () => {
  it('prose containing ( ) is revealed as proposed', () => {
    const s = 'giá (khoảng 50k) hợp lý'
    for (let i = 1; i <= s.length; i++) expect(markdownSafeRevealEnd(s, i)).toBe(i)
  })

  it('[CTA_BUTTONS] is not held waiting for a ")"', () => {
    const s = '[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]'
    expect(markdownSafeRevealEnd(s, 6)).toBe(6)
  })

  it('[FOLLOWUPS] is not held waiting for a ")"', () => {
    const s = '[FOLLOWUPS]a|b[/FOLLOWUPS]'
    expect(markdownSafeRevealEnd(s, 5)).toBe(5)
  })

  it('a bare "[" in prose is not held', () => {
    const s = 'ghi chú [quan trọng] về quán'
    for (let i = 1; i <= s.length; i++) expect(markdownSafeRevealEnd(s, i)).toBe(i)
  })

  it('end of stream always reveals everything', () => {
    expect(markdownSafeRevealEnd(FIXTURE, FIXTURE.length)).toBe(FIXTURE.length)
  })
})

describe('the final render is unchanged', () => {
  it('full fixture still yields image and both order links', () => {
    const html = rendered(FIXTURE)
    expect(html).toContain('<img')
    expect(html).toContain('shopeefood.vn')
    expect(html).toContain('food.grab.com')
    expect(html).not.toContain('![Ảnh địa điểm]')
  })

  it('multiple consecutive images still group', () => {
    const md = `![a](${IMG_URL})\n![b](${IMG_URL})`
    expect((rendered(md).match(/<img/g) ?? []).length).toBe(2)
  })
})
