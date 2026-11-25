import { describe, expect, it } from 'vitest'
import { compactCount, conversationEmoji, conversationPreview, placeCardView, planBadgeLabel, saveablePlace, statusLine } from '@/lib/chat/v206Look'

describe('compactCount', () => {
  it('writes review counts the short way the mockup does', () => {
    expect(compactCount(0)).toBe('0')
    expect(compactCount(537)).toBe('537')
    expect(compactCount(753)).toBe('753')
    expect(compactCount(1000)).toBe('1k')
    expect(compactCount(2400)).toBe('2.4k')
    expect(compactCount(2449)).toBe('2.4k')
    expect(compactCount(9999)).toBe('10k')
    expect(compactCount(12500)).toBe('13k')
  })
})

describe('placeCardView: only what the real card carries', () => {
  const happy = {
    id: 'p1', name: 'Lost - Drink & Chill', address: '71/5 Mạc Thị Bưởi, Sài Gòn', rating: 4.6, ratingCount: 537, openingHours: '12:00-03:00', openNow: true,
    categories: ['Quán bar cocktail', 'Bar'], phone: '+84 787 655 688', image: 'https://lh3.googleusercontent.com/x',
    actions: [{ kind: 'maps' as const, url: 'https://www.google.com/maps/place/x' }, { kind: 'website' as const, url: 'https://lost.example/' }, { kind: 'review' as const, url: 'https://www.youtube.com/results?search_query=x' }],
  }

  it('maps every real field', () => {
    const v = placeCardView(happy, 'vi')
    expect(v.badge).toBe('Quán bar cocktail')
    expect(v.rating).toEqual({ value: '4.6', count: '537' })
    expect(v.address).toBe('71/5 Mạc Thị Bưởi, Sài Gòn')
    expect(v.hours).toBe('12:00-03:00')
    expect(v.open).toBe('open')
    expect(v.phone).toEqual({ display: '+84 787 655 688', href: 'tel:+84787655688' })
    expect(v.maps).toBe('https://www.google.com/maps/place/x')
    expect(v.website).toBe('https://lost.example/')
    expect(v.image).toBe('https://lh3.googleusercontent.com/x')
  })

  it('the Off-dry card: 5 stars, closed, 753 reviews', () => {
    const v = placeCardView({ id: 'p2', name: 'Off-dry', address: '35 Nguyễn Văn Tráng', rating: 5, ratingCount: 753, openingHours: '17:00-00:00', openNow: false, actions: [] }, 'vi')
    expect(v.rating).toEqual({ value: '5.0', count: '753' })
    expect(v.open).toBe('closed')
    expect(v.hours).toBe('17:00-00:00')
  })

  it('hides what is missing: no rating, no hours, no phone, no price, no badge, no links', () => {
    const v = placeCardView({ id: 'p3', name: 'Quán X', actions: [] }, 'vi')
    expect(v).toMatchObject({ badge: null, rating: null, address: null, hours: null, open: null, price: null, phone: null, maps: null, website: null, image: null })
    expect(v.hasMeta).toBe(false)
  })

  it('a rating without a count shows the rating only; a zero rating is no rating', () => {
    expect(placeCardView({ id: 'a', name: 'A', rating: 4.2, actions: [] }, 'vi').rating).toEqual({ value: '4.2', count: null })
    expect(placeCardView({ id: 'a', name: 'A', rating: 0, ratingCount: 10, actions: [] }, 'vi').rating).toBeNull()
  })

  it('price: the provider band first, else the price level glyphs; never the snippet price', () => {
    expect(placeCardView({ id: 'a', name: 'A', priceRangeText: '100-200K', actions: [] }, 'vi').price).toBeTruthy()
    expect(placeCardView({ id: 'a', name: 'A', priceLevel: 2, actions: [] }, 'vi').price).toBe('₫₫')
    expect(placeCardView({ id: 'a', name: 'A', priceSignal: '50k', actions: [] }, 'vi').price).toBeNull()
    expect(placeCardView({ id: 'a', name: 'A', priceLevel: 9, actions: [] }, 'vi').price).toBeNull()
  })

  it('a link that is not https is never offered; a phone with too few digits is not a phone', () => {
    const v = placeCardView({ id: 'a', name: 'A', phone: '12', actions: [{ kind: 'website', url: 'javascript:alert(1)' }, { kind: 'maps', url: 'http://insecure.example/' }] }, 'vi')
    expect(v.phone).toBeNull()
    expect(v.website).toBeNull()
    expect(v.maps).toBeNull()
  })

  it('there is no menu link on a card, so none is made up', () => {
    expect(Object.keys(placeCardView(happy, 'vi'))).not.toContain('menu')
  })

  it('a very long category is cut to a badge, not a paragraph', () => {
    const v = placeCardView({ id: 'a', name: 'A', categories: ['Nhà hàng chuyên các món ăn truyền thống ba miền Bắc Trung Nam'], actions: [] }, 'vi')
    expect(v.badge!.length).toBeLessThanOrEqual(26)
  })
})

describe('saveablePlace', () => {
  it('needs a real id and a name', () => {
    expect(saveablePlace({ id: 'p1', name: 'A', address: 'x', categories: ['Bar'], domain: 'food' })).toEqual({ placeId: 'p1', placeName: 'A', placeAddress: 'x', placeType: 'Bar' })
    expect(saveablePlace({ id: '', name: 'A' })).toBeNull()
    expect(saveablePlace({ id: 'p', name: '  ' })).toBeNull()
  })
})

describe('conversationPreview: a one-line snippet of the real last message', () => {
  it('takes the last assistant text and strips markup', () => {
    const p = conversationPreview([
      { role: 'user', content: 'Happy hour ở đâu?' },
      { role: 'assistant', content: '## Gợi ý\n\n**Lost** – [xem bản đồ](https://maps.google.com/x) là quán *rất* hay.\n- một\n- hai' },
    ])
    expect(p).toBe('Gợi ý Lost – xem bản đồ là quán rất hay. một hai')
  })

  it('removes card and button blocks entirely', () => {
    const p = conversationPreview([
      { role: 'assistant', content: 'Đây là kế hoạch.\n[TAPPY_PLAN]{"title":"x","days":[]}[/TAPPY_PLAN]\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]\n[FOLLOWUPS]a|b[/FOLLOWUPS]' },
    ])
    expect(p).toBe('Đây là kế hoạch.')
    expect(p).not.toMatch(/\[|\{|TAPPY/)
  })

  it('removes an unfinished block and images and bare links', () => {
    expect(conversationPreview([{ role: 'assistant', content: 'Xin chào ![ảnh](https://x.test/a.png) bạn https://example.com/abc\n[CTA_BUTTONS]{"butt' }])).toBe('Xin chào bạn')
  })

  it('falls back to the last user text when the assistant said nothing readable', () => {
    expect(conversationPreview([{ role: 'user', content: 'Cho tui hỏi giá vé' }, { role: 'assistant', content: '[CTA_BUTTONS]{}[/CTA_BUTTONS]' }])).toBe('Cho tui hỏi giá vé')
  })

  it('reads a parts array and cuts to the length with an ellipsis on a word edge', () => {
    const long = 'một hai ba bốn năm sáu bảy tám chín mười '.repeat(10)
    const p = conversationPreview([{ role: 'assistant', content: [{ type: 'text', text: long }] }], 60)
    expect(p!.length).toBeLessThanOrEqual(61)
    expect(p!.endsWith('…')).toBe(true)
    expect(p).not.toMatch(/\s…$/)
  })

  it('is null for nothing, and never throws on odd input', () => {
    expect(conversationPreview(null)).toBeNull()
    expect(conversationPreview([])).toBeNull()
    expect(conversationPreview([null as never, { role: 'assistant', content: 42 as never }])).toBeNull()
  })
})

describe('conversationEmoji', () => {
  it('maps the app categories, and a plain bubble otherwise', () => {
    expect(conversationEmoji('food')).toBe('🍽️')
    expect(conversationEmoji('travel')).toBe('🧳')
    expect(conversationEmoji('general')).toBe('💬')
    expect(conversationEmoji(undefined)).toBe('💬')
    expect(conversationEmoji('zzz')).toBe('💬')
  })
})

describe('planBadgeLabel: the real plan, or nothing', () => {
  it('shows the active plan name in capitals', () => {
    expect(planBadgeLabel({ state: 'ACTIVE', plan: { id: 'pro', name: 'Pro' } })).toBe('PRO')
  })
  it('shows nothing without an active plan (no invented tier)', () => {
    expect(planBadgeLabel({ state: 'NONE', plan: null })).toBeNull()
    expect(planBadgeLabel({ state: 'EXPIRED', plan: { id: 'pro', name: 'Pro' } })).toBeNull()
    expect(planBadgeLabel(null)).toBeNull()
  })
})

describe('statusLine', () => {
  it('is the update time and, when real, the message count; nothing else', () => {
    expect(statusLine({ updated: 'Vừa xong', messages: 12 }, n => `${n} tin nhắn`)).toBe('Vừa xong · 12 tin nhắn')
    expect(statusLine({ updated: 'Vừa xong', messages: 0 }, n => `${n} tin nhắn`)).toBe('Vừa xong')
  })
})
