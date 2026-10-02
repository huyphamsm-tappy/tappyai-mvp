import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routeConsult } from './consultRouter'
import { askAreaOf } from '@/lib/structuredContent/askCardModel'

// Owner 2026-10-01 item 4: «ăn phở Bắc tối nay» showed «Chuyến đi thế nào đây?» on Android because the router sent the dish
// variant question with id `style` and the shared client logic reads that as travel. Both apps port askAreaOf 1:1, so the
// fix is server-side: the id of every ask must put the card in the area the conversation is in.
const items: Array<{ text: string; domain: string }> = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'intentEveryday.vi.json'), 'utf8')).items

// 'main' is the neutral card («Tìm gì cho bạn hôm nay?») — never wrong; a DIFFERENT area's title is the bug.
// «ăn tối rồi đi hát» is a two-area request: the router leads with the food question, so a food card is right.
const MIXED = new Set(['ăn tối rồi đi hát'])
describe('ask card area = conversation area (first turn of the 103 everyday requests)', () => {
  for (const hasGps of [true, false]) {
    it(`every ask lands in its own area (gps=${hasGps})`, () => {
      const wrong: string[] = []
      let asks = 0
      for (const it of items) {
        if (MIXED.has(it.text)) continue
        const d = routeConsult([{ role: 'user', content: it.text }], { hasGps, lang: 'vi' }).decision
        if (d.turn !== 'ask' || !d.ask) continue
        asks++
        const area = askAreaOf(d.ask.questions)
        if (area !== it.domain && area !== 'main') wrong.push(`${it.text} → ${area} (want ${it.domain}) ids=${d.ask.questions.map(q => q.id)}`)
      }
      expect(asks).toBeGreaterThan(40)
      expect(wrong).toEqual([])
    })
  }
  it('the reported case: a Northern pho ask is a FOOD card', () => {
    const d = routeConsult([{ role: 'user', content: 'ăn phở Bắc tối nay' }], { hasGps: true, lang: 'vi' }).decision
    expect(d.turn).toBe('ask')
    expect(askAreaOf(d.ask!.questions)).toBe('food')
  })
})
