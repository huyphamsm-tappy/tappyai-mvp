// UAT 2026-09-28 release blockers — A2 (snack purchase is shopping), A3 (plan items are retrieved
// places with retrieved links, no markdown), A4 (a trip asks date / origin / transport).
import { describe, expect, it } from 'vitest'
import { assessActionability } from './actionability'
import { missingTripFacts, tripAskAfter } from './tripFacts'
import { guardPlanItems, stripMarkdown } from '../planItemGuard'
import { dropUnbackedOrderingPossession } from '../placeClaimGuard'
import { normalizeVN } from '@/lib/ai/intent'

const gate = (q: string) => assessActionability({ messages: [{ role: 'user', content: q }] as never, hasGps: false, lang: 'vi', lastAssistantText: null, planningIntent: null, forcedTool: null, movieRecommend: false })
const fold = (s: string) => normalizeVN(s.toLowerCase())

describe('A2 · buying snacks is shopping, never "/người"', () => {
  it.each(['mua đồ ăn vặt', 'mua đồ ăn vặt online', 'mua đồ ăn vặt giá rẻ trên shopee', 'đặt mua bánh kẹo tết', 'mua snack cho con', 'mua khô gà'])('%s → shopping', q => {
    const a = gate(q)
    expect(a.domain).toBe('shopping')
    expect(JSON.stringify(a.askAfter ?? null)).not.toContain('/người')
  })
  it.each(['ăn vặt ở đâu quận 1', 'quán ăn vặt quận 3'])('%s stays a food place search', q => {
    expect(gate(q).domain).toBe('food')
  })
})

describe('A4 · a trip asks what it still lacks to book anything', () => {
  it('a duration is not a date ("3 ngày 2 đêm")', () => {
    expect(missingTripFacts(fold('đi Đà Lạt 3 ngày 2 đêm, 2 người, 20 triệu'))).toEqual(['date', 'origin', 'transport'])
  })
  it('names only the missing facts', () => {
    expect(missingTripFacts(fold('từ Sài Gòn đi Đà Nẵng ngày 12/10'))).toEqual(['transport'])
    expect(missingTripFacts(fold('bay từ Hà Nội vào Phú Quốc cuối tuần sau'))).toEqual([])
    expect(missingTripFacts(fold('đi du lịch Đà Nẵng bằng xe khách'))).toEqual(['date', 'origin'])
  })
  it('asks in one closing sentence, in the reader language', () => {
    const vi = tripAskAfter(fold('đi du lịch Đà Nẵng'), 'vi')!
    expect(vi.q).toContain('đi ngày nào')
    expect(vi.q).toContain('xuất phát từ đâu')
    expect(vi.q).toContain('bay hay đi xe')
    expect(tripAskAfter(fold('đi du lịch Đà Nẵng'), 'en')!.q).toMatch(/dates.*leaving from.*fly/)
    expect(tripAskAfter(fold('bay từ Hà Nội vào Phú Quốc ngày 3/11'), 'vi')).toBeNull()
  })
})

const plan = (items: unknown[]) => `Kế hoạch tối nay:\n[TAPPY_PLAN]\n${JSON.stringify({ title: 'Tối nay', days: [{ day: 1, items }] })}\n[/TAPPY_PLAN]`
const parsed = (text: string) => JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]')))

describe('A3 · "tối nay" plan: every venue stop is a retrieved place', () => {
  const places = [
    { name: 'Quán Bụi Central', place_id: 'p1', address: '39 Ngô Văn Năm, Quận 1', maps_link: 'https://maps.google.com/?cid=1', place_types: ['restaurant'], booking_links: ['https://quan-bui.com/eforms/reservation-form/6/'] },
    { name: 'Chill Skybar', place_id: 'p2', address: '76A Lê Lai, Quận 1', maps_link: 'https://maps.google.com/?cid=2', place_types: ['bar'] },
  ]
  it('an invented stop ("Quán bar/lounge Quận 1") is replaced by an unused retrieved place of the same kind', () => {
    const r = guardPlanItems(plan([
      { time: '19:00', name: 'Quán Bụi Central', category: 'dinner' },
      { time: '21:00', name: 'Quán bar/lounge Quận 1', category: 'bar', booking_link: 'https://www.booking.com/searchresults.html?ss=bar' },
    ]), places)
    const items = parsed(r.text).days[0].items
    expect(items.map((i: { name: string }) => i.name)).toEqual(['Quán Bụi Central', 'Chill Skybar'])
    expect(items[1].maps_link).toBe('https://maps.google.com/?cid=2')
    expect(items[1].booking_link).toBeUndefined() // a model URL never survives
    expect(r.replaced).toBe(1)
  })
  it('a stop with no retrieved place of its kind is dropped, not left generic', () => {
    const r = guardPlanItems(plan([{ name: 'Quán karaoke gần đó', category: 'karaoke' }]), [places[0]])
    expect(parsed(r.text).days[0].items).toEqual([])
    expect(r.dropped).toBe(1)
  })
  it('every kept venue stop carries its place link', () => {
    const r = guardPlanItems(plan([{ name: 'Quán Bụi Central', category: 'dinner' }]), places)
    const [item] = parsed(r.text).days[0].items
    expect(item.place_id).toBe('p1')
    expect(item.maps_link).toBe('https://maps.google.com/?cid=1')
  })
  it('markdown leaves every text field', () => {
    expect(stripMarkdown('**4.7⭐** — *ngon*')).toBe('4.7⭐ — ngon')
    const r = guardPlanItems(plan([{ name: '**Quán Bụi Central**', category: 'dinner', description: '**ngon** nhất' }]), places)
    expect(r.text).not.toContain('**')
  })
})

describe('A1 · prose may not claim ordering nobody retrieved', () => {
  it('a possession claim with no evidence goes; a question stays', () => {
    const d = dropUnbackedOrderingPossession('Ben.la có link order rồi! Bạn muốn đặt hàng online không?')
    expect(d.text).not.toContain('có link order')
    expect(d.text).toContain('Bạn muốn đặt hàng online không?')
  })
})
