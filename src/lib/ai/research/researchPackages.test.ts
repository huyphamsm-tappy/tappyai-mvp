import { describe, it, expect, afterEach, vi } from 'vitest'
import { dedupePackages, briefText } from './researchPackages'
import { researchPackagesOn } from './deepResearchState'
import { normalisePlan, runDeepResearch, type DeepResearchDeps, type Evidence, type ResearchPlan } from './deepResearch'
import { PlanSchema, PlanSchemaPackages } from './deepResearchDeps'

// Anthropic's finding (multi-agent research system): vague tasks make workers repeat each other's searches; each task needs an objective, an output format, guidance on sources and a boundary.
// Seen in the 11/11 trend report: payments, food-safety law and dairy imports sections with nothing about the subject; the same store counts in three sections.

const brief = (o: Partial<Record<'objective' | 'output' | 'sources' | 'boundary', string>> = {}) => ({ objective: 'Số cửa hàng từng chuỗi trà sữa ở Hà Nội năm 2025', output: 'bảng chuỗi, số cửa hàng, năm, nguồn', sources: 'báo kinh tế, báo cáo chuỗi', boundary: 'không nói doanh thu (bước 3)', ...o })

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchPackagesOn({})).toBe(false)
    expect(researchPackagesOn({ RESEARCH_PACKAGES: '1' })).toBe(true)
    expect(researchPackagesOn({ RESEARCH_PACKAGES: 'yes' })).toBe(false)
    expect(researchPackagesOn({ RESEARCH_PACKAGES: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchPackagesOn({ RESEARCH_PACKAGES: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_PACKAGES' })).toBe(true)
  })
})

describe('normalisePlan keeps the brief of a step', () => {
  const raw = (step: Record<string, unknown>) => ({ title: 'T', steps: [{ title: 'Chuỗi lớn', queries: ['q1'], ...step }] })
  it('the four parts, trimmed and cleaned', () => {
    const p = normalisePlan(raw({ objective: '  Số cửa hàng  ', output: 'bảng', sources: 'báo', boundary: 'không doanh thu' }), 'q')
    expect(p!.steps[0].brief).toEqual({ objective: 'Số cửa hàng', output: 'bảng', sources: 'báo', boundary: 'không doanh thu' })
  })
  it('a step with no brief fields has no brief key at all (the older plan is unchanged)', () => {
    const p = normalisePlan(raw({}), 'q')
    expect(Object.keys(p!.steps[0])).toEqual(['title', 'queries'])
  })
  it('a brief without an objective is not a brief', () => {
    expect(normalisePlan(raw({ objective: ' ', boundary: 'x' }), 'q')!.steps[0].brief).toBeUndefined()
  })
})

describe('briefText', () => {
  it('writes the parts a worker is held to, and nothing when there is no brief', () => {
    const t = briefText(brief())
    expect(t).toContain('Objective: Số cửa hàng từng chuỗi')
    expect(t).toContain('Boundary: không nói doanh thu')
    expect(briefText(undefined)).toBe('')
  })
})

describe('dedupePackages: two packages that ask the same thing are one', () => {
  const step = (title: string, queries: string[], b?: ReturnType<typeof brief>) => ({ title, queries, ...(b ? { brief: b } : {}) })
  it('a later package whose objective repeats an earlier one is dropped, its new queries folded into the earlier', () => {
    const plan: ResearchPlan = { title: 'T', steps: [
      step('Số cửa hàng', ['cửa hàng trà sữa Hà Nội 2025'], brief()),
      step('Giá bán', ['giá trà sữa Hà Nội'], brief({ objective: 'Giá bán trà sữa theo phân khúc ở Hà Nội' })),
      step('Cửa hàng các chuỗi', ['số điểm bán chuỗi trà sữa', 'cửa hàng trà sữa Hà Nội 2025'], brief({ objective: 'Số cửa hàng từng chuỗi trà sữa ở Hà Nội năm 2025 theo báo' })),
    ] }
    const r = dedupePackages(plan)
    expect(r.plan.steps.map(s => s.title)).toEqual(['Số cửa hàng', 'Giá bán'])
    expect(r.plan.steps[0].queries).toEqual(['cửa hàng trà sữa Hà Nội 2025', 'số điểm bán chuỗi trà sữa'])
    expect(r.merged).toEqual([{ kept: 1, dropped: 3 }])
  })
  it('two packages with different titles but almost the same queries are one', () => {
    const plan: ResearchPlan = { title: 'T', steps: [step('Thanh toán', ['thanh toán không tiền mặt Hà Nội 2025 ví điện tử']), step('Hạ tầng', ['thanh toán không tiền mặt Hà Nội 2025 ví điện tử tỷ lệ'])] }
    expect(dedupePackages(plan).plan.steps).toHaveLength(1)
  })
  it('distinct packages are left exactly as they are', () => {
    const plan: ResearchPlan = { title: 'T', steps: [step('Số cửa hàng', ['a b c'], brief()), step('Giá bán', ['x y z'], brief({ objective: 'Giá bán trà sữa theo phân khúc' })), step('Thuế', ['thuế tiêu thụ đặc biệt 2027'], brief({ objective: 'Thuế tiêu thụ đặc biệt nước giải khát có đường' }))] }
    const r = dedupePackages(plan)
    expect(r.plan).toEqual(plan)
    expect(r.merged).toEqual([])
  })
  it('a package with no brief is judged by its title; one step is never dropped', () => {
    expect(dedupePackages({ title: 'T', steps: [step('Giá trà sữa Hà Nội', ['q1']), step('Giá trà sữa Hà Nội', ['q2'])] }).plan.steps).toHaveLength(1)
    expect(dedupePackages({ title: 'T', steps: [step('Một', ['q'])] }).plan.steps).toHaveLength(1)
  })
  it('keeps at most 4 queries in a package after folding, and the other plan fields', () => {
    const plan: ResearchPlan = { title: 'T', parts: ['p'], sources_label: 'Nguồn', steps: [step('Giá trà sữa Hà Nội', ['q1', 'q2', 'q3']), step('Giá trà sữa Hà Nội', ['q4', 'q5'])] }
    const r = dedupePackages(plan)
    expect(r.plan.steps[0].queries).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(r.plan.parts).toEqual(['p'])
    expect(r.plan.sources_label).toBe('Nguồn')
  })
})

describe('the schemas', () => {
  const base = { title: 'T', sources_label: 'Nguồn', parts: [{ part: 'a', step: 1 }] }
  const plain = { title: 'S', queries: ['q'], image_query: null }
  const full = { ...plain, objective: 'o', output: 'out', sources: 's', boundary: 'b' }
  it('the package plan needs the four parts on every step; the older plan does not ask for them', () => {
    expect(PlanSchemaPackages.safeParse({ ...base, steps: [full], specialist_steps: [full] }).success).toBe(true)
    expect(PlanSchemaPackages.safeParse({ ...base, steps: [plain], specialist_steps: [] }).success).toBe(false)
    expect(PlanSchemaPackages.safeParse({ ...base, steps: [{ ...full, boundary: undefined }], specialist_steps: [] }).success).toBe(false)
    expect(PlanSchema.safeParse({ ...base, steps: [plain], specialist_steps: [] }).success).toBe(true)
  })
})

describe('the engine, with and without the flag', () => {
  afterEach(() => vi.unstubAllEnvs())
  const overlapping: ResearchPlan = { title: 'T', steps: [
    { title: 'Số cửa hàng', queries: ['q-a'], brief: brief() },
    { title: 'Cửa hàng các chuỗi', queries: ['q-b'], brief: brief({ objective: 'Số cửa hàng từng chuỗi trà sữa ở Hà Nội năm 2025 theo báo' }) },
    { title: 'Giá bán', queries: ['q-c'], brief: brief({ objective: 'Giá bán trà sữa theo phân khúc', boundary: 'không nói số cửa hàng' }) },
  ] }
  function run() {
    const gathered: string[] = []
    const focus: string[] = []
    const noteArgs: unknown[][] = []
    let n = 0
    const deps: DeepResearchDeps = {
      // the plan call returns the four parts as flat fields of each step (the schema's shape); normalisePlan turns them into `brief`
      async plan() { return { title: overlapping.title, steps: overlapping.steps.map(s => ({ title: s.title, queries: s.queries, ...s.brief })) } as unknown as ResearchPlan },
      async gather(q, f) { gathered.push(q); focus.push(f); n++; return [{ title: `N${n}`, url: `https://a${n}.vn/p`, snippet: 's', text: 'nội dung' }] },
      async notes(...args: unknown[]) { noteArgs.push(args); const e = args[2] as readonly Evidence[]; return [{ text: `phát hiện ${e[0]!.id}`, source: e[0]!.id }] },
      async *write() { yield '# B\n\n## Số cửa hàng\nNội dung [1]\n' },
    }
    return runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text() {} }).then(() => ({ gathered, focus, noteArgs }))
  }
  it('flag off: all three packages run, notes get exactly three arguments, the focus is the title', async () => {
    const r = await run()
    expect(r.gathered.sort()).toEqual(['q-a', 'q-b', 'q-c'])
    expect(r.noteArgs.every(a => a.length === 3)).toBe(true)
    expect(r.focus.every(f => !f.includes('Số cửa hàng từng chuỗi'))).toBe(true)
  })
  it('flag on: the repeated package is merged (two run), notes get the brief, the focus is the objective', async () => {
    vi.stubEnv('RESEARCH_PACKAGES', '1')
    const r = await run()
    // the merged package's query is folded into the kept one, so nothing it would have searched is lost; only the repeated READING (a second notes call) goes
    expect(r.gathered.sort()).toEqual(['q-a', 'q-b', 'q-c'])
    expect(r.noteArgs).toHaveLength(2)
    expect(r.noteArgs.every(a => a.length === 4 && typeof (a[3] as { objective?: string }).objective === 'string')).toBe(true)
    expect(r.focus.some(f => f.includes('Số cửa hàng từng chuỗi'))).toBe(true)
  })
})
