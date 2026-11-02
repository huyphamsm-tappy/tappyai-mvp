// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { currentSubjectMessages, isMarketPriceLookup } from './subjectScope'
import { deriveNeedProfile } from './needProfile'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'

// CONSULT_LUNA_ONE — G1 live UAT 2 (3027, 14/10/2026), turn K4. Thread: "ông ơi tui muốn đi ăn lẩu tối nay ở Bình Thạnh" →
// "quán bún bò ngon" → "ở Đà Nẵng" → "giá xăng hôm nay bao nhiêu". The fuel question names no consultation domain, so it was read as a
// follow-up of the bún bò search: needProfile.domain stayed 'places', the route passed placeIntent = true (route.ts:3433), and the
// fail-closed place price guard (snippet_price, no place snippets this turn) deleted the model's sourced answer.

type M = { role: 'user' | 'assistant'; content: string }
const thread = (...users: string[]): M[] => users.flatMap(u => [{ role: 'user' as const, content: u }, { role: 'assistant' as const, content: 'Ok.' }]).slice(0, -1)
const opts = (lunaOne: boolean) => ({ hasGps: false, lang: 'vi', lunaOne })
const domainOf = (msgs: M[], lunaOne: boolean) => deriveNeedProfile(currentSubjectMessages(msgs, opts(lunaOne)), { storedPreferences: undefined, gps: null } as never).domain
const UAT2 = thread('ông ơi tui muốn đi ăn lẩu tối nay ở Bình Thạnh', 'quán bún bò ngon', 'ở Đà Nẵng', 'giá xăng hôm nay bao nhiêu')

describe('a market price lookup is its own subject (CONSULT_LUNA_ONE)', () => {
  it('reproduces the live misreading with the flag OFF, and fixes it with the flag ON', () => {
    expect(domainOf(UAT2, false)).toBe('places')
    expect(currentSubjectMessages(UAT2, opts(true))).toEqual([{ role: 'user', content: 'giá xăng hôm nay bao nhiêu' }])
    expect(domainOf(UAT2, true)).not.toBe('places')
  })

  it('flag OFF (explicitly, and by default with CONSULT_LUNA_ONE unset): the subject boundary is the old one — the whole thread here', () => {
    const msgs = thread('quán bún bò ngon', 'ở Đà Nẵng', 'giá xăng hôm nay bao nhiêu')
    expect(currentSubjectMessages(msgs, opts(false))).toEqual(msgs)
    const prev = process.env.CONSULT_LUNA_ONE
    delete process.env.CONSULT_LUNA_ONE
    try { expect(currentSubjectMessages(msgs, { hasGps: false, lang: 'vi' })).toEqual(msgs) } finally { if (prev !== undefined) process.env.CONSULT_LUNA_ONE = prev }
  })

  it('after a shopping or a travel consultation too', () => {
    expect(currentSubjectMessages(thread('mua laptop văn phòng dưới 15tr', 'cái rẻ nhất có tốt không?', 'tỷ giá đô hôm nay bao nhiêu'), opts(true))).toHaveLength(1)
    expect(currentSubjectMessages(thread('vé máy bay Sài Gòn Hà Nội tuần sau', 'giá vàng SJC hôm nay'), opts(true))).toHaveLength(1)
  })

  it('only the LAST turn: a lookup in the middle does not cut a later follow-up off its consultation', () => {
    const msgs = thread('quán bún bò ngon', 'ở Đà Nẵng', 'giá xăng hôm nay bao nhiêu', 'còn quán nào khác không?')
    expect(currentSubjectMessages(msgs, opts(true))).toEqual(currentSubjectMessages(msgs, opts(false)))
  })

  it('a first turn is untouched (nothing to cut)', () => {
    const msgs = thread('giá xăng hôm nay bao nhiêu')
    expect(currentSubjectMessages(msgs, opts(true))).toEqual(msgs)
  })
})

describe('what is — and what is not — a market price lookup', () => {
  it('fuel, gold / silver, exchange rates, power tariff, stocks, crypto', () => {
    for (const t of ['giá xăng hôm nay bao nhiêu', 'Giá xăng E5 RON 92 hôm nay', 'xăng hôm nay tăng hay giảm', 'giá dầu diesel mới nhất', 'giá vàng SJC hôm nay',
      'vàng nhẫn hôm nay bao nhiêu', 'tỷ giá đô hôm nay', 'giá USD hôm nay bao nhiêu', 'giá điện sinh hoạt hiện nay', 'chứng khoán hôm nay thế nào, VN-Index tăng không',
      'giá bitcoin hôm nay']) expect(isMarketPriceLookup(t), t).toBe(true)
  })
  it('a place, an item already discussed, or an ordinary product price is not', () => {
    for (const t of ['cây xăng gần đây', 'trạm xăng gần nhất ở đâu', 'quán đó giá bao nhiêu', 'cái thứ hai giá sao', 'giá bao nhiêu?', 'cái rẻ nhất có tốt không?',
      'giá điện thoại Samsung S26', 'áo màu vàng giá bao nhiêu', 'bác ơi giá bao nhiêu', 'tiệm vàng nào uy tín ở quận 1 hôm nay', 'giá bao nhiêu USD vậy',
      'quán bún bò ngon', 'ở Đà Nẵng', 'Nồi chiên không dầu 5L loại nào tốt', 'giá dầu gội nào tốt']) expect(isMarketPriceLookup(t), t).toBe(false)
  })
})

describe('what the domain decides downstream: the place price guard (snippet_price) on the live K4 answer', () => {
  // The model's sentence of turn K4 as it reached the price guard (audit trace, stage snippet_price "before").
  const K4 = 'Hôm nay **14/10**, giá xăng Petrolimex vùng 1 là **27.700 đồng/lít** cho E5 RON 92-II và **28.250 đồng/lít** cho E10 RON 95-III, theo bảng giá được cập nhật hôm nay.'
  const run = async (placeIntent: boolean) => new Response(applyPlaceEnrichmentStreamFilter(new Response('0:' + JSON.stringify(K4) + '\n'), 'vi', undefined, undefined, undefined, undefined, false, 'giá xăng hôm nay bao nhiêu', placeIntent).body).text()
  it('placeIntent true (the live misreading) deletes the prices; false (the fixed reading) keeps them', async () => {
    const wrong = await run(true)
    expect(wrong).not.toContain('27.700')
    const fixed = await run(false)
    expect(fixed).toContain('27.700 đồng/lít')
    expect(fixed).toContain('28.250 đồng/lít')
  })
})
