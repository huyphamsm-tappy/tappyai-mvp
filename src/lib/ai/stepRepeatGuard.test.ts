import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { similarity, dropRepeatedReply, stepRepeatGuard, REPEAT_SIMILARITY } from './stepRepeatGuard'

// UAT3 (2026-09-27): the Android turn-7 reply, verbatim from the stored conversation.
const finding = JSON.parse(readFileSync('docs/uat/evidence/uat3-location-prompt-2026-09-27/finding-duplicated-reply-turn7.json', 'utf8')) as { assistant: string }
const stored = finding.assistant
const splitAt = stored.indexOf('Mình cần biết', 10)
const step1 = stored.slice(0, splitAt)
const step2 = stored.slice(splitAt)

async function run(frames: string[]): Promise<{ text: string; lines: string[] }> {
  const enc = new TextEncoder()
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      // Split mid-line on purpose: a frame must survive crossing a chunk boundary.
      const all = frames.join('\n') + '\n'
      for (let i = 0; i < all.length; i += 37) c.enqueue(enc.encode(all.slice(i, i + 37)))
      c.close()
    },
  })
  const out = await new Response(src.pipeThrough(stepRepeatGuard())).text()
  const lines = out.split('\n').filter(Boolean)
  const text = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  return { text, lines }
}
const t = (s: string) => '0:' + JSON.stringify(s)
const toolCall = '9:{"toolCallId":"c1","toolName":"get_user_memory","args":{}}'
const toolResult = 'a:{"toolCallId":"c1","result":{"ok":true}}'
const stepEnd = 'e:{"finishReason":"tool-calls","isContinued":false}'
const done = 'd:{"finishReason":"stop"}'

describe('similarity', () => {
  it('the two stored versions are the same reply (≥ 80%)', () => {
    expect(similarity(step1, step2)).toBeGreaterThanOrEqual(REPEAT_SIMILARITY)
  })
  it('different replies are not', () => {
    expect(similarity(step1, 'Quán Phở Hòa Pasteur 4.6⭐ cách bạn 1,2 km, giá 60–90k/tô, mở tới 22h. Nếu muốn ăn khuya thì chọn Phở Thìn.')).toBeLessThan(0.3)
  })
})

describe('dropRepeatedReply (buffered reply in one frame)', () => {
  it('the stored turn-7 text collapses to its last version', () => {
    expect(dropRepeatedReply(stored)).toBe(step2)
  })
  it('a reply that only repeats its first words is untouched', () => {
    const r = 'Mình cần biết bạn đang ở khu vực nào để tìm quán ăn ngon gần đó nhé! Quận 1 có Phở Hòa, Quận 3 có Bún bò Gia Hội. Mình cần biết bạn đang ở khu vực nào để lọc thêm theo giá nữa nhé.'
    expect(dropRepeatedReply(r)).toBe(r)
  })
})

describe('stepRepeatGuard (streamed steps)', () => {
  it('step 2 repeating step 1 is dropped; the tool frames and the finish frames still go through', async () => {
    const { text, lines } = await run([t(step1.slice(0, 80)), t(step1.slice(80)), toolCall, stepEnd, toolResult, t(step2.slice(0, 50)), t(step2.slice(50)), stepEnd, done])
    expect(text).toBe(step1)
    expect(lines.some(l => l.startsWith('9:'))).toBe(true)
    expect(lines.some(l => l.startsWith('a:'))).toBe(true)
    expect(lines.filter(l => l.startsWith('e:')).length).toBe(2)
    expect(lines[lines.length - 1].startsWith('d:')).toBe(true)
  })

  it('the stored turn as ONE buffered frame is collapsed to the last version', async () => {
    const { text } = await run([t(stored), done])
    expect(text).toBe(step2)
  })

  it('the normal tool turn (no prose in step 1) streams step 2 untouched and unheld', async () => {
    const answer = 'Mình chọn **Phở Hòa Pasteur** cho bạn — 4.6⭐, cách 1,2 km, mở tới 22h. Muốn ăn khuya thì Phở Thìn Lò Đúc.'
    const { text, lines } = await run([toolCall, stepEnd, toolResult, t(answer.slice(0, 30)), t(answer.slice(30)), done])
    expect(text).toBe(answer)
    // Not held: the first text chunk is still its own frame (it streamed as it arrived).
    expect(lines.filter(l => l.startsWith('0:')).length).toBe(2)
  })

  it('step 2 that ADDS a different answer after a lead-in is kept whole', async () => {
    const lead = 'Để mình tìm quán ngon quanh Quận 1 cho bạn ngay nhé, chờ mình chút xíu — đang tra cứu các quán đang mở cửa!'
    const answer = 'Mình chọn **Phở Hòa Pasteur** cho bạn — 4.6⭐, cách 1,2 km, mở tới 22h. Muốn ăn khuya thì Phở Thìn Lò Đúc.'
    const { text } = await run([t(lead), toolCall, stepEnd, toolResult, t(answer), done])
    expect(text).toBe(lead + answer)
  })

  it('never drops non-text frames, even inside a held step', async () => {
    const annotation = '8:[{"type":"place_decision","v":1}]'
    const { lines } = await run([t(step1), stepEnd, t(step2), annotation, stepEnd, done])
    expect(lines).toContain(annotation)
  })
})
