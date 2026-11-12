// R13 section 17 acceptance statements that can be tested offline, for the parts that exist (17.5 "Research ownership isolation", "Multi-LLM routing", "Work-package contracts", gap handling;
// 17.6 Standard/Advanced ownership). Every model call is recorded by a stub of the AI layer: no network, no money. Each assertion was mutation-checked (see the owner's report).
//
// The one deliberate departure from R13 ("Standard admission must not invoke Sonnet"): the owner decided on 11/11/2026 to keep ONE Sonnet policy-scan call per Standard run (deepResearchDeps.ts,
// RESEARCH_THESIS_REPORT). It is asserted below as an explicit exception: exactly once per run, Standard only, never in Advanced (where Sonnet leads anyway).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

type Call = { kind: 'extract' | 'stream'; schemaName?: string; claudeModel?: string; role?: string; opts: Record<string, unknown> }
const calls: Call[] = []
let streamFail = 0

const OBJECTS: Record<string, unknown> = {
  tappy_research_plan: { title: 'T', sources_label: 'Nguồn', parts: [{ part: 'Giá', step: 1 }], steps: [{ title: 'Giá', queries: ['q'] }], specialist_steps: [] },
  tappy_research_notes: { findings: [] },
  tappy_research_gaps: { steps: [{ title: 'Giá theo quý', queries: ['x'] }] },
  tappy_research_policy_scan: { title: 'Quy định mới', queries: ['thuế tiêu thụ đặc biệt 2027'] },
  tappy_research_critic: { parts: [{ n: 1, verdict: 'answered' }] },
  tappy_research_outline: { thesis: '', sections: [], doubts: [] },
}
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    extract: async (o: Record<string, unknown>) => {
      calls.push({ kind: 'extract', schemaName: String(o.schemaName), claudeModel: o.claudeModel as string | undefined, role: o.role as string, opts: o })
      return { object: OBJECTS[String(o.schemaName)] ?? {}, providerMetadata: undefined }
    },
    stream: (o: Record<string, unknown>) => {
      calls.push({ kind: 'stream', claudeModel: o.claudeModel as string | undefined, role: o.role as string, opts: o })
      const fail = streamFail > 0 ? (streamFail--, true) : false
      return {
        fullStream: (async function* () { if (fail) throw new Error('overloaded'); yield { type: 'text-delta', textDelta: '# B\n\nNội dung.\n' } })(),
        providerMetadata: Promise.resolve(undefined),
      }
    },
  },
}))
vi.mock('@/lib/ai/llm/registry', () => ({ claudeWriterAvailable: () => true, getProvider: () => ({}) }))

import { createDeepResearchDeps, reportFallback } from './deepResearchDeps'
import { runDeepResearch, readResearchStatus, type DeepResearchDeps, type Evidence, type ResearchPlan, type RunBounds } from './deepResearch'
import { decideGap, ADVANCED_BOUNDS, ADVANCED_RUN_BOUNDS, validateTaskGraph } from './researchController'
import { STANDARD_BOUNDS, STANDARD_RUN_BOUNDS } from './researchAdmission'
import { deepResearchResponse } from './deepResearchResponse'
import { verifyReport } from './claimVerifier'
import { validateAssignment, validateResultForAssignment, type WorkPackageAssignment } from './researchContracts'

beforeEach(() => { calls.length = 0; streamFail = 0; vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const cost = () => ({ usd: 0, calls: 0 })
const mkDeps = (tier: 'standard' | 'advanced') => createDeepResearchDeps({ lang: 'vi', userTexts: ['q'], cost: cost(), ...(tier === 'standard' ? { standard: true } : { advanced: true }) })
const PLAN: ResearchPlan = { title: 'T', parts: ['Giá'], steps: [{ title: 'Giá', queries: ['q'] }] } as ResearchPlan
const EV: Evidence[] = [{ id: 1, title: 'S', url: 'https://example.vn/a', snippet: 's', text: 'Giá 45.000 đồng.' } as Evidence]

/** drive every model-calling dep of a run once, the way a full run does (twice for the gap check: the scan must still happen once) */
async function exercise(d: DeepResearchDeps) {
  await d.plan('q', '')
  await d.notes('Giá', 'q', EV)
  await d.gaps!('q', PLAN, ['- f'], [{ title: 'Giá', findings: 1, figures: 0 }])
  await d.gaps!('q', PLAN, ['- f'], [{ title: 'Giá', findings: 1, figures: 0 }])
  for await (const _ of d.write({ question: 'q', plan: PLAN, evidence: EV, findings: [{ step: 1, text: 'f', source: 1 }] })) void _
  await d.critic!({ question: 'q', parts: ['Giá'], report: 'r' })
  for await (const _ of d.repair!({ question: 'q', plan: PLAN, evidence: EV, parts: [{ part: 'Giá', findings: [{ step: 1, text: 'f', source: 1 }] }] })) void _
  if (d.analyze) await d.analyze({ question: 'q', plan: PLAN, cards: [], support: new Map() })
}
const models = () => calls.map(c => c.claudeModel ?? 'luna')
const by = (name: string) => calls.filter(c => c.schemaName === name)

describe('17.5 Research ownership isolation: Luna is absent from both tiers', () => {
  for (const tier of ['standard', 'advanced'] as const) {
    it(`${tier}: every model call of a run (plan, notes, gap check, write, critic, repair, analyst) names a Claude model, none falls to Luna`, async () => {
      vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
      await exercise(mkDeps(tier))
      expect(calls.length).toBeGreaterThanOrEqual(8)
      expect(models()).not.toContain('luna')
      for (const c of calls) expect(['haiku55', 'sonnet55']).toContain(c.claudeModel)
    })
  }
  it('even with the writer / notes model flags that move the OLD engine to Claude or Luna, a tier run ignores them', async () => {
    vi.stubEnv('DEEP_RESEARCH_WRITER_MODEL', 'luna'); vi.stubEnv('DEEP_RESEARCH_NOTES_MODEL', 'luna')
    await exercise(mkDeps('advanced'))
    expect(models()).not.toContain('luna')
  })
  it('the existing engine (no tier) is the only one that may use Luna: it does, which proves the check above can fail', async () => {
    await exercise(createDeepResearchDeps({ lang: 'vi', userTexts: ['q'], cost: cost() }))
    expect(models()).toContain('luna')
  })
})

describe('17.5 retries: a failed Claude call is retried once on Claude and then fails; Luna is never substituted', () => {
  it('the policy: tier path retries on Claude, only the existing engine falls back to Luna', () => {
    expect(reportFallback(true)).toBe('retry_claude'); expect(reportFallback(false)).toBe('luna')
  })
  for (const tier of ['standard', 'advanced'] as const) {
    it(`${tier} writer: two failures before any text are two Claude attempts, then the error reaches the run (refund), no Luna stream`, async () => {
      streamFail = 5
      const d = mkDeps(tier)
      await expect((async () => { for await (const _ of d.write({ question: 'q', plan: PLAN, evidence: EV, findings: [{ step: 1, text: 'f', source: 1 }] })) void _ })()).rejects.toThrow('overloaded')
      expect(calls.filter(c => c.kind === 'stream')).toHaveLength(2)
      expect(models()).not.toContain('luna')
    })
    it(`${tier} writer: one transient failure is retried and the report is written`, async () => {
      streamFail = 1
      const d = mkDeps(tier)
      let text = ''
      for await (const t of d.write({ question: 'q', plan: PLAN, evidence: EV, findings: [{ step: 1, text: 'f', source: 1 }] })) text += t
      expect(text).toContain('Nội dung'); expect(calls.filter(c => c.kind === 'stream')).toHaveLength(2); expect(models()).not.toContain('luna')
    })
  }
})

describe('17.5 Standard uses Haiku; the one owner-approved Sonnet exception (11/11/2026: policy scan, once per run, Standard only)', () => {
  it('without RESEARCH_THESIS_REPORT a Standard run never calls Sonnet', async () => {
    await exercise(mkDeps('standard'))
    expect(models()).not.toContain('sonnet55')
    expect(new Set(models())).toEqual(new Set(['haiku55']))
  })
  it('with it, exactly ONE Sonnet call happens in the whole run, and it is the policy scan; everything else is Haiku', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    await exercise(mkDeps('standard'))
    const sonnet = calls.filter(c => c.claudeModel === 'sonnet55')
    expect(sonnet).toHaveLength(1)
    expect(sonnet[0]!.schemaName).toBe('tappy_research_policy_scan')
    expect(calls.filter(c => c.claudeModel !== 'sonnet55').every(c => c.claudeModel === 'haiku55')).toBe(true)
  })
  it('the scan is once per run, not once per gap round: a second run builds its own', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const d = mkDeps('standard')
    for (let i = 0; i < 3; i++) await d.gaps!('q', PLAN, ['- f'], [{ title: 'Giá', findings: 1, figures: 0 }])
    expect(by('tappy_research_policy_scan')).toHaveLength(1)
    calls.length = 0
    await mkDeps('standard').gaps!('q', PLAN, ['- f'], [{ title: 'Giá', findings: 1, figures: 0 }])
    expect(by('tappy_research_policy_scan')).toHaveLength(1)
  })
  it('the scan adds a follow-up step (first) to what the gap check found', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const out = await mkDeps('standard').gaps!('q', PLAN, ['- f'], [{ title: 'Giá', findings: 1, figures: 0 }])
    expect(out.map(s => s.title)).toEqual(['Quy định mới', 'Giá theo quý'])
  })
  it('Advanced has no separate scan (Sonnet already leads it)', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    await mkDeps('advanced').gaps!('q', PLAN, ['- f'], [{ title: 'Giá', findings: 1, figures: 0 }])
    expect(by('tappy_research_policy_scan')).toHaveLength(0)
  })
})

describe('17.5 Advanced: Sonnet plans, checks gaps and writes the final report; Haiku does the work packages', () => {
  it('plan, gap check, critic, repair and the final write are Sonnet; the notes (the work packages reading sources) are Haiku', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    await exercise(mkDeps('advanced'))
    expect(by('tappy_research_plan').map(c => c.claudeModel)).toEqual(['sonnet55'])
    expect(by('tappy_research_gaps').every(c => c.claudeModel === 'sonnet55')).toBe(true)
    expect(by('tappy_research_critic').map(c => c.claudeModel)).toEqual(['sonnet55'])
    expect(by('tappy_research_outline').map(c => c.claudeModel)).toEqual(['sonnet55'])
    expect(by('tappy_research_notes').every(c => c.claudeModel === 'haiku55')).toBe(true)
    const writes = calls.filter(c => c.kind === 'stream')
    expect(writes.map(c => c.claudeModel)).toEqual(['sonnet55', 'sonnet55'])
  })
  it('the owner\'s cost switch moves ONLY the writer to Haiku; planning stays Sonnet', async () => {
    vi.stubEnv('RESEARCH_ADVANCED_WRITER', 'haiku55')
    await exercise(mkDeps('advanced'))
    expect(calls.filter(c => c.kind === 'stream' && c.opts.maxTokens !== 4000).map(c => c.claudeModel)).toEqual(['haiku55'])
    expect(by('tappy_research_plan').map(c => c.claudeModel)).toEqual(['sonnet55'])
  })
  it('the switch is locked in a production runtime', async () => {
    vi.stubEnv('RESEARCH_ADVANCED_WRITER', 'haiku55'); vi.stubEnv('VERCEL_ENV', 'production')
    await exercise(mkDeps('advanced'))
    expect(calls.filter(c => c.kind === 'stream' && c.opts.maxTokens !== 4000).map(c => c.claudeModel)).toEqual(['sonnet55'])
  })
})

describe('17.5 gap handling: bounded rounds, a proposal is not an authorisation', () => {
  const mk = (gapsCalled: { n: number }): DeepResearchDeps => ({
    async plan() { return { title: 'T', steps: [{ title: 'A', queries: ['q'] }] } as ResearchPlan },
    async gather() { return [{ title: 'N', url: `https://example.vn/${gapsCalled.n}`, snippet: 's', text: 'nội dung' }] },
    async notes(_s: string, _q: string, ev: readonly Evidence[]) { return Array.from({ length: 10 }, (_, i) => ({ text: `phát hiện ${gapsCalled.n}-${i}`, source: ev[0]!.id })) as never },
    async gaps() { gapsCalled.n++; return [{ title: `Bổ sung ${gapsCalled.n}`, queries: ['x'] }] as never },
    async *write() { yield '# B\n\n## A\nNội dung.\n' },
  })
  const run = async (b: RunBounds) => { const n = { n: 0 }; await runDeepResearch('q', '', 'vi', mk(n), { status() {}, text() {} }, undefined, b); return n.n }
  it('Standard: one supplemental pass; Advanced: never more than the Controller\'s gap-round cap', async () => {
    expect(STANDARD_RUN_BOUNDS.gapRounds).toBe(STANDARD_BOUNDS.supplementalPasses)
    expect(await run({ ...STANDARD_RUN_BOUNDS })).toBe(1)
    const adv = await run({ ...ADVANCED_RUN_BOUNDS })
    expect(adv).toBeGreaterThan(1); expect(adv).toBeLessThanOrEqual(ADVANCED_BOUNDS.maxGapRounds)
  })
  it('the Controller denies a gap past the round limit, outside the question\'s scope, or that cannot be reserved; an approval needs at least one in-scope dimension', () => {
    const base = { tier: 'STANDARD_REPORT' as const, roundsUsed: 0, requiredDimensions: ['Giá'], active: true, canReserve: true }
    const req = { dimensions: ['Giá'], acceptance: ['có giá'] }
    expect(decideGap(req, base).decision).toBe('APPROVED')
    expect(decideGap(req, { ...base, roundsUsed: STANDARD_BOUNDS.supplementalPasses })).toMatchObject({ decision: 'DENIED', reason: 'ROUND_LIMIT', followUp: 'NO_FURTHER_RETRIEVAL' })
    expect(decideGap({ dimensions: ['Thời tiết'], acceptance: ['x'] }, base)).toMatchObject({ decision: 'DENIED', reason: 'OUT_OF_SCOPE' })
    expect(decideGap(req, { ...base, canReserve: false })).toMatchObject({ decision: 'DENIED', reason: 'RESERVATION_REFUSED' })
    expect(decideGap(req, { ...base, active: false })).toMatchObject({ decision: 'DENIED', reason: 'REQUEST_NOT_ACTIVE' })
  })
  it('a task graph over the Standard bound or with a dependency is refused for Standard; Advanced allows dependencies but not a cycle', () => {
    const p = (id: string, dependsOn: string[] = []) => ({ id, title: id, dimension: 'd', dependsOn, critical: false, acceptance: ['a'] })
    expect(validateTaskGraph('STANDARD_REPORT', [p('a'), p('b'), p('c'), p('d')], ['d']).issues).toContain('TOO_MANY_PACKAGES')
    expect(validateTaskGraph('STANDARD_REPORT', [p('a'), p('b', ['a'])], ['d']).issues).toContain('DEPENDENCIES_NOT_ALLOWED_FOR_STANDARD')
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', [p('a'), p('b', ['a'])], ['d']).ok).toBe(true)
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', [p('a', ['b']), p('b', ['a'])], ['d']).issues).toContain('DEPENDENCY_CYCLE')
  })
})

describe('17.5 work-package contracts (4.3): wrong version, wrong Context, unauthorised source pack, unknown fact, unbound evidence', () => {
  const NOW = Date.parse('2026-11-11T10:00:00Z')
  const a: WorkPackageAssignment = { researchRequestId: 'rr', workPackageId: 'wp1', assignmentVersion: 1, dimensionName: 'd', objective: 'o', targetEntityIds: [], sourcePackRefs: ['ev:1'], lockedContextVersion: 'v1', dependencyWorkPackageIds: [], criticality: 'REQUIRED', acceptanceCriteria: ['a'], expectedOutputSchemaVersion: 'work-package-result.v1', budgetReservationRef: 'res', deadlineAt: new Date(NOW + 1000).toISOString() }
  const ctx = { researchRequestId: 'rr', lockedContextVersion: 'v1', packageIds: new Set(['wp1']), allowedSourcePackRefs: new Set(['ev:1']), usedVersions: new Map(), reservations: new Map([['res', 1]]), nowMs: NOW, outputSchemaVersions: new Set(['work-package-result.v1']) }
  const res = (o: object = {}) => ({ researchRequestId: 'rr', workPackageId: 'wp1', assignmentVersion: 1, executionAttemptId: 'e', status: 'SUCCEEDED', extractedClaims: [{ claimId: 'c', statement: 's', claimType: 't', supportingFactVersionIds: ['fv1'], uncertainty: 'LOW' }], factVersionRefs: ['fv1'], evidenceRefs: ['ev:1'], evidenceConflicts: [], dataGaps: [], summaryFindings: '', limitations: [], completedAt: 'x', ...o })
  const o = { lockedContextVersion: 'v1', factVersionIds: new Set(['fv1']) }
  it('the good case is accepted, each wrong thing is refused for its own reason', () => {
    expect(validateAssignment(a, ctx).ok).toBe(true)
    expect(validateResultForAssignment(res(), a, o).accepted).toBe(true)
    expect(validateResultForAssignment(res({ assignmentVersion: 2 }), a, o).issues).toContain('STALE_ASSIGNMENT_VERSION')
    expect(validateResultForAssignment(res(), a, { ...o, lockedContextVersion: 'v2' }).issues).toContain('WRONG_CONTEXT_VERSION')
    expect(validateAssignment({ ...a, sourcePackRefs: ['ev:9'] }, ctx).issues).toContain('SOURCE_PACK_NOT_AUTHORIZED')
    expect(validateResultForAssignment(res({ extractedClaims: [{ claimId: 'c', statement: 's', claimType: 't', supportingFactVersionIds: ['fv9'], uncertainty: 'LOW' }], factVersionRefs: ['fv9'] }), a, o).accepted).toBe(false)
    expect(validateResultForAssignment(res({ evidenceRefs: ['ev:9'] }), a, o).issues).toContain('EVIDENCE_OUTSIDE_SOURCE_PACK')
  })
})

describe('17.2/17.6 the report states which tier it is', () => {
  const mk = (): DeepResearchDeps => ({
    async plan() { return { title: 'T', steps: [{ title: 'B', queries: ['q'] }] } as ResearchPlan },
    async gather() { return [{ title: 'N', url: 'https://example.com/a', snippet: 's', text: 'nội dung' }] },
    async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'phát hiện', source: ev[0]!.id }] as never },
    async *write() { yield '# B\n\nNội dung [1]\n' },
  })
  const tiers = async (label: 'standard' | 'advanced' | null) => {
    const res = deepResearchResponse({ question: 'q', context: '', lang: 'vi', cost: cost(), serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: async () => {}, deps: mk(), ...(label ? { standard: { deps: mk(), bounds: { ...STANDARD_RUN_BOUNDS }, label } } : {}) })
    const text = await res.text()
    return new Set(text.split('\n').filter(l => l.startsWith('8:')).map(l => (JSON.parse(l.slice(2)) as Array<{ tier?: string; type?: string }>)[0]).filter(f => f?.type === 'tappy.research.v1').map(f => f!.tier))
  }
  it('every status frame of a Standard run says standard, of an Advanced run advanced; the existing engine says nothing', async () => {
    expect(await tiers('standard')).toEqual(new Set(['standard']))
    expect(await tiers('advanced')).toEqual(new Set(['advanced']))
    expect(await tiers(null)).toEqual(new Set([undefined]))
  })
  it('a tier outside standard/advanced is dropped when a status is read back', () => {
    const base = { type: 'tappy.research.v1', title: 'T', phase: 'done', steps: [], sources: 1 }
    expect(readResearchStatus([{ ...base, tier: 'advanced' }])?.tier).toBe('advanced')
    expect(readResearchStatus([{ ...base, tier: 'premium' }])?.tier).toBeUndefined()
  })
})

describe('17.6 the independent verifier: code, never the writer, and what it can and cannot prove', () => {
  const sources = [{ id: 1, title: 'S', snippet: '', text: 'Doanh thu năm 2025 đạt 12.500 tỷ đồng.' }]
  it('flags a figure the cited source lacks, a citation to a source that does not exist, and a figure with no citation', () => {
    const r = verifyReport('Doanh thu đạt 12.500 tỷ đồng [1]. Doanh thu đạt 99.999 tỷ đồng [1]. Chuỗi có 800 cửa hàng [7]. Thị trường tăng 35% mỗi năm.', sources, 2026)
    expect(r.counts.supported).toBe(1); expect(r.counts.number_not_in_source).toBe(1); expect(r.counts.bad_citation).toBe(1); expect(r.counts.uncited_number).toBe(1)
  })
  it('its scope is numbers and citation ids, not meaning: a true figure attached to a false statement passes (stated limit, not a claim of semantic verification)', () => {
    expect(verifyReport('Doanh thu đạt 12.500 tỷ đồng vì giá dầu giảm [1].', sources, 2026).counts.supported).toBe(1)
  })
  it('a tier run hands the engine\'s result the report and the sources it cites for that verifier; the unbounded engine does not', async () => {
    const d = (): DeepResearchDeps => ({
      async plan() { return { title: 'T', steps: [{ title: 'B', queries: ['q'] }] } as ResearchPlan },
      async gather() { return [{ title: 'N', url: 'https://example.com/a', snippet: 's', text: 'nội dung' }] },
      async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'phát hiện', source: ev[0]!.id }] as never },
      async *write() { yield '# B\n\nNội dung [1]\n' },
    })
    const em = { status() {}, text() {} }
    expect((await runDeepResearch('q', '', 'vi', d(), em, undefined, { ...STANDARD_RUN_BOUNDS })).checked).toMatchObject({ report: expect.stringContaining('Nội dung') })
    expect((await runDeepResearch('q', '', 'vi', d(), em)).checked).toBeUndefined()
  })
})

describe('17.5 quota refund: a run that fails before any text is given back; one that delivered is not', () => {
  const base = (write: DeepResearchDeps['write']): DeepResearchDeps => ({
    async plan() { return { title: 'T', steps: [{ title: 'B', queries: ['q'] }] } as ResearchPlan },
    async gather() { return [{ title: 'N', url: 'https://example.com/a', snippet: 's', text: 'nội dung' }] },
    async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'phát hiện', source: ev[0]!.id }] as never },
    write,
  })
  const turn = async (deps: DeepResearchDeps, models: string[] = []) => {
    const failed = vi.fn(async () => {})
    const res = deepResearchResponse({ question: 'q', context: '', lang: 'vi', cost: cost(), serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: failed, deps: base(async function* () { yield 'x' }), standard: { deps, bounds: { ...STANDARD_RUN_BOUNDS }, label: 'standard' }, onUsage: u => { models.push(u.model) } })
    return { text: await res.text(), failed, models }
  }
  it('write fails (after the one Claude retry): the person is told, onFailed (the route\'s refund) runs once, no Luna in the cost line', async () => {
    // eslint-disable-next-line require-yield
    const r = await turn(base(async function* () { throw new Error('overloaded') }))
    expect(r.failed).toHaveBeenCalledTimes(1); expect(r.models).not.toContain('luna')
  })
  it('a plan that cannot be made: refunded too', async () => {
    const d = base(async function* () { yield 'x' }); d.plan = async () => { throw new Error('no plan') }
    expect((await turn(d)).failed).toHaveBeenCalledTimes(1)
  })
  it('a delivered report is not refunded', async () => {
    const r = await turn(base(async function* () { yield '# B\n\nNội dung [1]\n' }))
    expect(r.failed).not.toHaveBeenCalled(); expect(r.text).toContain('Nội dung')
  })
  it('a plan too big for Standard with no Advanced allowance: refunded, and not rerun on Luna', async () => {
    const big = base(async function* () { yield 'x' }); big.plan = async () => ({ title: 'T', steps: Array.from({ length: 5 }, (_, i) => ({ title: `S${i}`, queries: ['q'] })) }) as ResearchPlan
    const failed = vi.fn(async () => {}); const models: string[] = []
    const res = deepResearchResponse({ question: 'q', context: '', lang: 'vi', cost: cost(), serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: failed, deps: base(async function* () { yield 'x' }), standard: { deps: big, bounds: { ...STANDARD_RUN_BOUNDS, maxSteps: 3 }, label: 'standard' }, onUsage: u => { models.push(u.model) } })
    await res.text()
    expect(failed).toHaveBeenCalledTimes(1); expect(models).not.toContain('luna')
  })
})
