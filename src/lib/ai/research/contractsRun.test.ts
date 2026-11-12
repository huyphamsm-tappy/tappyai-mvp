// RESEARCH_CONTRACTS in the engine (R13 4.3): the Advanced run issues an assignment per plan step, checks each step's result against it and each gap round against the Controller's rules.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createContractsRun, CONTRACT_BUDGET } from './contractsRun'
import { runDeepResearch, type DeepResearchDeps, type Evidence, type ResearchPlan, type RunBounds } from './deepResearch'
import { ADVANCED_RUN_BOUNDS } from './researchController'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'

afterEach(() => { vi.unstubAllEnvs() })
vi.spyOn(console, 'log').mockImplementation(() => {})

const NOW = Date.parse('2026-11-11T10:00:00Z')
const plan = (): ResearchPlan => ({ title: 'T', parts: ['Giá', 'Kênh'], steps: [{ title: 'Giá', queries: ['a', 'b'] }, { title: 'Kênh', queries: ['c'] }] } as ResearchPlan)
const run = () => createContractsRun(plan(), { question: 'q', context: '', lang: 'vi', nowMs: NOW, deadlineMs: 150_000 })

describe('createContractsRun', () => {
  it('issues one valid assignment per step, within the ceiling and with the synthesis reservation kept', () => {
    const r = run()
    expect(r.issued.assignments).toHaveLength(2)
    expect(r.issued.validation.every(v => v.ok)).toBe(true)
    const workers = [...r.issued.envelopes.values()].reduce((n, e) => n + e.hardBudgetLimitMicros, 0)
    expect(workers + r.issued.supplementalPoolMicros + CONTRACT_BUDGET.protectedSynthesisMicros + CONTRACT_BUDGET.protectedVerifierMicros).toBeLessThanOrEqual(CONTRACT_BUDGET.ceilingMicros)
  })
  it('a step whose findings come from its own source pack is accepted; its claims are counted', () => {
    const r = run()
    const c = r.checkStep(0, { evidenceIds: [1, 2], allEvidenceIds: [1, 2, 3], findings: [{ source: 1, text: 'giá 45.000' }, { source: 2, text: 'giá 50.000' }] })
    expect(c).toMatchObject({ step: 1, packageId: 'wp1', accepted: true, claims: 2, rejected: 0, issues: [] })
  })
  it('a finding that stands on evidence outside the step\'s source pack makes the result unaccepted (unbound evidence)', () => {
    const r = run()
    const c = r.checkStep(0, { evidenceIds: [1], allEvidenceIds: [1, 2], findings: [{ source: 1, text: 'a' }, { source: 2, text: 'b' }] })
    expect(c.accepted).toBe(false); expect(c.issues).toContain('EVIDENCE_OUTSIDE_SOURCE_PACK')
  })
  it('a step with no evidence has no source pack and is recorded as such, never as accepted', () => {
    const c = run().checkStep(1, { evidenceIds: [], allEvidenceIds: [1], findings: [] })
    expect(c).toMatchObject({ packageId: 'wp2', accepted: false, issues: ['SOURCE_PACK_NOT_AUTHORIZED'] })
  })
  it('a step with a pack but no kept finding is unaccepted without an issue (nothing claimed)', () => {
    const c = run().checkStep(1, { evidenceIds: [1], allEvidenceIds: [1], findings: [] })
    expect(c).toMatchObject({ accepted: false, claims: 0, issues: [] })
  })
  it('a gap round on a part the question asked for is approved and gets a supplemental assignment with its own reservation', () => {
    const r = run()
    const g = r.checkGap({ round: 0, plan: plan(), more: [{ title: 'Giá theo quý', queries: ['x'], completes: 1 }] })
    expect(g).toMatchObject({ round: 1, requestValid: true, status: 'APPROVED', decisionValid: true, supplemental: ['wp3'] })
    expect(r.summary().assignments).toBe(3)
  })
  it('a follow-up that completes no step is out of the question\'s scope: the Controller would deny it (recorded, not enforced)', () => {
    const g = run().checkGap({ round: 0, plan: plan(), more: [{ title: 'Thời tiết', queries: ['x'] }] })
    expect(g).toMatchObject({ status: 'DENIED', reason: 'OUT_OF_SCOPE', enforced: false, supplemental: [] })
  })
  it('after the round limit every gap is denied', () => {
    const g = run().checkGap({ round: 3, plan: plan(), more: [{ title: 'Giá theo quý', queries: ['x'], completes: 1 }] })
    expect(g).toMatchObject({ status: 'DENIED', reason: 'ROUND_LIMIT' })
  })
  it('the supplemental pool runs out: a later approval is refused for lack of a reservation', () => {
    const r = run()
    let last: ReturnType<typeof r.checkGap> | null = null
    for (let i = 0; i < 20; i++) last = r.checkGap({ round: 0, plan: plan(), more: [{ title: 'Giá', queries: ['x'], completes: 1 }] })
    expect(last).toMatchObject({ status: 'DENIED', reason: 'RESERVATION_REFUSED' })
  })
  it('the summary has counts and codes, never the question or a finding', () => {
    const r = run()
    r.checkStep(0, { evidenceIds: [1], allEvidenceIds: [1], findings: [{ source: 1, text: 'SECRET-FINDING' }] })
    const s = JSON.stringify(r.summary())
    expect(s).not.toContain('SECRET-FINDING'); expect(s).not.toContain('"q"')
  })
  it('a ceiling that cannot hold the synthesis reservation issues nothing', () => {
    const r = createContractsRun(plan(), { question: 'q', context: '', lang: 'vi', nowMs: NOW, deadlineMs: 1000, ceilingMicros: 10 })
    expect(r.issued.assignments).toEqual([]); expect(r.summary().refused).toBe('PROTECTED_EXCEEDS_CEILING')
  })
})

// the engine
const PAGE = 'Giá trung bình 45.000 đồng một ly. Có 700 cửa hàng.'
function deps(trace?: Array<Record<string, unknown>>): DeepResearchDeps {
  return {
    async plan() { return { title: 'T', parts: ['Giá'], steps: [{ title: 'Giá', queries: ['q1', 'q2'] }, { title: 'Kênh', queries: ['q3'] }] } as ResearchPlan },
    async gather() { return [{ title: 'S', url: 'https://example.vn/a', snippet: 's', text: PAGE }] },
    async notes(_s: string, _q: string, e: readonly Evidence[]) { return [{ text: 'Giá 45.000 đồng', source: e[0]!.id }] as never },
    async gaps() { return [{ title: 'Giá theo quý', queries: ['x'], completes: 1 }] as never },
    async *write() { yield '# B\n\n## Giá\nGiá 45.000 đồng [1].\n' },
    ...(trace ? { trace: (e: Record<string, unknown>) => { trace.push(e) } } : {}),
  }
}
const go = (d: DeepResearchDeps, bounds?: RunBounds) => { const pieces: string[] = []; return runDeepResearch('câu hỏi', '', 'vi', d, { status() {}, text(x) { pieces.push(x) } }, undefined, bounds).then(out => ({ out, text: pieces.join('') })) }

describe('the engine with RESEARCH_CONTRACTS', () => {
  it('flag off: no contract trace and no contracts in the result', async () => {
    const trace: Array<Record<string, unknown>> = []
    const { out } = await go(deps(trace), { ...ADVANCED_RUN_BOUNDS })
    expect(trace.filter(e => String(e.ev).startsWith('contract'))).toEqual([])
    expect(out.contracts).toBeUndefined()
  })
  it('flag on, Advanced: assignments issued, each step checked, each gap round decided; what is shown is the same as with the flag off', async () => {
    const off = await go(deps(), { ...ADVANCED_RUN_BOUNDS })
    vi.stubEnv('RESEARCH_CONTRACTS', '1')
    const trace: Array<Record<string, unknown>> = []
    const on = await go(deps(trace), { ...ADVANCED_RUN_BOUNDS })
    expect(on.text).toBe(off.text)
    expect(on.out.plan).toEqual(off.out.plan)
    expect(on.out.findings).toEqual(off.out.findings)
    expect(trace.filter(e => e.ev === 'contracts')).toHaveLength(1)
    expect(trace.filter(e => e.ev === 'contract_step').length).toBeGreaterThanOrEqual(2)
    expect(trace.filter(e => e.ev === 'contract_gap')).toHaveLength(1)
    expect(on.out.contracts).toMatchObject({ assignments: 3 })
  })
  it('flag on but not an Advanced run (Standard bounds, or none): nothing happens', async () => {
    vi.stubEnv('RESEARCH_CONTRACTS', '1')
    for (const b of [{ ...STANDARD_RUN_BOUNDS }, undefined]) {
      const trace: Array<Record<string, unknown>> = []
      const { out } = await go(deps(trace), b)
      expect(out.contracts).toBeUndefined(); expect(trace.filter(e => String(e.ev).startsWith('contract'))).toEqual([])
    }
  })
  it('a contract check that throws never costs the report', async () => {
    vi.stubEnv('RESEARCH_CONTRACTS', '1')
    const d = deps(); d.trace = e => { if (String(e.ev).startsWith('contract')) throw new Error('log down') }
    const { out } = await go(d, { ...ADVANCED_RUN_BOUNDS })
    expect(out.failed).toBeNull()
  })
})
