// @vitest-environment jsdom
// Owner 31/10 (ChatGPT's option cards): each option of a recommendation as a card — tag, name, the figure large with its note, highlights,
// extra costs, caveat, link. The link is re-checked on the client: only a safe https URL becomes an anchor, and it opens in a new tab.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OptionCards } from './MediaBlocks'
import type { MediaOption } from '@/lib/media/mediaHosts'

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d }
const A: MediaOption = { name: 'Tour A Bangkok – Pattaya', badge: 'Rẻ nhất', figure: '7.990.000đ', figureNote: 'giá niêm yết/người, 30/10/2026', verdict: 'Hợp người đi lần đầu.', highlights: ['Bay thẳng', 'Khách sạn 3 sao'], extras: ['Tip HDV 300k'], caveat: 'Giá đổi theo ngày bay.', href: 'https://tour.example/a', linkLabel: 'Xem tour' }

describe('OptionCards', () => {
  it('one card per option with every field the option has, in the card order', () => {
    const d = dom(renderToStaticMarkup(<OptionCards title="Tour Thái 7 ngày" options={[A, { name: 'Tour B', highlights: [] }]} />))
    const cards = d.querySelectorAll('[data-media="options"] .rounded-2xl')
    expect(cards).toHaveLength(2)
    const t = cards[0].textContent ?? ''
    for (const s of ['Rẻ nhất', 'Tour A Bangkok – Pattaya', '7.990.000đ', 'giá niêm yết/người, 30/10/2026', 'Hợp người đi lần đầu.', 'Bay thẳng', 'Khách sạn 3 sao', '+ Tip HDV 300k', 'Giá đổi theo ngày bay.', 'Xem tour']) expect(t).toContain(s)
    expect(d.textContent).toContain('Tour Thái 7 ngày')
    expect(cards[1].textContent).toBe('Tour B')
  })
  it('the link is a new-tab anchor to the safe https URL only; an unsafe one renders no anchor', () => {
    const a = dom(renderToStaticMarkup(<OptionCards options={[A]} />)).querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://tour.example/a')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
    for (const bad of ['javascript:alert(1)', 'http://plain.example/a']) {
      expect(dom(renderToStaticMarkup(<OptionCards options={[{ ...A, href: bad }]} />)).querySelector('a')).toBeNull()
    }
  })
  it('no label → the site name; no options → nothing', () => {
    expect(dom(renderToStaticMarkup(<OptionCards options={[{ ...A, href: 'https://www.tour.example/a', linkLabel: undefined }]} />)).querySelector('a')!.textContent).toContain('tour.example')
    expect(renderToStaticMarkup(<OptionCards options={[]} />)).toBe('')
  })
})
