// Phase 8 — ANSWER BEFORE LOOKUP: what the runtime does with advice written before / next to a lookup (answerFirst.ts + loop.ts).
// The model is scripted, so these prove the CONTRACT THE CODE ENFORCES — the text is preserved, shown first, not duplicated, bounded to one
// check per turn, never run for data tools, never silent when it could not run. They do not show that Luna writes the text; that is
// measured live (UAT-10).
import { describe, it, expect } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { ASK_USER } from './controlTools'
import { ANSWER_FIRST_TOOLS, checkApplies, checkNote, composeFinal, parseCheck, prefaceNote, NOTHING_YET } from './answerFirst'

const UAT10 = 'So sánh hai mẫu điện thoại phù hợp với người ưu tiên pin, camera và dùng lâu dài. Hãy giải thích tiêu chí chọn.'
const CRITERIA = 'Tiêu chí nên cân: pin dùng thực tế (không chỉ dung lượng), camera ở điều kiện thiếu sáng và quay video, và thời gian hỗ trợ cập nhật phần mềm. Đánh đổi: máy pin lớn thường dày hơn; camera tốt hay đi với giá cao.'

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}${toolName}`, toolName, args })),
})

function turn(script: RuntimeStep[], opts: { check?: Array<string | Error>; noCheck?: boolean; deadlineMs?: number; failFinal?: boolean } = {}) {
  const toolRuns: string[] = []
  const checks: Array<{ system: string; messages: unknown[] }> = []
  const modelSeen: Array<{ system: string; messages: unknown[]; final: boolean }> = []
  const fake = (name: string) => ({ execute: async () => { toolRuns.push(name); return { results: [{ title: 'r', link: 'https://x.example/a', snippet: 's' }] } } })
  const checkScript = [...(opts.check ?? [])]
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: UAT10 }],
    tools: { web_search: fake('web_search'), search_products: fake('search_products'), get_gold_price: fake('get_gold_price'), search_places: fake('search_places') } as never,
    schemas: { web_search: {}, search_products: {}, get_gold_price: {}, search_places: {}, [ASK_USER]: {} },
    callModel: async o => {
      modelSeen.push({ system: o.system, messages: JSON.parse(JSON.stringify(o.messages)), final: o.final })
      if (opts.failFinal && o.final) throw new Error('final step failed')
      return script.shift() ?? step(o.final ? 'Câu trả lời cuối.' : 'Mặc định.')
    },
    ...(opts.noCheck ? {} : {
      answerFirstModel: async o => {
        checks.push({ system: o.system, messages: JSON.parse(JSON.stringify(o.messages)) })
        const next = checkScript.shift()
        if (next instanceof Error) throw next
        return { text: next ?? NOTHING_YET, usd: 0.0002, promptTokens: 20, completionTokens: 30 }
      },
    }),
    deadlineAt: Date.now() + (opts.deadlineMs ?? 85_000), lang: 'vi',
    trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
  }
  return { input, toolRuns, checks, modelSeen }
}

describe('answerFirst.ts — pure parts', () => {
  it('the check applies only to advice-type research tools, never to data tools', () => {
    expect([...ANSWER_FIRST_TOOLS].sort()).toEqual(['read_page', 'search_products', 'web_search'])
    expect(checkApplies(['web_search'])).toBe(true)
    expect(checkApplies(['web_search', 'search_products'])).toBe(true)
    for (const data of ['search_places', 'get_hotel_prices', 'get_flight_prices', 'get_trip_data', 'get_weather', 'get_gold_price', 'get_news', 'get_now_showing', 'get_movie_showtimes']) {
      expect(checkApplies([data]), data).toBe(false)
      expect(checkApplies(['web_search', data]), `web_search+${data}`).toBe(false)
    }
    expect(checkApplies([])).toBe(false)
  })
  it('parseCheck: NOTHING_YET (any case / punctuation) and empty are "nothing"; real text is kept; a stray sentinel is cut out', () => {
    for (const none of ['NOTHING_YET', ' nothing_yet. ', 'NOTHING YET', '', '   ', 'NOTHING_YET — chưa có gì']) expect(parseCheck(none), JSON.stringify(none)).toBeNull()
    expect(parseCheck(CRITERIA)).toBe(CRITERIA)
    expect(parseCheck(`${CRITERIA} NOTHING_YET`)).toBe(CRITERIA)
  })
  it('checkNote names the lookup and forbids concrete products / prices / specs in the pre-lookup text; prefaceNote forbids repeating it', () => {
    const n = checkNote([{ toolName: 'web_search', args: { queries: ['pin camera điện thoại 2026'] } }], 'vi')
    expect(n).toContain('web_search("pin camera điện thoại 2026")')
    expect(n).toMatch(/TUYỆT ĐỐI không nêu tên sản phẩm/)
    expect(n).toContain(NOTHING_YET)
    expect(prefaceNote('vi')).toMatch(/Đừng lặp lại/)
    expect(checkNote([], 'en')).toMatch(/Do NOT name specific products/)
  })
  it('composeFinal: prefaces first, then the final text; a preface the final text already contains is not shown twice; nothing else is dropped', () => {
    expect(composeFinal([CRITERIA], 'Sau tra cứu: A và B.')).toBe(`${CRITERIA}\n\nSau tra cứu: A và B.`)
    expect(composeFinal([CRITERIA], `${CRITERIA}\n\nSau tra cứu: A và B.`)).toBe(`${CRITERIA}\n\nSau tra cứu: A và B.`)
    expect(composeFinal([], 'Chỉ cuối.')).toBe('Chỉ cuối.')
    expect(composeFinal(['Một.', 'Hai.'], '')).toBe('Một.\n\nHai.')
  })
})

describe('loop — UAT-10 shape: lookup-only first step with no text', () => {
  it('the check writes the criteria → they are kept, shown BEFORE the post-lookup answer, the lookup still runs once; 3 model calls, 1 tool call', async () => {
    const t = turn([step('', [['web_search', { queries: ['điện thoại pin camera hỗ trợ cập nhật lâu dài 2026'] }]]), step('Sau tra cứu: hai ứng viên đã xác minh là X và Y [S1].')], { check: [CRITERIA] })
    const run = await runAgentRuntime(t.input)
    expect(run.answerFirst).toBe('provided')
    expect(run.status).toBe('answered')
    expect(run.text).toBe(`${CRITERIA}\n\nSau tra cứu: hai ứng viên đã xác minh là X và Y [S1].`)
    expect([run.modelCalls, run.toolCalls, t.toolRuns]).toEqual([3, 1, ['web_search']])
    expect(t.checks).toHaveLength(1)
    // the check sees the conversation BEFORE the tool call (no dangling tool-call without a result) and is told which lookup it chose
    expect(JSON.stringify(t.checks[0].messages)).not.toContain('tool-call')
    expect(t.checks[0].system).toContain('web_search("điện thoại pin camera hỗ trợ cập nhật lâu dài 2026")')
    // the next model step reads its own preface in the history and is told not to repeat it
    const second = t.modelSeen[1]
    expect(JSON.stringify(second.messages)).toContain('Tiêu chí nên cân')
    expect(second.system).toContain('Đừng lặp lại nó')
  })

  it('the check says NOTHING_YET → the lookup goes on, nothing is prepended, and the run records that it was checked', async () => {
    const t = turn([step('', [['web_search', { queries: ['giá vé tàu hôm nay'] }]]), step('Giá hôm nay: …')], { check: ['NOTHING_YET'] })
    const run = await runAgentRuntime(t.input)
    expect([run.answerFirst, run.text, run.modelCalls, t.toolRuns]).toEqual(['nothing_yet', 'Giá hôm nay: …', 3, ['web_search']])
  })

  it('bounded: ONE check per turn — a second lookup round does not check again', async () => {
    const t = turn([step('', [['web_search', { queries: ['a'] }]]), step('', [['search_products', { query: 'b' }]]), step('Xong.')], { check: [CRITERIA, CRITERIA] })
    const run = await runAgentRuntime(t.input)
    expect([t.checks.length, run.toolCalls, run.modelCalls]).toEqual([1, 2, 4])
    expect(run.text).toBe(`${CRITERIA}\n\nXong.`)
  })

  it('bounded even when the first check found nothing: a later lookup round is not checked again (≤ 1 extra model call per turn)', async () => {
    const t = turn([step('', [['web_search', { queries: ['a'] }]]), step('', [['search_products', { query: 'b' }]]), step('Xong.')], { check: ['NOTHING_YET', CRITERIA] })
    const run = await runAgentRuntime(t.input)
    expect([t.checks.length, run.answerFirst, run.text, run.modelCalls]).toEqual([1, 'nothing_yet', 'Xong.', 4])
  })

  it('a check that fails never blocks the lookup: recorded as failed, the answer is delivered', async () => {
    const t = turn([step('', [['web_search', { queries: ['a'] }]]), step('Có kết quả.')], { check: [new Error('boom')] })
    const run = await runAgentRuntime(t.input)
    expect([run.answerFirst, run.status, run.text, run.toolCalls]).toEqual(['failed', 'answered', 'Có kết quả.', 1])
  })

  it('without a check available (model seam) a lookup-only, text-less first step is RECORDED as not_checked — never silently treated as satisfied', async () => {
    const t = turn([step('', [['web_search', { queries: ['a'] }]]), step('Có kết quả.')], { noCheck: true })
    const run = await runAgentRuntime(t.input)
    expect(run.answerFirst).toBe('not_checked')
    expect(run.text).toBe('Có kết quả.')
  })

  it('no check when the time left cannot afford one', async () => {
    const t = turn([step('', [['web_search', { queries: ['a'] }]]), step('Có kết quả.')], { check: [CRITERIA], deadlineMs: 20_000 })
    const run = await runAgentRuntime(t.input)
    expect(t.checks).toHaveLength(0)
    expect(run.text).toBe('Có kết quả.')
  })
})

describe('loop — the check is NOT forced on data requests', () => {
  for (const data of ['get_gold_price', 'search_places'] as const) {
    it(`first step = ${data}: 0 checks, 2 model calls, answer is just the final text`, async () => {
      const t = turn([step('', [[data, {}]]), step('Kết quả.')], { check: [CRITERIA] })
      const run = await runAgentRuntime(t.input)
      expect([t.checks.length, run.modelCalls, run.answerFirst, run.text]).toEqual([0, 2, 'n/a', 'Kết quả.'])
    })
  }
  it('a direct answer or an ask never triggers the check', async () => {
    const a = turn([step('Pin lithium-ion chai vì …')], { check: [CRITERIA] })
    expect([(await runAgentRuntime(a.input)).modelCalls, a.checks.length]).toEqual([1, 0])
    const k = turn([step('', [[ASK_USER, { question: 'Bạn đặt bàn ở đâu', choices: ['Q1', 'Q3'] }]])], { check: [CRITERIA] })
    const run = await runAgentRuntime(k.input)
    expect([run.status, k.checks.length, run.toolCalls]).toEqual(['asked', 0, 0])
  })
})

describe('loop — text the model itself writes next to a tool call or an ask is no longer thrown away', () => {
  it('text + tool call in one response: kept first, no check needed, not duplicated if the final repeats it', async () => {
    const t = turn([step(CRITERIA, [['web_search', { queries: ['a'] }]]), step('Sau tra cứu: X và Y.')], { check: ['SHOULD NOT BE ASKED'] })
    const run = await runAgentRuntime(t.input)
    expect([t.checks.length, run.answerFirst, run.text]).toEqual([0, 'with_step', `${CRITERIA}\n\nSau tra cứu: X và Y.`])
    const t2 = turn([step(CRITERIA, [['web_search', { queries: ['a'] }]]), step(`${CRITERIA} Và hai máy: X, Y.`)])
    const run2 = await runAgentRuntime(t2.input)
    expect(run2.text.match(/Tiêu chí nên cân/g)).toHaveLength(1)
  })
  it('text + ask_user in one response: the advice comes first, the single question closes the reply', async () => {
    const t = turn([step(CRITERIA, [[ASK_USER, { question: 'Bạn dùng iPhone hay Android', choices: ['iPhone', 'Android'] }]])])
    const run = await runAgentRuntime(t.input)
    expect(run.status).toBe('asked')
    expect(run.text.startsWith(CRITERIA)).toBe(true)
    expect(run.text).toContain('Bạn dùng iPhone hay Android?')
    expect(run.text.indexOf('Tiêu chí')).toBeLessThan(run.text.indexOf('Bạn dùng'))
  })
  it('the advice survives a failed final step (model error after the lookup): the user gets the criteria, not the generic apology', async () => {
    const t = turn([step('', [['web_search', { queries: ['a'] }]]), step('', [['web_search', { queries: ['b'] }]])], { check: [CRITERIA], failFinal: true, noCheck: false })
    // force the final step to fail by exhausting tool budget
    t.input.limits = { maxToolCalls: 2 }
    const run = await runAgentRuntime(t.input)
    expect(run.text).toContain('Tiêu chí nên cân')
    expect(run.text).not.toMatch(/Xin lỗi, mình chưa trả lời được/)
  })
})
