// @vitest-environment node
// Phase 8 M7 — Luna owns what to caution about on TAPPY_AGENT=2. The legacy situation frame reads the conversation on its own (it does
// not know the task state) and its "no evidence about <gap>" / budget heads-ups were appended under the agent's reply — measured SR-G1:
// the user replaced "yên tĩnh" with "gần biển" and code still wrote "chưa thấy bằng chứng về yên tĩnh". Real stream filter, no network.
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'

const REPLY = 'Vậy mình ưu tiên gần biển. **M Hotel Da Nang** trên đường Võ Nguyên Giáp là lựa chọn nên xem trước.'

async function settle(runtimeV2: boolean, reply = REPLY): Promise<string> {
  const c = createEnrichmentCollector('Thật ra mình quan tâm gần biển hơn là yên tĩnh', ['Tìm khách sạn ở Đà Nẵng', 'Mình muốn chỗ yên tĩnh hơn'])
  c.agentMode = true
  if (runtimeV2) c.semanticRanking = true
  // The legacy frame still carries the dropped "quiet" gap and a budget with no priced row.
  c.setConsultativeV1({ on: true, rendersCard: true, namedRefetch: [], referenced: [], carried: [], hardGaps: ['quiet'], budgetGap: true, budget: null, priorTimes: [] } as never)
  const lines = [`0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
  const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, 'Thật ra mình quan tâm gần biển hơn là yên tĩnh', true).body).text()
  return raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('M7 · cautions belong to Luna on the agent runtime', () => {
  it('TAPPY_AGENT=2: no code-written heads-up from the legacy frame (stale "yên tĩnh", budget line)', async () => {
    const out = await settle(true)
    expect(out).not.toMatch(/chưa thấy bằng chứng về/)
    expect(out).not.toMatch(/Kết quả chưa có mức giá/)
    expect(out).toContain('M Hotel Da Nang')
  })
  it('contrast — the Phase 7 agent (TAPPY_AGENT=1) keeps its heads-up unchanged', async () => {
    const out = await settle(false)
    expect(out).toMatch(/chưa thấy bằng chứng về/)
  })
})

describe('M7 · the agent\'s own honest hedge is not deleted as an atmosphere claim (measured M7 eval SR-F1 / SR-G1)', () => {
  it('"chưa xác minh được … yên tĩnh" and "mình ưu tiên … bỏ tiêu chí yên tĩnh" survive on TAPPY_AGENT=2; an unsupported claim still goes', async () => {
    const { guardAtmosphereClaims } = await import('@/lib/ai/consultative/reviewAttributes')
    const names = ['The Workshop Coffee']
    const hedge = 'Mình chưa xác minh được quán nào thật sự yên tĩnh, nên bạn gọi hỏi trước. Thử **The Workshop Coffee** trước.'
    expect(guardAtmosphereClaims(hedge, { attrs: new Map(), names, gapAttributes: ['quiet'], agentHedges: true }).text).toContain('chưa xác minh được quán nào thật sự yên tĩnh')
    const priority = 'Vậy mình ưu tiên gần biển và bỏ tiêu chí yên tĩnh. **The Workshop Coffee** gần hơn.'
    expect(guardAtmosphereClaims(priority, { attrs: new Map(), names, gapAttributes: ['quiet'], agentHedges: true }).text).toContain('bỏ tiêu chí yên tĩnh')
    // A real (unsupported) atmosphere claim is judged exactly as without the flag: the exemption covers hedges, not claims.
    const claim = 'Thử **The Workshop Coffee** trước. Quán rất yên tĩnh, hợp ngồi làm việc lâu.'
    const withFlag = guardAtmosphereClaims(claim, { attrs: new Map(), names, gapAttributes: ['quiet'], agentHedges: true })
    const without = guardAtmosphereClaims(claim, { attrs: new Map(), names, gapAttributes: ['quiet'] })
    expect(withFlag).toEqual(without)
    expect(withFlag.removed).toBeGreaterThan(0)
  })
  it('contrast — without the agent flag (legacy / Phase 7) the guard behaves as before', async () => {
    const { guardAtmosphereClaims } = await import('@/lib/ai/consultative/reviewAttributes')
    const hedge = 'Mình chưa xác minh được quán nào thật sự yên tĩnh, nên bạn gọi hỏi trước. Thử **The Workshop Coffee** trước.'
    expect(guardAtmosphereClaims(hedge, { attrs: new Map(), names: ['The Workshop Coffee'], gapAttributes: ['quiet'] }).removed).toBe(1)
  })
})

describe('M7 · the hedge exemption is wired to the agent runtime only (real settle path)', () => {
  const HEDGE = 'Mình chưa xác minh được chỗ nào thật sự yên tĩnh, nên bạn gọi hỏi trước khi đặt. Thử **M Hotel Da Nang** trước.'
  it('TAPPY_AGENT=2 keeps the honest hedge; the Phase 7 agent path behaves as before (the guard removes it)', async () => {
    expect(await settle(true, HEDGE)).toContain('chưa xác minh được chỗ nào thật sự yên tĩnh')
    expect(await settle(false, HEDGE)).not.toContain('chưa xác minh được chỗ nào thật sự yên tĩnh')
  })
})
