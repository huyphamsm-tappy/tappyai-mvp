import { describe, it, expect } from 'vitest'
import { askAfterStream, askAfterSentence, endsWithQuestion } from './askAfter'

// Answer first (owner 2026-09-28): the gate's ONE question ends the reply. Measured live before this
// module: "ăn gì ngon giờ" and "massage" ended on the pick with chips only — no question.
const BUDGET = { q: 'Tầm giá?', options: ['dưới 100k/người', '100–200k/người', 'trên 200k/người'] }

const streamOf = (s: string) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(s)); c.close() } })
const read = (s: ReadableStream<Uint8Array>) => new Response(s).text()
const textOf = (raw: string) => raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
const frames = (text: string) => `9:{"toolName":"search_places"}\n${text.match(/[\s\S]{1,50}/g)!.map(p => `0:${JSON.stringify(p)}`).join('\n')}\ne:{"finishReason":"stop"}\nd:{"finishReason":"stop"}\n`

describe('askAfterStream', () => {
  const pick = 'Mình chọn **Quán Ăn Hùng Xíu** — 4.1⭐, cách 1,2 km, mở đến 4 giờ sáng nên hợp ăn khuya.'

  it('the measured reply (pick, no question) gets the one question last, with its chips, before the finish frame', async () => {
    const out = await read(askAfterStream(streamOf(frames(pick)), BUDGET, 'vi', () => {}))
    const text = textOf(out)
    expect(text.startsWith(pick)).toBe(true)
    expect(text).toContain('\n\nBạn muốn tầm giá khoảng bao nhiêu (dưới 100k/người / 100–200k/người / trên 200k/người)?')
    expect(text.endsWith('[FOLLOWUPS]dưới 100k/người|100–200k/người|trên 200k/người[/FOLLOWUPS]')).toBe(true)
    expect(out.trim().split('\n').pop()).toBe('d:{"finishReason":"stop"}')
    expect((text.match(/\?/g) ?? []).length).toBe(1)
  })

  it('a reply that already ends by asking is untouched (never two questions)', async () => {
    const asked = `${pick}\n\nTầm giá vé phim thường khoảng bao nhiêu cho bạn?\n\n[FOLLOWUPS]dưới 100k/vé|100–150k/vé[/FOLLOWUPS]`
    const raw = frames(asked)
    expect(await read(askAfterStream(streamOf(raw), BUDGET, 'vi', () => {}))).toBe(raw)
  })

  it('model chips already present: the question is added, the chips are not duplicated', async () => {
    const withChips = `${pick}\n\n[FOLLOWUPS]foot massage|body massage[/FOLLOWUPS]`
    const text = textOf(await read(askAfterStream(streamOf(frames(withChips)), BUDGET, 'vi', () => {})))
    expect(text.match(/\[FOLLOWUPS\]/g)).toHaveLength(1)
    expect(text.trim().endsWith('?')).toBe(true)
  })

  it('no question for this turn, an error frame, or an empty reply ⇒ unchanged', async () => {
    const raw = frames(pick)
    expect(await read(askAfterStream(streamOf(raw), null, 'vi'))).toBe(raw)
    const errored = '3:"ai_error"\nd:{"finishReason":"error"}\n'
    expect(await read(askAfterStream(streamOf(errored), BUDGET, 'vi', () => {}))).toBe(errored)
  })

  it('sentences: vi / en, budget / party', () => {
    expect(askAfterSentence({ q: 'Mấy người?', options: ['1–2 người'] }, 'vi')).toBe('Bạn đi mấy người (1–2 người)?')
    expect(askAfterSentence({ q: 'Budget?', options: [] }, 'en')).toBe('What budget do you have in mind?')
    expect(endsWithQuestion('Chọn A. Bạn đi mấy người? 😊')).toBe(true)
    expect(endsWithQuestion('Chọn A vì 4.8⭐.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]')).toBe(false)
  })
})
