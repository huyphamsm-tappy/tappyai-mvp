// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { recordDecision, validateDecision, type RecordedDecision } from './decisionRecord'
import { cardPathTrace, briefRows } from '../../cardPathTrace'

// Round 27: the recorder-level diagnostics that tell the causes of "the prose names venue X, the card shows venue Y" apart. They prove the DIAGNOSTIC can tell the cases
// apart; they do not prove which case happened in chat 81d50b17 turn 1 (that turn had no trace).
const ANSWER = 'Tối nay ở TP.HCM, nếu muốn xõa mà không phải đi bộ nhiều thì MIA TOWN hợp nhất: bida, gaming và khu vui chơi trong nhà. Muốn xem kịch thì cân nhắc Sân Khấu Thế Giới Trẻ — nên kiểm tra suất diễn tối nay trước khi đi.'
const MIA = 'MIA TOWN', SK = 'Sân Khấu Thế Giới Trẻ'
const dec = (picks: string[]): RecordedDecision => ({ picks: picks.map(name => ({ name, why: null, tradeoff: null })), none: false, confidence: 'high' })

async function run(candidates: string[], picks: string[], withDiag = true) {
  const events: Array<Record<string, any>> = []
  const r = await recordDecision({ answer: ANSWER, candidates, extract: async () => dec(picks), ...(withDiag ? { diag: e => events.push(e) } : {}) })
  return { r, events, byStage: (s: string) => events.find(e => e.stage === s)! }
}
const others = (n: number) => Array.from({ length: n }, (_, k) => `Điểm vui chơi số ${k + 1}`)

describe('the recorder diagnostics tell the causes apart', () => {
  it('(1) the prose venue is NOT among the candidates the recorder received: the input lists the candidates, the verdict says "no candidate matches", the other pick survives', async () => {
    const x = await run([SK, ...others(5)], [MIA, SK])
    expect(x.byStage('recorder_input').sent).not.toContain(MIA)
    expect(x.byStage('recorder_input').cut).toEqual([])
    expect(x.byStage('recorder_output').picks).toEqual([MIA, SK])
    expect(x.byStage('recorder_validation').verdicts).toEqual([{ pick: MIA, status: 'no_candidate_matches' }, { pick: SK, status: 'matched', candidate: SK }])
    expect(x.r.contract?.picks.map(p => p.name)).toEqual([SK]) // the historical symptom: one card, and it is not the venue the prose called best
  })
  it('(2) the recorder returned ONE pick although the prose names two and both were offered: the input has both, the output has one', async () => {
    const x = await run([MIA, SK, ...others(3)], [SK])
    expect(x.byStage('recorder_input').sent).toEqual(expect.arrayContaining([MIA, SK]))
    expect(x.byStage('recorder_output').picks).toEqual([SK])
    expect(x.byStage('recorder_validation').verdicts).toEqual([{ pick: SK, status: 'matched', candidate: SK }])
    expect(x.r.contract?.picks.map(p => p.name)).toEqual([SK])
  })
  it('(3) more than 12 candidates: the venue sits beyond the cap — the input shows the total, the 12 sent and the names cut', async () => {
    const list = [...others(12), MIA, SK]
    const x = await run(list, [MIA, SK])
    const inp = x.byStage('recorder_input')
    expect(inp.candidates_total).toBe(14)
    expect(inp.sent_count).toBe(12)
    expect(inp.sent).toEqual(others(12))
    expect(inp.cut).toEqual([MIA, SK])
    expect(x.byStage('recorder_validation').verdicts.map((v: { status: string }) => v.status)).toEqual(['no_candidate_matches', 'no_candidate_matches'])
    expect(x.r.contract?.none).toBe(true)
  })
  it('(4) a returned name that differs from the candidate name: a containing name still matches; an unrelated one does not (the verdict names the candidate it matched)', async () => {
    const x = await run(['MIA TOWN - Khu vui chơi trong nhà', SK], ['Mia Town', 'Mia Land'])
    expect(x.byStage('recorder_validation').verdicts).toEqual([
      { pick: 'Mia Town', status: 'matched', candidate: 'MIA TOWN - Khu vui chơi trong nhà' },
      { pick: 'Mia Land', status: 'no_candidate_matches' },
    ])
  })
  it('a pick the answer never names, and a duplicate pick, are reported as such', async () => {
    const x1 = await run([MIA, SK, 'Vietopia'], ['Vietopia', MIA])
    expect(x1.byStage('recorder_validation').verdicts).toEqual([{ pick: 'Vietopia', status: 'not_named_in_answer', candidate: 'Vietopia' }, { pick: MIA, status: 'matched', candidate: MIA }])
    const x2 = await run([MIA, SK], [MIA, 'mia town'])
    expect(x2.byStage('recorder_validation').verdicts.map((v: { status: string }) => v.status)).toEqual(['matched', 'duplicate'])
  })
  it('a "none" decision and the pick cap are reported', async () => {
    const none = await recordDecision({ answer: ANSWER, candidates: [MIA, SK], extract: async () => ({ picks: [{ name: MIA, why: null, tradeoff: null }], none: true, confidence: 'low' }), diag: () => {} })
    expect(none.contract?.none).toBe(true)
    const report: Array<{ pick: string; status: string }> = []
    const many = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] // MAX_PICKS is 5
    validateDecision(dec(many), many, many.join(' '), report as never)
    expect(report.filter(v => v.status === 'over_max_picks').length).toBeGreaterThan(0)
  })
  it('the diagnostics change nothing: the same contract with and without `diag`, and without `report`', async () => {
    const withDiag = await run([SK, ...others(5)], [MIA, SK], true)
    const without = await run([SK, ...others(5)], [MIA, SK], false)
    expect(without.events).toEqual([])
    expect(without.r.contract).toEqual(withDiag.r.contract)
    const d = dec([MIA, SK])
    expect(validateDecision(d, [SK, MIA], ANSWER)).toEqual(validateDecision(d, [SK, MIA], ANSWER, []))
  })
})

describe('cardPathTrace is silent unless a turn id is carried AND the audit trace is on', () => {
  afterEach(() => { vi.restoreAllMocks(); delete process.env.TAPPY_AUDIT_TRACE; delete process.env.NEXT_PUBLIC_SUPABASE_URL })
  const lines = () => (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0])).filter(s => s.includes('"ev":"card_path"'))
  it('no turn id → nothing, even with the trace on', () => {
    process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    cardPathTrace(undefined, 'recorder_input', { a: 1 })
    expect(lines()).toEqual([])
  })
  it('a turn id but the trace off (unset, or a production URL) → nothing', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    cardPathTrace('t1', 'recorder_input', { a: 1 })
    process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fwznnobrdctuskgrvuik.supabase.co'
    cardPathTrace('t1', 'recorder_input', { a: 1 })
    expect(lines()).toEqual([])
  })
  it('a turn id and the trace on (audit project) → one line with the id and the stage', () => {
    process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    cardPathTrace('t1', 'final_cards', { ids: ['a'] })
    const l = lines()
    expect(l).toHaveLength(1)
    expect(JSON.parse(l[0])).toMatchObject({ ev: 'card_path', turn: 't1', stage: 'final_cards', ids: ['a'] })
  })
  it('briefRows reads id + name and tolerates anything else', () => {
    expect(briefRows([{ place_id: 'p1', name: 'MIA TOWN' }, { name: 'X' }, null, 5])).toEqual([{ id: 'p1', name: 'MIA TOWN' }, { id: null, name: 'X' }, { id: null, name: null }, { id: null, name: null }])
    expect(briefRows(undefined)).toEqual([])
  })
})
