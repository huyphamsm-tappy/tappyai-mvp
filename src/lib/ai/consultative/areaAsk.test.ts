import { describe, it, expect } from 'vitest'
import { routeConsult } from './consultRouter'
import { areaAskStream, areaAskSentence, areaFromAnswer, isPureAreaAnswer, mergeAreaAnswer, AREA_ASK_VI, AREA_ASK_EN } from './areaAsk'

const enc = new TextEncoder()
const body = (lines: string[]) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(lines.join('\n') + '\n')); c.close() } })
async function run(lines: string[], needed: boolean, lang = 'vi') {
  const logs: Record<string, unknown>[] = []
  const out = await new Response(areaAskStream(body(lines), () => needed, lang, e => logs.push(e))).text()
  const frames = out.split('\n').filter(Boolean)
  const text = frames.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  return { frames, text, logs }
}
const FIN = 'd:{"finishReason":"stop"}'

describe('LOC-DEFAULT-HCM-01 — areaAskStream', () => {
  it('a turn that refused for want of a location ends with the fixed area question, before the finish frame', async () => {
    const r = await run(['0:"Mình chưa có vị trí hiện tại của bạn."', FIN], true)
    expect(r.text).toBe(`Mình chưa có vị trí hiện tại của bạn.\n\n${AREA_ASK_VI}`)
    expect(r.frames[r.frames.length - 1]).toBe(FIN)
    expect(r.logs).toEqual([{ type: 'tappyai_area_ask', appended: true, empty_body: false }])
  })
  it('an EMPTY reply gets the question alone (no leading blank lines)', async () => {
    const r = await run([FIN], true)
    expect(r.text).toBe(AREA_ASK_VI)
    expect(r.logs[0]).toMatchObject({ appended: true, empty_body: true })
  })
  it('English turn → the English sentence', async () => {
    const r = await run(['0:"I could not get your location."', FIN], true, 'en')
    expect(r.text.endsWith(AREA_ASK_EN)).toBe(true)
    expect(areaAskSentence('en')).toBe(AREA_ASK_EN)
    expect(areaAskSentence('vi')).toBe(AREA_ASK_VI)
  })
  it('a turn that did not refuse is untouched, byte for byte', async () => {
    const lines = ['0:"Mình gợi ý **Cà phê Mây**."', '8:[{"x":1}]', FIN]
    const out = await new Response(areaAskStream(body(lines), () => false, 'vi', () => {})).text()
    expect(out).toBe(lines.join('\n') + '\n')
  })
  it('a failed turn (error frame) is never touched', async () => {
    const r = await run(['3:"boom"', FIN], true)
    expect(r.text).toBe('')
    expect(r.logs).toEqual([])
  })
  it('a reply that already carries the sentence gets no second copy', async () => {
    const r = await run([`0:${JSON.stringify(AREA_ASK_VI)}`, FIN], true)
    expect(r.text).toBe(AREA_ASK_VI)
    expect(r.logs[0]).toMatchObject({ appended: false, reason: 'already_said' })
  })
  it('the flag is read at the END of the stream (the tool runs while the reply streams)', async () => {
    let refused = false
    const stream = new ReadableStream<Uint8Array>({
      async start(c) { c.enqueue(enc.encode('0:"x"\n')); await Promise.resolve(); refused = true; c.enqueue(enc.encode(FIN + '\n')); c.close() },
    })
    const out = await new Response(areaAskStream(stream, () => refused, 'vi', () => {})).text()
    expect(out).toContain(JSON.stringify(`\n\n${AREA_ASK_VI}`))
  })
})

describe('LOC-DEFAULT-HCM-01 — areaFromAnswer (only the reply to the area question)', () => {
  const asked = `Mình chưa có vị trí hiện tại của bạn.\n\n${AREA_ASK_VI}`
  it('a city in the reply to the area question', () => {
    expect(areaFromAnswer(asked, 'ở Đà Nẵng')).toBe('Da Nang, Vietnam')
  })
  it('a district → district + its city', () => {
    expect(areaFromAnswer(asked, 'Quận 3')).toBe('Quận 3, TP.HCM')
  })
  it('the English question counts too', () => {
    expect(areaFromAnswer(AREA_ASK_EN, 'in Da Lat')).toBe('Da Lat, Vietnam')
  })
  it('a dish or street named after a city is not that city', () => {
    expect(areaFromAnswer(asked, 'bún bò Huế')).toBeUndefined()
    expect(areaFromAnswer(asked, 'đường Nguyễn Huệ')).toBeUndefined()
  })
  it('no area question before → never an area, whatever the message names', () => {
    expect(areaFromAnswer('Mình gợi ý **Cà phê Mây**.', 'ở Đà Nẵng')).toBeUndefined()
    expect(areaFromAnswer('', 'Cho tôi biết về Bún bò Huế Cô Ba')).toBeUndefined()
    expect(areaFromAnswer(null, 'ở Đà Nẵng')).toBeUndefined()
  })
  it('the reply names no area → undefined', () => {
    expect(areaFromAnswer(asked, 'quán nào cũng được')).toBeUndefined()
  })
})

describe('LOC-DEFAULT-HCM-01 — isPureAreaAnswer (conservative: a word with its own intent keeps the message out)', () => {
  it.each(['ở Đà Nẵng', 'Đà Nẵng', 'Đà Nẵng nhé', 'tại Quận 3', 'Quận 3', 'q3', 'quanh Quận 1, TP.HCM', 'Sài Gòn', 'TP.HCM', 'ở Hà Nội thôi', 'Bình Thạnh', 'in Da Nang'])('area only: %s', t => {
    expect(isPureAreaAnswer(t)).toBe(true)
  })
  it.each([
    'Thôi, tôi muốn đi du lịch Đà Nẵng.', 'đặt vé máy bay đi Đà Nẵng', 'tìm khách sạn ở Đà Nẵng', 'quán phở ở Quận 3', 'đi Đà Nẵng',
    'bún bò Huế', 'đường Nguyễn Huệ', 'View đẹp', 'quán nào cũng được', '', 'Đà Nẵng có gì vui',
  ])('not area only: %s', t => {
    expect(isPureAreaAnswer(t)).toBe(false)
  })
})

describe('LOC-DEFAULT-HCM-01 — what the (unchanged) router decides on the merged thread', () => {
  // The router's own ask card, as the route returned it for "tìm quán cà phê ngon" (locationAreaAsk.route.test.ts, L1) and as the client sends it back.
  const card = 'Để chọn đúng quán cà phê cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"dish","q":"Kiểu quán nào?","options":["Yên tĩnh","View đẹp","Sân vườn","Ngồi làm việc"]}]}[/TAPPY_ASK]\n\nChọn nhanh bên dưới, hoặc gõ thẳng ý bạn — trả lời một phần cũng được.'
  for (const reply of ['ở Đà Nẵng', 'Đà Nẵng', 'Quận 3']) {
    it(`[café request, style card, "View đẹp", area question, "${reply}"] → routed as a café pick`, () => {
      const thread = [
        { role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: card },
        { role: 'user', content: 'View đẹp' }, { role: 'assistant', content: AREA_ASK_VI }, { role: 'user', content: reply },
      ]
      const r = routeConsult(mergeAreaAnswer(thread), { hasGps: false, lang: 'vi' })
      console.log('ROUTE ' + JSON.stringify({ reply, turn: r.decision.turn, domains: r.decision.domains, area: r.decision.area ?? null, confidence: r.confidence }))
      expect(r.decision.domains).toEqual(['food'])
      expect(r.decision.turn).toBe('pick')
    })
  }
})

describe('LOC-DEFAULT-HCM-01 — mergeAreaAnswer (routing view only)', () => {
  const req = { role: 'user', content: 'View đẹp' }
  const ask = { role: 'assistant', content: `Mình chưa có vị trí.\n\n${AREA_ASK_VI}` }
  it('[request, area question, bare area] → one user turn "request area"', () => {
    const before = [{ role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: 'Kiểu quán nào?' }, req, ask, { role: 'user', content: 'ở Đà Nẵng' }]
    const out = mergeAreaAnswer(before)
    expect(out).toEqual([before[0], before[1], { role: 'user', content: 'View đẹp ở Đà Nẵng' }])
    expect(before).toHaveLength(5) // the input is not mutated
  })
  it('the English question counts too', () => {
    const out = mergeAreaAnswer([{ role: 'user', content: 'coffee with a view' }, { role: 'assistant', content: AREA_ASK_EN }, { role: 'user', content: 'in Da Nang' }])
    expect(out).toEqual([{ role: 'user', content: 'coffee with a view in Da Nang' }])
  })
  it('a reply with its own intent is NOT merged (the same array comes back)', () => {
    const before = [req, ask, { role: 'user', content: 'Thôi, tôi muốn đi du lịch Đà Nẵng.' }]
    expect(mergeAreaAnswer(before)).toBe(before)
  })
  it('the previous assistant turn is not the area question → NOT merged', () => {
    const before = [req, ask, { role: 'user', content: 'hỏi thêm' }, { role: 'assistant', content: 'Bạn cứ hỏi.' }, { role: 'user', content: 'ở Đà Nẵng' }]
    expect(mergeAreaAnswer(before)).toBe(before)
  })
  it('non-text content or too short a thread → NOT merged', () => {
    const parts = [req, ask, { role: 'user', content: [{ type: 'text', text: 'ở Đà Nẵng' }] }]
    expect(mergeAreaAnswer(parts)).toBe(parts)
    const short = [ask, { role: 'user', content: 'ở Đà Nẵng' }]
    expect(mergeAreaAnswer(short)).toBe(short)
  })
})
