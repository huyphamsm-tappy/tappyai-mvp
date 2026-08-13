import { describe, it, expect } from 'vitest'
import { countClarificationQuestions } from '@/lib/ai/clarification'

// ── C2.1 refinement probe ────────────────────────────────────────────────────
//
// Needs a server on TAPPY_BASE_URL (default http://localhost:3100):
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/refinementProbe.test.ts --disable-console-intercept
//
// Asserts the two things C2 promised and C2.1 had to prove behaviourally:
//   1. a refinement keeps the task instead of restarting it, and
//   2. it asks AT MOST ONE clarification — counted with the tested counter, not
//      by grepping "?" (which scored a parenthetical rephrasing as two and
//      produced the original false failure).

const MEASURE = process.env.TAPPY_MEASURE === '1'
const BASE = process.env.TAPPY_BASE_URL ?? 'http://localhost:3100'

async function ask(messages: Array<{ role: string; content: string }>) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  let text = ''
  const tools: string[] = []
  let steps = 0
  for (const line of body.split('\n')) {
    if (line.startsWith('0:')) { try { text += JSON.parse(line.slice(2)) as string } catch { /* partial */ } }
    else if (line.startsWith('9:')) { try { tools.push((JSON.parse(line.slice(2)) as { toolName: string }).toolName) } catch { /* */ } }
    else if (line.startsWith('e:')) steps++
  }
  return { text: text.trim(), tools, steps }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const CASES: Array<{ lang: string; first: string; refine: string; keeps: RegExp; topic: RegExp }> = [
  { lang: 'vi', first: 'Tìm khách sạn ở Đà Nẵng', refine: 'Rẻ hơn.', keeps: /đà nẵng|da nang/i, topic: /khách sạn|homestay|resort|hotel/i },
  { lang: 'vi', first: 'Tìm khách sạn ở Đà Nẵng', refine: 'Gần biển.', keeps: /đà nẵng|da nang/i, topic: /khách sạn|homestay|resort|hotel|biển/i },
  { lang: 'vi', first: 'Gợi ý quán ăn ngon ở Quận 1', refine: 'Đổi sang quận 3.', keeps: /quận 3|quan 3/i, topic: /quán|nhà hàng|ăn/i },
  { lang: 'en', first: 'Find hotels in Da Nang', refine: 'Cheaper.', keeps: /da nang|đà nẵng/i, topic: /hotel|homestay|resort|khách sạn/i },
  { lang: 'en', first: 'Find hotels in Da Nang', refine: 'Closer to the beach.', keeps: /da nang|đà nẵng/i, topic: /hotel|homestay|resort|beach|biển/i },
  { lang: 'en', first: 'Suggest good restaurants in District 1 Ho Chi Minh', refine: 'Change to District 3.', keeps: /district 3|quận 3/i, topic: /restaurant|quán|nhà hàng/i },
]

describe.skipIf(!MEASURE)('C2.1 — refinement behaviour', () => {
  it('keeps the task and asks at most one clarification', async () => {
    let violations = 0
    for (const c of CASES) {
      await sleep(2500)
      const first = await ask([{ role: 'user', content: c.first }])
      await sleep(2500)
      const turn = await ask([
        { role: 'user', content: c.first },
        { role: 'assistant', content: first.text },
        { role: 'user', content: c.refine },
      ])

      const q = countClarificationQuestions(turn.text)
      const keptPlace = c.keeps.test(turn.text)
      const keptTopic = c.topic.test(turn.text)
      // "Asked instead of answered" — the actual C2 defect: opening on a question
      // with no options behind it.
      const opensWithQuestion = /^[^.!\n]{0,140}\?/.test(turn.text)
      const ok = q <= 1 && keptPlace && keptTopic && !opensWithQuestion
      if (!ok) violations++

      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${c.lang} "${c.refine.padEnd(22)}" ` +
        `clarifications=${q} keptPlace=${keptPlace} keptTopic=${keptTopic} ` +
        `opensWithQuestion=${opensWithQuestion} llm=${turn.steps} tool=${turn.tools.length}`,
      )
      if (!ok) console.log(`      ${JSON.stringify(turn.text.replace(/\s+/g, ' ').slice(0, 200))}`)

      expect(q, `"${c.refine}" asked ${q} clarifications`).toBeLessThanOrEqual(1)
      expect(keptPlace, `"${c.refine}" lost the place`).toBe(true)
      expect(keptTopic, `"${c.refine}" lost the topic`).toBe(true)
    }
    console.log(`\n  ${CASES.length - violations}/${CASES.length} refinement turns fully compliant`)
  }, 600_000)
})
