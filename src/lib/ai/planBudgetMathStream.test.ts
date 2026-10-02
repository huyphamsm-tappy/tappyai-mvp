// @vitest-environment node
// Principle 7 through the REAL stream filter: the code-written budget split survives every guard
// (travel fail-closed, money, snippet price) on a budgeted trip plan (c40 T1 plan block, live).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

const PLAN = readFileSync('src/lib/ai/__fixtures__/tripT1FourDays.live.txt', 'utf8')
const USER = 'Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu'

async function run(reply: string, userText: string, travelIntent: boolean) {
  const collector = createEnrichmentCollector(userText)
  const frames = ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
  const orig = console.log
  console.log = () => {}
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, travelIntent, userText, false)
    const out = await new Response(res.body).text()
    return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  } finally { console.log = orig }
}

describe('budget arithmetic survives the guards', () => {
  it('trip plan with a stated budget → the split line is in the delivered text', async () => {
    const out = await run(`Kế hoạch 3 ngày cho bạn:\n\n${PLAN}\n\n[FOLLOWUPS]Đổi khách sạn|Thêm spa[/FOLLOWUPS]`, USER, true)
    expect(out).toContain('💰 Ngân sách: 6.000.000đ ÷ 2 người = 3.000.000đ/người · ÷ 3 ngày = 1.000.000đ/người/ngày')
  })

  it('no stated budget → no line', async () => {
    const out = await run(`Kế hoạch:\n\n${PLAN}`, 'đi Đà Nẵng 3 ngày 2 đêm', true)
    expect(out).not.toContain('💰 Ngân sách')
  })
})
