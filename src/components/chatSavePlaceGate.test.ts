// Final UAT 19/11: fuel price, weather, news and flight answers offered "save place" because the text had a bold word and a time of day.
import { describe, it, expect } from 'vitest'
import { replyHasSavablePlace } from './ChatInterface'

describe('replyHasSavablePlace', () => {
  it('a bold word beside a time of day is not a place', () => {
    expect(replyHasSavablePlace('**RON 95-III** gia ap dung tu 15:00 hom nay la 20.000d', [], null)).toBe(false)
    expect(replyHasSavablePlace('**Hom nay** troi mo, open all day, 14h30 co mua', [], null)).toBe(false)
  })
  it('a bold name beside a rating or an address is a place', () => {
    expect(replyHasSavablePlace('**Pho Thin** ★ 4.7 tren Google Maps', [], null)).toBe(true)
    expect(replyHasSavablePlace('**Pho Thin** at 13 street Lo Duc', [], null)).toBe(true)
  })
  it('a place card makes it savable', () => {
    expect(replyHasSavablePlace('x', [], { items: [{}] })).toBe(true)
  })
})
