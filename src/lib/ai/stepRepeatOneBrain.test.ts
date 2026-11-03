import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stepRepeatGuard } from './stepRepeatGuard'

// Review 30/10 (one brain): after a step that put prose out, the next step's text went through dedupeSentences, which dropped every
// sentence of 20+ characters repeating one said EARLIER IN THE SAME TEXT - a plan that gives the same advice under two days lost the
// second. On one brain only what repeats the text already SENT is dropped (the measured defect: a step re-writing the clarify questions);
// a whole step that repeats the previous one is still dropped, on every route.

async function run(frames: string[], opts?: { oneBrain?: boolean }): Promise<string> {
  const enc = new TextEncoder()
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(frames.join('\n') + '\n')); c.close() } })
  const out = await new Response(src.pipeThrough(stepRepeatGuard(opts))).text()
  return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}
const t = (s: string) => '0:' + JSON.stringify(s)
const stepEnd = 'e:{"finishReason":"tool-calls","isContinued":false}'
const INTRO = 'Mình sẽ tra thời tiết và vài điểm đi chơi ở Đà Lạt cho hai ngày cuối tuần này nhé.'
const ADVICE = 'Nên đặt phòng trước vì cuối tuần khách đông.'
const PLAN = `\n\n### Ngày 1\nĐi hồ Tuyền Lâm buổi sáng. ${ADVICE}\n\n### Ngày 2\nĐi chợ Đà Lạt buổi sáng. ${ADVICE}`
const frames = [t(INTRO), stepEnd, t(PLAN), 'd:{"finishReason":"stop"}']

describe('stepRepeatGuard · one brain', () => {
  it('advice repeated under two days of the same step stays on one brain', async () => {
    const out = await run(frames, { oneBrain: true })
    expect(out.split(ADVICE).length - 1).toBe(2)
  })
  it('other routes: unchanged - the second copy goes', async () => {
    expect((await run(frames)).split(ADVICE).length - 1).toBe(1)
  })
  it('one brain: a sentence that repeats text already sent is still dropped', async () => {
    const NEW = '### Ngày 1\nSáng đi hồ Tuyền Lâm, trưa ăn lẩu gà lá é, chiều ghé đồi chè Cầu Đất ngắm hoàng hôn.\n\n### Ngày 2\nSáng đi chợ Đà Lạt, trưa ăn bánh căn, chiều cà phê view đồi thông rồi về.'
    const out = await run([t(INTRO), stepEnd, t(`${INTRO}\n\n${NEW}`), 'd:{"finishReason":"stop"}'], { oneBrain: true })
    expect(out.split(INTRO).length - 1).toBe(1)
    expect(out).toContain('Sáng đi chợ Đà Lạt')
  })
  it('the route asks for it on one brain (wiring)', () => {
    const src = readFileSync(join(__dirname, '../../app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('.pipeThrough(stepRepeatGuard({ oneBrain }))')
  })
})
