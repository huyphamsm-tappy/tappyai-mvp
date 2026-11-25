// @vitest-environment jsdom
// The place cards of an answer sit under the text that talks about each place (ArticleAnswer `embedNames`), and one card standing alone is drawn wide, without the group's
// filters, carousel or "show more" (PlaceDecision `layout="solo"`). Everything is decided from the answer's text and the place data; nothing looks at the question.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import { formatMessage } from '@/components/ChatInterface'
import { ArticleAnswer } from '@/components/chat/ArticleAnswer'
import PlaceDecision from '@/components/chat/PlaceDecision'
import type { PlacesLiveView, LivePlace } from '@/lib/recommendation/liveView'

beforeEach(() => setLocale('vi'))
afterEach(cleanup)

const E = (id: string) => <div data-e={id}>thẻ {id}</div>
const answer = (text: string, embeds: React.ReactNode[], names?: Array<string | undefined>) =>
  render(<ArticleAnswer text={text} images={[]} format={formatMessage} presentation={{ variant: 'editorial', embeds, embedNames: names, look: true }} />)

/** the answer's children in document order: text blocks by their text, embeds by id */
const order = (c: HTMLElement) => Array.from(c.querySelector('[data-answer="article"]')!.children).map(el => (el as HTMLElement).dataset.embed !== undefined
  ? `E:${(el.querySelector('[data-e]') as HTMLElement).dataset.e}`
  : (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 18))

describe('ArticleAnswer: embeds named after a place follow the text that names it', () => {
  const TEXT = 'Mở đầu chung.\n\n## La Villa French Restaurant\n\nMô tả La Villa.\n\n## The Deck Saigon\n\nMô tả The Deck.\n\nLời kết.'
  it('each card goes right after its own section\'s text, not spread by position', () => {
    const { container } = answer(TEXT, [E('villa'), E('deck')], ['La Villa French Restaurant', 'The Deck Saigon'])
    const o = order(container)
    expect(o.indexOf('E:villa')).toBe(o.findIndex(x => x.startsWith('Mô tả La Villa')) + 1)
    expect(o.indexOf('E:deck')).toBe(o.findIndex(x => x.startsWith('Mô tả The Deck')) + 1)
  })

  it('the same cards given in the other order still land under their own text (the name decides, not the position)', () => {
    const { container } = answer(TEXT, [E('deck'), E('villa')], ['The Deck Saigon', 'La Villa French Restaurant'])
    const o = order(container)
    expect(o.indexOf('E:villa')).toBeLessThan(o.indexOf('E:deck'))
    expect(o.indexOf('E:villa')).toBe(o.findIndex(x => x.startsWith('Mô tả La Villa')) + 1)
  })

  it('an embed with no name is placed as before, and a named embed whose place is not in the text is still shown (never dropped)', () => {
    const { container } = answer(TEXT, [E('x'), E('ghost')], [undefined, 'Quán Không Có Trong Bài'])
    const o = order(container)
    expect(o).toContain('E:x')
    expect(o).toContain('E:ghost')
  })

  it('without embedNames the placement is exactly the former one', () => {
    const a = order(answer(TEXT, [E('1'), E('2')]).container)
    cleanup()
    const b = order(answer(TEXT, [E('1'), E('2')], [undefined, undefined]).container)
    expect(b).toEqual(a)
  })
})

const place = (id: string, name: string, over: Partial<LivePlace> = {}): LivePlace => ({
  id, domain: 'food', kind: 'place', name, rank: 0, actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://www.google.com/maps/search/?api=1&query=x', labelKey: 'v3.action.maps', priority: 1 }] as never,
  address: '1 Đường Mẫu', rating: 4.6, ratingCount: 120, openingHours: '08:00 - 22:00', openNow: true, priceRangeText: '200.000 - 400.000 ₫', ...over,
})
const view = (items: LivePlace[]): PlacesLiveView => ({ kind: 'tappy.places.v1', v: 1, domain: 'food', ranked: true, items })

describe('PlaceDecision layout="solo": one card standing alone under its text', () => {
  it('draws only that card: no filter row, no carousel, no "show more", no map-explore link; marked solo', () => {
    const { container, queryByTestId } = render(<PlaceDecision view={{ ...view([place('a', 'Quán Gió Mẫu'), place('b', 'Quán Mưa Mẫu')]), mapsSearchUrl: 'https://www.google.com/maps/search/?api=1&query=x' }} layout="solo" soloId="a" forceV206 />)
    expect(container.querySelectorAll('[data-testid="place-card"]')).toHaveLength(1)
    expect(container.querySelector('[data-testid="place-card"]')!.textContent).toContain('Quán Gió Mẫu')
    expect(container.textContent).not.toContain('Quán Mưa Mẫu')
    expect(queryByTestId('place-filters')).toBeNull()
    expect(queryByTestId('place-carousel')).toBeNull()
    expect(queryByTestId('place-show-more')).toBeNull()
    expect(queryByTestId('place-map-explore')).toBeNull()
    expect(container.querySelector('[data-testid="place-decision"]')!.getAttribute('data-layout')).toBe('solo')
  })

  it('shows the real photo when the place has one (a safe https link), and none when it has not (no photo is faked)', () => {
    const withPic = render(<PlaceDecision view={view([place('a', 'Quán Gió Mẫu', { image: 'https://example.com/p.jpg' })])} layout="solo" soloId="a" forceV206 />)
    const img = withPic.container.querySelector('[data-testid="place-solo-photo"] img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://example.com/p.jpg')
    cleanup()
    const noPic = render(<PlaceDecision view={view([place('a', 'Quán Gió Mẫu')])} layout="solo" soloId="a" forceV206 />)
    expect(noPic.container.querySelector('[data-testid="place-solo-photo"]')).toBeNull()
    cleanup()
    const unsafe = render(<PlaceDecision view={view([place('a', 'Quán Gió Mẫu', { image: 'http://example.com/p.jpg' })])} layout="solo" soloId="a" forceV206 />)
    expect(unsafe.container.querySelector('[data-testid="place-solo-photo"]')).toBeNull()
  })

  it('a solo id that is not in the view draws nothing (and does not throw)', () => {
    const { container } = render(<PlaceDecision view={view([place('a', 'Quán Gió Mẫu')])} layout="solo" soloId="zzz" forceV206 />)
    expect(container.innerHTML).toBe('')
  })

  it('without layout the group is exactly as before (filters, carousel)', () => {
    const { queryByTestId, container } = render(<PlaceDecision view={view([place('a', 'Quán Gió Mẫu'), place('b', 'Quán Mưa Mẫu', { openNow: false })])} forceV206 />)
    expect(queryByTestId('place-carousel')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="place-card"]')).toHaveLength(2)
  })

  it('the card is the same for any kind of venue: a hotel\'s booking action and a shop\'s call button come from its own actions, not from the domain', () => {
    const hotel = place('h', 'Khách sạn Biển Mẫu', { domain: 'travel', kind: 'stay', actions: [{ kind: 'booking', urlKind: 'direct', url: 'https://example.com/book', labelKey: 'v3.action.booking', priority: 1 }] as never })
    const { container } = render(<PlaceDecision view={{ ...view([hotel]), domain: 'travel' }} layout="solo" soloId="h" forceV206 />)
    expect(container.querySelector('[data-action-kind="booking"]')).toBeTruthy()
    cleanup()
    const shop = place('s', 'Tiệm sửa xe Mẫu', { phone: '0901234567', actions: [{ kind: 'call', urlKind: 'direct', url: 'tel:0901234567', labelKey: 'v3.action.call', priority: 1 }] as never })
    const r2 = render(<PlaceDecision view={view([shop])} layout="solo" soloId="s" forceV206 />)
    expect(r2.container.querySelector('[data-testid="v206-pc-hotline"]')).toBeTruthy()
  })
})
