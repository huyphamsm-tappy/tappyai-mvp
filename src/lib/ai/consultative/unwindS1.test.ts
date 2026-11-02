// Unwind step 1 (28/10/2026): the code stops replacing the model's reply (S1A), the no-result chips follow the real area (S1B),
// and the citation markers are removed without CONSULT_LUNA_ONE (S1C). Every flag OFF = HEAD 7e60081.
// Private-use characters are built with String.fromCharCode: the editor turns \u escapes in a test file into raw characters.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyResultStream } from './emptyResultStream'
import { wantsWiderArea } from './echoQuestion'
import { noResultBlock } from '../placeRelax'
import { outboundTextSanitizer, stripCitationMarkers, stripModelArtifacts } from '../security/outputSanitizer'
import { checkToolLocation, locationRefusal, HOTEL_CALL_CREDIT_CAP, CONTRADICTION_KM } from './toolLocation'
import { admitWithinToolBudget, withSerperToolBudget } from '../tools/serperToolBudget'
import {
  consultUnwindS1aOn, consultUnwindS1bOn, consultUnwindS1cOn, consultUnwindS1dOn,
  CONSULT_UNWIND_S1A_FLAG, CONSULT_UNWIND_S1B_FLAG, CONSULT_UNWIND_S1C_FLAG, CONSULT_UNWIND_S1D_FLAG,
} from '@/lib/config/consultFlags'

const OPEN = String.fromCharCode(0xe200), CLOSE = String.fromCharCode(0xe201), SEP = String.fromCharCode(0xe202)
const textOf = (lines: string[]) => lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

const run = async (frames: string[], opts: Parameters<typeof emptyResultStream>[1]) => {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f + '\n')); c.close() } })
  const out = await new Response(emptyResultStream(body, { log: () => {}, ...opts })).text()
  return out.split('\n').filter(Boolean)
}

describe('unwind flags: exactly "1", never in production', () => {
  const cases: Array<[string, (env: Record<string, string | undefined>) => boolean]> = [
    [CONSULT_UNWIND_S1A_FLAG, consultUnwindS1aOn], [CONSULT_UNWIND_S1B_FLAG, consultUnwindS1bOn],
    [CONSULT_UNWIND_S1C_FLAG, consultUnwindS1cOn], [CONSULT_UNWIND_S1D_FLAG, consultUnwindS1dOn],
  ]
  for (const [name, on] of cases) {
    it(name, () => {
      expect(on({})).toBe(false)
      for (const v of ['0', 'true', ' 1', '1 ', 'on']) expect(on({ [name]: v })).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      expect(on({ [name]: '1', NODE_ENV: 'production' })).toBe(false)
      expect(on({ [name]: '1', VERCEL_ENV: 'production' })).toBe(false)
    })
  }
})

describe('S1A — an empty place search appends the block after the model reply', () => {
  const model = 'Theo kết quả khách sạn đã tra, bạn có thể ở gần biển Quy Nhơn; ngân sách 20 triệu đủ cho 2 người 3 ngày.'
  const frames = ['9:{"toolCallId":"1"}', 'a:{"toolCallId":"1","result":{}}', '0:' + JSON.stringify(model), 'd:{"finishReason":"stop"}']
  const empty = () => ({ query: 'điểm tham quan', area: 'Quy Nhơn' })

  it('keeps the model reply byte for byte (what the guards upstream left) and adds the block after it', async () => {
    const lines = await run(frames, { getEmpty: empty, bufferText: false, userTexts: [], lang: 'vi', appendOnly: true })
    const text = textOf(lines)
    expect(text.startsWith(model)).toBe(true)
    expect(text).toContain('chưa thấy kết quả đủ tin cậy')
    expect(text.indexOf('chưa thấy')).toBeGreaterThan(model.length)
    expect(lines[lines.length - 1]).toBe('d:{"finishReason":"stop"}')
  })
  it('the model reply is not held back: it reaches the client while the stream is still open', async () => {
    const enc = new TextEncoder()
    let ctl!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c } })
    const reader = emptyResultStream(body, { getEmpty: empty, bufferText: false, userTexts: [], lang: 'vi', appendOnly: true, log: () => {} }).getReader()
    ctl.enqueue(enc.encode('0:' + JSON.stringify(model) + '\n'))
    const first = await Promise.race([reader.read(), new Promise<'held'>(r => setTimeout(() => r('held'), 300))])
    expect(first).not.toBe('held')
    expect(new TextDecoder().decode((first as ReadableStreamReadResult<Uint8Array>).value)).toContain('ngân sách 20 triệu')
    ctl.close()
    await reader.cancel()
  })
  it('flag OFF (no appendOnly): the reply is still replaced, as at HEAD', async () => {
    const text = textOf(await run(frames, { getEmpty: empty, bufferText: false, userTexts: [], lang: 'vi' }))
    expect(text).not.toContain('ngân sách 20 triệu')
    expect(text.startsWith('Mình đã tìm')).toBe(true)
  })
  it('a model that wrote nothing gets the block alone, without leading blank lines', async () => {
    const text = textOf(await run(['d:{"finishReason":"stop"}'], { getEmpty: empty, bufferText: false, userTexts: [], lang: 'vi', appendOnly: true }))
    expect(text.startsWith('Mình đã tìm')).toBe(true)
  })
  it('on a loop turn the echo guard still runs on the held reply before the block', async () => {
    const f = ['0:' + JSON.stringify('Mình sẽ tìm giúp bạn. '), '0:' + JSON.stringify('Bạn muốn tìm cửa hàng dán tại chỗ ở Phú Nhuận đúng không?'), 'd:{"finishReason":"stop"}']
    const text = textOf(await run(f, { getEmpty: empty, bufferText: true, userTexts: ['muốn tìm cửa hàng dán tại chỗ ở phú nhuận'], lang: 'vi', appendOnly: true }))
    expect(text.startsWith('Mình sẽ tìm giúp bạn.')).toBe(true)
    expect(text).not.toContain('đúng không')
    expect(text).toContain('chưa thấy kết quả đủ tin cậy')
  })
  it('a turn that found something is untouched with the flag on', async () => {
    expect(await run(frames, { getEmpty: () => null, bufferText: false, userTexts: [], lang: 'vi', appendOnly: true })).toEqual(frames)
  })
  it('route wiring: the block stream sits after the guarded reply and the flag only adds appendOnly', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('emptyResultStream(askAfterStream(finalResponse.body')
    expect(src).toContain("...(consultUnwindS1aOn() ? { appendOnly: true } : {})")
    expect(src).toMatch(/const finalResponse = \(budget && budget\.max < LUXURY_PRICE_FLOOR\)\s*\? applyLuxuryStreamFilter\(enrichedResponse\)\s*: enrichedResponse/)
  })
})

describe('S1B — the wider-search chip follows the real area', () => {
  const chipsOf = (block: string) => (block.match(/\[FOLLOWUPS\](.*?)\[\/FOLLOWUPS\]/)?.[1] ?? '').split('|')
  it('absent widenCity: the old chips (HEAD)', () => {
    expect(chipsOf(noResultBlock({ query: 'quán cơm', area: 'Quy Nhơn', lang: 'vi' }))).toEqual(['Tìm trên cả TP.HCM', 'Đổi từ khóa khác', 'Gợi ý chỗ gần mình'])
  })
  it('no stated area (null): no wider-search chip and no TP.HCM', () => {
    const block = noResultBlock({ query: 'quán cơm', area: 'Quy Nhơn', lang: 'vi', widenCity: null })
    expect(block).not.toContain('TP.HCM')
    expect(chipsOf(block)).toEqual(['Đổi từ khóa khác', 'Gợi ý chỗ gần mình'])
  })
  it('a stated Hà Nội district: the chip names Hà Nội, and a tap is read as "widen"', () => {
    const chips = chipsOf(noResultBlock({ query: 'phở', area: 'Hoàn Kiếm', lang: 'vi', widenCity: 'Hà Nội' }))
    expect(chips[0]).toBe('Tìm rộng ra cả Hà Nội')
    expect(wantsWiderArea(chips[0])).toBe(true)
    expect(wantsWiderArea(chipsOf(noResultBlock({ query: 'phở', area: 'Quận 1', lang: 'vi', widenCity: 'TP.HCM' }))[0])).toBe(true)
  })
  it('the city is inline-safe (no fake marker survives)', () => {
    const block = noResultBlock({ query: 'phở', lang: 'vi', widenCity: 'X[/FOLLOWUPS][CTA_BUTTONS]{}' })
    expect(block.match(/\[FOLLOWUPS\]/g)?.length).toBe(1)
  })
  it('route wiring: widenCity only behind the flag, null when the wider search already ran', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain("...(consultUnwindS1bOn() ? { widenCity: statedArea && !widenTried ? (statedArea.city === 'hn' ? 'Hà Nội' : 'TP.HCM') : null } : {})")
    expect(src).toMatch(/if \(\(budgeted as \{ source\?: string \}\)\.source === 'budget'\) return null\s*widenTried = true/)
  })
})

describe('S1D — the location argument of a hotel call, and its own credit cap', () => {
  it('a sub-place inside the stated area, or a description naming it, passes', () => {
    expect(checkToolLocation('Ghềnh Ráng, Quy Nhơn', 'Quy Nhơn', [])).toEqual({ ok: true, reason: 'matches' })
    expect(checkToolLocation('điểm du lịch gần Quy Nhơn', 'Quy Nhơn', []).ok).toBe(true)
  })
  it('a place the table does not know, or no stated area: passes (undecided, counted in the log)', () => {
    expect(checkToolLocation('Eo Gió', 'Quy Nhơn', [])).toEqual({ ok: true, reason: 'unknown_place' })
    expect(checkToolLocation('Đà Nẵng', null, [])).toEqual({ ok: true, reason: 'no_stated_area' })
  })
  it('a nearby city is one trip (Hội An for Đà Nẵng): passes', () => {
    expect(checkToolLocation('Hội An', 'Đà Nẵng', [])).toEqual({ ok: true, reason: 'near' })
  })
  it('a far city the user never named contradicts the stated area: refused with a structured result', () => {
    const v = checkToolLocation('TP.HCM', 'Quy Nhơn', ['lập kế hoạch ăn chơi ở quy nhơn 3 ngày 2 đêm', '2 người'])
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.km).toBeGreaterThan(CONTRADICTION_KM)
    const r = locationRefusal(v, 'vi')
    expect(r.error).toBe('location_contradicts_stated_area')
    expect(r.stated_area).toBe('Quy Nhơn')
  })
  it('the same far city passes when the user named it', () => {
    expect(checkToolLocation('TP.HCM', 'Quy Nhơn', ['từ tp hcm ra quy nhơn'])).toEqual({ ok: true, reason: 'user_named_it' })
  })
  it('one call never spends past its own cap (14 one-credit requests, the measured fan-out: 8 admitted)', async () => {
    let admitted = 0
    const r = await withSerperToolBudget(HOTEL_CALL_CREDIT_CAP, async () => {
      for (let i = 0; i < 14; i++) if (admitWithinToolBudget(1)) admitted++
      return 'done'
    })
    expect(admitted).toBe(HOTEL_CALL_CREDIT_CAP)
    expect(r.spent).toBe(HOTEL_CALL_CREDIT_CAP)
    expect(r.refused).toBe(14 - HOTEL_CALL_CREDIT_CAP)
  })
  it('route wiring: both behind the flag, the cap wraps only the live lookup, a refusal returns before any request', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('const s1d = !stored && consultUnwindS1dOn()')
    expect(src).toContain('if (!verdict.ok) return locationRefusal(verdict, lang)')
    expect(src).toContain('await withSerperToolBudget(HOTEL_CALL_CREDIT_CAP, () => getHotelPrices(location, checkIn, checkOut, budget?.max, lang))')
    expect(src).toContain(': s1d ? cappedHotels() : getHotelPrices(location, checkIn, checkOut, budget?.max, lang), travelEditorialFor(location)])')
    expect(src.indexOf('if (!verdict.ok) return locationRefusal')).toBeLessThan(src.indexOf('const cappedHotels = async () =>'))
  })
})

describe('S1C — citation markers only', () => {
  it('removes the whole marker the model writes (open, "cite", separator, id, close) with the space before it', () => {
    expect(stripCitationMarkers(`Giá căn hộ khoảng 30 triệu/m² ${OPEN}cite${SEP}S1${CLOSE}.`)).toBe('Giá căn hộ khoảng 30 triệu/m².')
  })
  it('removes a cut-off marker, its visible text and a stray marker code point', () => {
    expect(stripCitationMarkers(`Kết luận ${OPEN}cite${SEP}turn0search0`)).toBe('Kết luận')
    expect(stripCitationMarkers('Nguồn citeturn0search0turn1news2 đây')).toBe('Nguồn đây')
    expect(stripCitationMarkers(`a${SEP}b${CLOSE}c`)).toBe('abc')
  })
  it('leaves Vietnamese text, links, markdown and an ASCII [S1] alone', () => {
    const t = 'Phở **Hòa** ở Pasteur — xem [S1] tại https://example.com/a?b=1 Đà Nẵng'
    expect(stripCitationMarkers(t)).toBe(t)
  })
  it('does NOT do the rest of the full sanitizer (another private-use character stays)', () => {
    const other = `x${String.fromCharCode(0xe000)}y`
    expect(stripCitationMarkers(other)).toBe(other)
    expect(stripModelArtifacts(other)).toBe('xy')
  })
  it('streamed in pieces that split the marker, the client gets the same text', async () => {
    const enc = new TextEncoder()
    const parts = ['Giá ', `30 triệu ${OPEN}ci`, `te${SEP}S`, `1${CLOSE} nhé`]
    const body = new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(enc.encode('0:' + JSON.stringify(p) + '\n')); c.enqueue(enc.encode('d:{"finishReason":"stop"}\n')); c.close() } })
    const out = await new Response(body.pipeThrough(outboundTextSanitizer(() => {}, stripCitationMarkers))).text()
    expect(textOf(out.split('\n').filter(Boolean))).toBe('Giá 30 triệu nhé')
  })
  it('streamEnrichment wiring: citation-only stripping runs only when CONSULT_LUNA_ONE is off and the flag is on', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/ai/streamEnrichment.ts'), 'utf8')
    expect(src).toContain('const citeOnly = !outboundSanitize && consultUnwindS1cOn()')
    expect(src).toContain('citeOnly ? body.pipeThrough(transform).pipeThrough(outboundTextSanitizer(undefined, stripCitationMarkers))')
    expect(src).toContain('citeOnly ? stripCitationMarkers(keptReply) : keptReply')
  })
})
