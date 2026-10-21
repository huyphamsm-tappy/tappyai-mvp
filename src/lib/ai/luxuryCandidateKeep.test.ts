// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// Gate 1 M3 (PROPOSAL, owner decisions 15/10, direction i) -- UNIT LEVEL. The luxury pass keeps a brand that belongs to one of the names
// the CARD is built from -- the recommendations the route hands to the collector (placeRecommendations / stayRecommendations, i.e. after
// the card's own admission such as admitStays), not every row of the tool result -- and renames every other brand. URLs are never changed.
import { describe, it, expect } from 'vitest'
import { filterLuxuryBrands, luxuryKeepBrands, applyLuxuryStreamFilter } from './budget'
import { stayRecommendations } from '@/lib/recommendation/fromToolResult'

const NAME = 'The Square - Novotel Saigon Centre'
const cardNames = (recs: ReadonlyArray<{ entity: { identity: { name: string } } }>) => recs.map(r => r.entity.identity.name)

describe('luxuryKeepBrands: the brands in the names the card is built from', () => {
  it('a card name carrying a brand keeps that brand (lower case); other names keep nothing', () => {
    expect([...luxuryKeepBrands([NAME, 'Bún Bò Huế Đông Ba'])]).toEqual(['novotel'])
    expect([...luxuryKeepBrands(['Hilton Garden Inn Hà Nội', 'Sheraton Hanoi', 'Khách sạn Phố Cổ'])].sort()).toEqual(['hilton', 'sheraton'])
  })
  it('no names, empty names or no input keep nothing', () => {
    expect([...luxuryKeepBrands([])]).toEqual([])
    expect([...luxuryKeepBrands(['', 'Phở Hòa'])]).toEqual([])
    expect([...luxuryKeepBrands(undefined)]).toEqual([])
  })
  it('a hotel row the card admission (admitStays) rejects is not a card name, so its brand is not kept', () => {
    // no coordinates and no direct entity link: rejected by admitsStay -> no recommendation -> nothing kept
    const rejected = { location: 'Hà Nội', hotel_list: [{ name: 'Hilton Garden Inn Hà Nội', address: '20 Phan Chu Trinh, Hoàn Kiếm, Hà Nội', maps_link: 'https://maps.google.com/?cid=4242' }] }
    expect(cardNames(stayRecommendations(rejected))).toEqual([])
    expect([...luxuryKeepBrands(cardNames(stayRecommendations(rejected)))]).toEqual([])
    // the same row WITH coordinates is admitted -> it is a card name -> its brand is kept
    const admitted = { location: 'Hà Nội', hotel_list: [{ ...rejected.hotel_list[0], lat: 21.0245, lng: 105.8572 }] }
    expect(cardNames(stayRecommendations(admitted))).toEqual(['Hilton Garden Inn Hà Nội'])
    expect([...luxuryKeepBrands(cardNames(stayRecommendations(admitted)))]).toEqual(['hilton'])
  })
})

describe('filterLuxuryBrands with a keep set', () => {
  it('a kept brand stays, every other brand is renamed, a URL is untouched', () => {
    const text = `**Mình chọn: ${NAME}**. Còn Pullman thì vượt ngân sách. Xem https://www.pullman.example/novotel`
    expect(filterLuxuryBrands(text, new Set(['novotel']))).toBe(`**Mình chọn: ${NAME}**. Còn khách sạn thì vượt ngân sách. Xem https://www.pullman.example/novotel`)
  })
  it('the lower-case spelling of a kept brand stays too', () => {
    expect(filterLuxuryBrands('ăn ở novotel hay pullman', new Set(['novotel']))).toBe('ăn ở novotel hay khách sạn')
  })
  it('an empty keep set renames every brand, exactly as without one', () => {
    const text = `Mình chọn: ${NAME}, gần Pullman.`
    expect(filterLuxuryBrands(text, new Set())).toBe(filterLuxuryBrands(text))
    expect(filterLuxuryBrands(text, new Set())).toBe('Mình chọn: The Square - khách sạn Saigon Centre, gần khách sạn.')
  })
})

describe('applyLuxuryStreamFilter with a keep getter (read when each text frame passes)', () => {
  it('keeps the candidate brand in text frames, renames the rest, leaves card and tool frames untouched', async () => {
    const card = `8:${JSON.stringify([{ kind: 'tappy.places.v1', items: [{ name: NAME }] }])}`
    const tool = `a:${JSON.stringify({ toolCallId: 't1', result: { results: [{ name: NAME }] } })}`
    const body = [tool, card, `0:${JSON.stringify(`Mình chọn ${NAME}, không phải Pullman.`)}`, 'd:{"finishReason":"stop"}'].join('\n') + '\n'
    const out = await applyLuxuryStreamFilter(new Response(body), () => luxuryKeepBrands([NAME])).text()
    const lines = out.split('\n').filter(Boolean)
    expect(lines[0]).toBe(tool)
    expect(lines[1]).toBe(card)
    expect(JSON.parse(lines[2].slice(2))).toBe(`Mình chọn ${NAME}, không phải khách sạn.`)
  })
  it('the getter is read per frame: a frame that passes before the candidates exist is renamed (the O1 gap, unit level)', async () => {
    let keep = new Set<string>()
    const enc = new TextEncoder()
    let feed!: ReadableStreamDefaultController<Uint8Array>
    const res = applyLuxuryStreamFilter(new Response(new ReadableStream<Uint8Array>({ start(c) { feed = c } })), () => keep)
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    feed.enqueue(enc.encode(`0:${JSON.stringify('Tìm trong Novotel nhé. ')}\n`))
    const first = dec.decode((await reader.read()).value)
    keep = luxuryKeepBrands([NAME])
    feed.enqueue(enc.encode(`0:${JSON.stringify(`Mình chọn ${NAME}.`)}\n`))
    feed.close()
    let rest = ''
    for (;;) { const r = await reader.read(); if (r.done) break; rest += dec.decode(r.value) }
    expect(JSON.parse(first.trim().slice(2))).toBe('Tìm trong khách sạn nhé. ')
    expect(JSON.parse(rest.trim().slice(2))).toBe(`Mình chọn ${NAME}.`)
  })
})
