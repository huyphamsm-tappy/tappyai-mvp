// ── 31/10 (owner: "làm nghiên cứu sâu cho ngon"): Deep Research - plan, parallel research branches, one report ─────────────────────────────
//
// The converged design of the published systems (OpenAI deep research API guide: clarify → rewrite into a research brief → research with a
// tool-call cap; Anthropic's research system: a lead plans, 3-5 workers search and read IN PARALLEL and compress what they found with its
// source, one writer, citations attached separately; LangChain open_deep_research: research in parallel, write ONCE):
//   1. plan    - one structured call turns the question (and the conversation so far) into a titled plan of 3-5 steps, 1-2 queries each;
//   2. research - every step runs at the same time: its queries are searched and their top pages read (the page reader of the chat - same
//                 fetch rules, robots.txt, size caps), then one structured call keeps the step's findings, each tied to a NUMBERED source;
//   3. write   - one call (medium reasoning) writes the report from the findings, citing [n]; it never writes a link: the sources list is
//                built HERE from the search results, so every link the person sees came from a search result.
// The person sees the plan and each step's progress while it runs (a `tappy.research.v1` annotation the web client draws as a card).
// Bounded: DEEP_RESEARCH_LIMITS (steps, queries, a deadline after which a step still running is dropped). Pure orchestration: every model
// call, search and page read is an injected dependency (deepResearchDeps.ts in the app; fakes in the tests).

// The chat route's maxDuration is 300 s (owner 01/11, for this mode; it was 120 s): research gets 120 s, and the whole run stops writing at
// 270 s (what was written stays, with its sources) so the answer always ends inside the platform's limit. Measured 01/11 at 55 s / 105 s:
// a pricing report was cut at 105 s.
import { parseDoc, headingTitle, titleKey, type DocBlock } from '@/lib/answerDoc/parse'
import { leanValue } from './deepResearchLean'
import { deepResearchV2On, V2_LIMITS, termScores, stepCoverage, decideNext, missingParts, findingsForPart } from './deepResearchState'

// planSteps: the plan's own steps; steps: all steps of a run (the plan's + the follow-up round's GAP_STEPS), as the card shows them
export const DEEP_RESEARCH_LIMITS = { planSteps: 10, steps: 17, queriesPerStep: 3, findingsPerStep: 90, researchDeadlineMs: 120_000, runDeadlineMs: 270_000 } as const

/**
 * `sources_label`: the heading of the sources list in the question's language (the plan call writes it; absent = by the app's locale).
 * A step's `image_query`: what to search a picture for, when the step is about something one can see (absent = no picture for it).
 * A follow-up step's `completes`: the plan step (1-based) whose section its findings complete (measured 31/10: follow-ups written as their own
 * sections repeated two earlier ones); absent = a section of its own.
 */
export interface ResearchPlan { title: string; sources_label?: string; /** the parts of the report the question asks for, in its own words and order */ parts?: string[]; /** the parts the plan call says no step researches */ uncovered?: string[]; steps: Array<{ title: string; queries: string[]; image_query?: string; completes?: number }> }

/** The report's sections: the steps that are not follow-ups of another, in order. Pure. */
export const sectionSteps = (plan: ResearchPlan) => plan.steps.filter(s => !s.completes)

/** The writer's notes: one "## title" per section, its findings and those of the follow-ups that complete it. Pure. */
export function writerNotes(plan: ResearchPlan, findings: readonly Finding[]): string {
  const of = (k: number) => findings.filter(f => f.step === k + 1 || plan.steps[f.step - 1]?.completes === k + 1)
  const body = plan.steps.map((s, k) => (s.completes ? '' : `## ${s.title}\n${of(k).map(f => `- ${f.text} [${f.source}]`).join('\n') || '- (no findings)'}`)).filter(Boolean).join('\n\n')
  const conflicts = figureConflicts(findings)
  return conflicts.length ? `${body}\n\n## Conflicting figures (same series and label, different values — report both with their sources, never pick one silently)\n${conflicts.join('\n')}` : body
}

/** Relative gap above which two values of one series and label count as a conflict, not as rounding. */
export const FIGURE_CONFLICT_GAP = 0.02

/**
 * Same series and label read from different sources with different values. Pure and deterministic: the writer is told, in the notes, which
 * numbers disagree, so the report states the range and the sources instead of quoting whichever finding it met last.
 */
export function figureConflicts(findings: readonly Finding[]): string[] {
  const key = (f: Figure) => `${f.series.trim().toLowerCase()}|${f.label.trim().toLowerCase()}|${f.unit.trim().toLowerCase()}`
  const groups = new Map<string, Finding[]>()
  for (const f of findings) {
    if (!f.figure || !Number.isFinite(f.figure.value)) continue
    const k = key(f.figure)
    groups.set(k, [...(groups.get(k) ?? []), f])
  }
  const out: string[] = []
  for (const group of groups.values()) {
    const values = group.map(f => f.figure!.value)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    if (new Set(group.map(f => f.source)).size < 2 || hi - lo <= Math.abs(hi) * FIGURE_CONFLICT_GAP) continue
    const first = group[0].figure!
    out.push(`- ${first.series} / ${first.label} (${first.unit}): ${group.map(f => `${f.figure!.value} [${f.source}]`).join(' vs ')}`)
  }
  return out
}
/**
 * Measured 31/10 (T22, "how many EV makers are there"): one research round found sales by brand but no count, and the report could only say
 * "not found". Like the published systems (research, see what is still missing, research that), a second round runs for what the first did
 * not answer: at most this many follow-up steps, only when time is left.
 */
export const GAP_STEPS = 4
const GAP_MIN_LEFT_MS = 20_000
/** The most characters of findings the gap check is shown (what the call can read at its cost). */
export const GAP_FINDINGS_BUDGET = 30_000
/** What a line costs the gap check's prompt beyond its text: the "- " in front and the newline after. */
const GAP_LINE_OVERHEAD = 3

/**
 * 03/11 (audit: the gap check was given the findings in step order cut at 30 000 characters, so it saw 31-37% of them - the first steps
 * only - and the later steps were invisible to it): the findings it reads are packed so EVERY step with findings is in it. Each step gets a
 * fair share of the budget (what a short step does not use goes to the longer ones); inside a step a finding that carries a figure comes
 * before one that does not, then the step's own order. A line is "[S<step>] text". The result never exceeds `budget` characters as the gap
 * check will lay it out (line text + GAP_LINE_OVERHEAD each). Pure and deterministic.
 */
export function packFindingsForGapCheck(findings: ReadonlyArray<{ step: number; text: string; figure?: unknown }>, budget = GAP_FINDINGS_BUDGET): string[] {
  const bySteps = new Map<number, string[]>()
  for (const f of [...findings].sort((a, b) => Number(!!b.figure) - Number(!!a.figure))) { // stable: figure findings first, the step's own order kept
    const line = `[S${f.step}] ${f.text}`
    bySteps.set(f.step, [...(bySteps.get(f.step) ?? []), line])
  }
  const cost = (line: string) => line.length + GAP_LINE_OVERHEAD
  const steps = [...bySteps.keys()].sort((a, b) => a - b)
  const taken = new Map<number, string[]>(steps.map(s => [s, []]))
  let left = budget
  let open = steps.filter(s => bySteps.get(s)!.length)
  // water-filling: each round gives every still-open step an equal share of what is left; a step that cannot use its share closes and returns it
  while (open.length && left > 0) {
    const share = Math.max(1, Math.floor(left / open.length))
    const next: number[] = []
    let progress = false
    for (const s of open) {
      const lines = bySteps.get(s)!
      let i = taken.get(s)!.length
      let spent = 0
      while (i < lines.length && spent + cost(lines[i]) <= share && cost(lines[i]) <= left - spent) { spent += cost(lines[i]); taken.get(s)!.push(lines[i]); i++; progress = true }
      left -= spent
      if (i < lines.length) next.push(s)
    }
    if (!progress) break
    open = next
  }
  return steps.flatMap(s => taken.get(s)!)
}
/**
 * 02/11 (owner: the report on phone accessories cited a Facebook page and a homework-sharing site next to ministries and the press): pages that
 * are posts, profiles or shared homework are never research evidence. Pure.
 */
export function isLowValueSource(url: string): boolean {
  let host = ''
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return false }
  return /(^|\.)(facebook|fb|instagram|tiktok|pinterest|twitter|x|zalo|studocu|scribd|slideshare|coursehero|quizlet)\.[a-z.]+$/.test(host)
}
/** Owner 31/10 ("báo cáo có phần hình ảnh chèn vào cho hợp nội dung từng mục"): pictures per report, at most this many (one per section). */
export const MAX_SECTION_IMAGES = 4
/** `published`: the page's own publication date (YYYY-MM-DD) when the reader found one. */
export interface Evidence { id: number; title: string; url: string; snippet: string; text: string; published?: string; /** the real site of a Google-redirect result */ site?: string }
/**
 * Owner 31/10 ("mấu chốt cuối cùng của report là số liệu và sự chính xác"): a finding that states one figure also carries it as data -
 * what is measured (`series`), for what (`label`: an item or a year), the value and its unit - checked by code against its source's own
 * text (numberInText) before it may draw a chart.
 */
export interface Figure { series: string; label: string; value: number; unit: string }
export interface Finding { step: number; text: string; source: number; figure?: Figure }
/** A chart the code draws from the figures of one section; every point names its source. */
export interface ResearchChart { section: string; title: string; unit: string; kind: 'bar' | 'line'; points: Array<{ label: string; value: number; source: number }> }
export const MAX_CHARTS = 4
/** The most text of one page the notes step reads. */
export const PAGE_TEXT_LIMIT = 9000
/** The page limit this run uses: PAGE_TEXT_LIMIT, or 6000 under the DEEP_RESEARCH_LEAN_PAGE cost experiment (deepResearchLean.ts). */
export const pageTextLimit = (): number => leanValue('page', PAGE_TEXT_LIMIT, 6000)
/** One research step's counts (never text): search rows, pages given to the notes, pages with text, pages longer than the limit, findings the notes gave and the run kept. */
export interface StepStat { rows: number; evidence: number; with_text: number; cut_pages: number; notes: number; kept: number }
const MAX_CHART_POINTS = 12
export type StepStatus = 'pending' | 'running' | 'done' | 'failed'
/** A cited source as the card links it (https only); the report text names it without a link. */
export interface ResearchLink { id: number; title: string; url: string }
export interface ResearchStatus { type: 'tappy.research.v1'; title: string; phase: 'planning' | 'researching' | 'writing' | 'done' | 'failed'; steps: Array<{ title: string; status: StepStatus }>; sources: number; links?: ResearchLink[] }

const PHASES = new Set(['planning', 'researching', 'writing', 'done', 'failed'])
const STEP_STATUSES = new Set(['pending', 'running', 'done', 'failed'])

/** Client: the LATEST research card among a message's annotations, or null; malformed frames are ignored. Pure. */
export function readResearchStatus(annotations: unknown[] | undefined | null): ResearchStatus | null {
  if (!Array.isArray(annotations)) return null
  let out: ResearchStatus | null = null
  for (const a of annotations) {
    const c = a as Partial<ResearchStatus> | null
    if (!c || typeof c !== 'object' || c.type !== 'tappy.research.v1' || typeof c.phase !== 'string' || !PHASES.has(c.phase)) continue
    const steps = (Array.isArray(c.steps) ? c.steps : []).filter(s => s && typeof s.title === 'string' && STEP_STATUSES.has(s.status)).slice(0, DEEP_RESEARCH_LIMITS.steps)
    const links = (Array.isArray(c.links) ? c.links : []).filter(l => l && typeof l.id === 'number' && typeof l.title === 'string' && httpsUrl(l.url)).slice(0, 40)
    out = { type: 'tappy.research.v1', title: typeof c.title === 'string' ? c.title.slice(0, 160) : '', phase: c.phase, steps: steps.map(s => ({ title: s.title.slice(0, 160), status: s.status })), sources: typeof c.sources === 'number' && c.sources >= 0 ? Math.floor(c.sources) : 0, ...(links.length ? { links: links.map(l => ({ id: l.id, title: l.title.slice(0, 200), url: l.url })) } : {}) }
  }
  return out
}

/** An absolute https URL, nothing else (the card's links; the server sends only https search results). */
export function httpsUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.length > 2000) return false
  try { return new URL(u).protocol === 'https:' } catch { return false }
}

export interface DeepResearchDeps {
  plan(question: string, context: string): Promise<ResearchPlan>
  /** One query: its search results with the text of the pages read (empty when nothing came back). */
  gather(query: string, focus: string): Promise<Array<{ title: string; url: string; snippet: string; text: string; published?: string; site?: string }>>
  /** The step's findings; `source` is an id of the evidence handed in; `figure` when the finding states one figure. */
  notes(step: string, question: string, evidence: readonly Evidence[]): Promise<Array<{ text: string; source: number; figure?: Figure | null }>>
  write(input: { question: string; plan: ResearchPlan; evidence: readonly Evidence[]; findings: readonly Finding[] }): AsyncIterable<string>
  /**
   * DEEP_RESEARCH_V2 only (03/11): writes sections for the parts of the question no heading of the written report names, from the findings that
   * speak to each; appended to the report. Absent = no repair.
   */
  repair?(input: { question: string; plan: ResearchPlan; evidence: readonly Evidence[]; parts: ReadonlyArray<{ part: string; findings: readonly Finding[] }> }): AsyncIterable<string>
  /**
   * DEEP_RESEARCH_V2 only: a model reads the written report against the parts of the question and says for each whether the report answers it
   * (the semantic half of the check; a heading that names a part proves nothing about its content). Absent = the structural check only.
   */
  critic?(input: { question: string; parts: readonly string[]; report: string }): Promise<Array<{ part: string; verdict: 'answered' | 'thin' | 'missing' }>>
  /** DEEP_RESEARCH_V2 only: what the run's model calls have cost so far, in USD (the web searches are not in it). Absent = no cost ceiling. */
  spent?(): number
  /**
   * The parts of the question the findings do not answer yet, as at most GAP_STEPS follow-up steps (title + queries); [] = covered.
   * Absent = one research round only.
   */
  gaps?(question: string, plan: ResearchPlan, findings: readonly string[], coverage?: ReadonlyArray<{ title: string; findings: number; figures: number }>): Promise<Array<{ title: string; queries: string[]; completes?: number | null }>>
  /** Picture URLs for one image query (server-chosen, never the model's); absent = a report without pictures. */
  images?(query: string): Promise<string[]>
  /** Diagnostics only (CONSULT_TRACE_DIAGNOSTICS, never in production): what each step searched, read and kept. Absent = nothing is traced. */
  trace?(event: Record<string, unknown>): void
  now?: () => number
}

/** One section picture: `title` is the section heading it goes under (the client matches it like an item picture, answerDoc/media). */
export interface SectionImage { title: string; src: string }
export interface ResearchEmit { status(s: ResearchStatus): void; text(t: string): void; images?(items: SectionImage[]): void; charts?(charts: ResearchChart[]): void }

/**
 * The one plan step whose title shares the most terms with a follow-up's title, when there is exactly one best; else undefined. A term is a
 * word of 5+ letters or two neighbouring words (Vietnamese words are short: "đối thủ", "quy mô"). Pure.
 */
export function stepForGap(title: string, steps: ReadonlyArray<{ title: string }>): number | undefined {
  const scores = termScores(title, steps)
  const best = Math.max(0, ...scores)
  return best >= 1 && scores.filter(x => x === best).length === 1 ? scores.indexOf(best) + 1 : undefined
}

/**
 * The numbers a written report states that no finding states (a check of the writer, never of the sources): every number of 3+ digits, with a
 * decimal or with a percent sign, outside citation brackets and years, that is in none of the findings' text. Pure; a scenario table's computed
 * figures show up here by design (they are the report's own labelled assumptions).
 */
export function unsupportedNumbers(report: string, findings: ReadonlyArray<{ text: string }>): string[] {
  const pool = findings.map(f => f.text).join('\n')
  const bare = report.replace(/\[\d+\](\[\d+\])*/g, ' ')
  const out = new Set<string>()
  for (const m of bare.matchAll(/\d[\d.,]*\d%?|\d%/g)) {
    const raw = m[0].replace(/%$/, '')
    if (/^(19|20)\d{2}$/.test(raw)) continue
    if (!(raw.length >= 3 || /[.,]/.test(raw) || m[0].endsWith('%'))) continue
    const value = Number(raw.replace(/,/g, ''))
    if (numbersOf(pool).has(raw) || numberInText(Number(raw.replace(/\./g, '').replace(',', '.')), pool) || (Number.isFinite(value) && numberInText(value, pool))) continue
    out.add(m[0])
  }
  return [...out]
}

/** The distinct numbers a text writes (digits with their separators, at least 2 characters), as strings. Pure. */
export function numbersOf(text: string): Set<string> {
  return new Set([...text.matchAll(/\d[\d.,]*\d/g)].map(m => m[0]))
}

/**
 * Whether `value` is written in `text` - in any of the ways a page writes a number: 2.26 / 2,26 / 2.260.000 / 2,260,000 / 2 260 000 / 35%.
 * Every number in the text is read both ways (dot or comma as the decimal mark); one reading equal to the value is enough. Pure.
 */
export function numberInText(value: number, text: string): boolean {
  if (!Number.isFinite(value)) return false
  const same = (x: number) => Math.abs(x - value) <= Math.max(1e-9, Math.abs(value) * 1e-9)
  // runs of digits with dots / commas, and thousands grouped by a (no-break) space: "2 260 000"
  const runs = [...text.matchAll(/\d[\d.,]*\d|\d/g), ...text.matchAll(/\d{1,3}(?:[ \xa0]\d{3})+(?!\d)/g)]
  for (const m of runs) {
    const raw = m[0].replace(/[ \xa0]/g, '')
    const readings = [raw.replace(/,/g, ''), raw.replace(/\./g, '').replace(',', '.')]
    // a run like "2.260.000" (thousands only) reads as one number; "2,26" as a decimal; each reading must be a plain number
    if (readings.some(r => /^\d+(\.\d+)?$/.test(r) && same(Number(r)))) return true
  }
  return false
}

/** A finding's figure as the run keeps it: clean strings, a finite value written in its own source's text; anything else → none. Pure. */
export function checkedFigure(f: unknown, sourceText: string): Figure | undefined {
  const x = (f ?? null) as Partial<Figure> | null
  if (!x || typeof x !== 'object') return undefined
  const series = clean(x.series, 80), label = clean(x.label, 40), unit = clean(x.unit, 24)
  const value = typeof x.value === 'number' ? x.value : NaN
  if (!series || !label || !Number.isFinite(value) || !numberInText(value, sourceText)) return undefined
  return { series, label, value, unit }
}

/**
 * The charts of a written report: per section (a plan step with the follow-ups that complete it), the largest group of figures measuring
 * the same thing in the same unit, when it has at least 3 different labels - a line over the years when every label is a year, else bars
 * (in the order the sources gave them). The chart goes under the heading that is its step's title (like the section pictures). Pure.
 */
export function sectionCharts(report: string, plan: ResearchPlan, findings: readonly Finding[]): ResearchChart[] {
  const heads = parseDoc(report).filter((b): b is Extract<DocBlock, { t: 'heading' }> => b.t === 'heading' && b.level === 2).map(b => headingTitle(b.text))
  const key = (s: string) => titleKey(s)
  const out: ResearchChart[] = []
  plan.steps.forEach((s, k) => {
    if (s.completes || out.length >= MAX_CHARTS) return
    const own = headingTitle(s.title)
    const head = own ? heads.find(h => !!h && key(h) === key(own)) : undefined
    if (!head) return
    const groups = new Map<string, Finding[]>()
    for (const f of findings) {
      if (!f.figure || !(f.step === k + 1 || plan.steps[f.step - 1]?.completes === k + 1)) continue
      const g = `${key(f.figure.series)}|${key(f.figure.unit)}`
      groups.set(g, [...(groups.get(g) ?? []), f])
    }
    let best: Array<{ label: string; value: number; source: number }> = []
    let first: Finding | undefined
    for (const g of groups.values()) {
      const seen = new Set<string>()
      const pts = g.filter(f => !seen.has(key(f.figure!.label)) && !!seen.add(key(f.figure!.label))).map(f => ({ label: f.figure!.label, value: f.figure!.value, source: f.source }))
      // 02/11: labels that mix whole years with half-years, months or "end of 2021" are not one axis (a chart of "Cuối năm 2021, Tháng 3/2022, 2023")
      if (pts.some(p => /(19|20)\d{2}/.test(p.label)) && !pts.every(p => /^(19|20)\d{2}$/.test(p.label))) continue
      if (pts.length > best.length) { best = pts; first = g[0] }
    }
    if (best.length < 3 || !first) return
    const years = best.every(p => /^(19|20)\d{2}$/.test(p.label))
    const points = (years ? [...best].sort((a, b) => Number(a.label) - Number(b.label)) : best).slice(0, MAX_CHART_POINTS)
    out.push({ section: head, title: first.figure!.series, unit: first.figure!.unit, kind: years ? 'line' : 'bar', points })
  })
  return out
}

const CHARTS_KIND = 'tappy.research_charts.v1'
/** Client: the charts among a message's annotations (the last valid frame wins), re-checked; none → []. Pure. */
export function readResearchCharts(annotations: unknown[] | undefined | null): ResearchChart[] {
  if (!Array.isArray(annotations)) return []
  let out: ResearchChart[] = []
  for (const a of annotations) {
    const c = a as { type?: unknown; charts?: unknown } | null
    if (!c || typeof c !== 'object' || c.type !== CHARTS_KIND || !Array.isArray(c.charts)) continue
    out = (c.charts as unknown[]).flatMap((x): ResearchChart[] => {
      const r = (x ?? {}) as Partial<ResearchChart>
      const points = (Array.isArray(r.points) ? r.points : []).filter(p => p && typeof p.label === 'string' && typeof p.value === 'number' && Number.isFinite(p.value) && typeof p.source === 'number')
        .slice(0, MAX_CHART_POINTS).map(p => ({ label: clean(p.label, 40), value: p.value, source: p.source }))
      if (typeof r.section !== 'string' || typeof r.title !== 'string' || points.length < 2) return []
      return [{ section: clean(r.section, 80), title: clean(r.title, 80), unit: clean(r.unit, 24), kind: r.kind === 'line' ? 'line' : 'bar', points }]
    }).slice(0, MAX_CHARTS)
  }
  return out
}
export const chartsFrame = (charts: ResearchChart[]) => ({ type: CHARTS_KIND, charts })

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** The plan as the run uses it: titled, 1..steps steps, each with 1..queriesPerStep non-empty queries; nothing usable → null. Pure. */
export function normalisePlan(p: unknown, question: string): ResearchPlan | null {
  const r = (p ?? {}) as { title?: unknown; sources_label?: unknown; steps?: unknown; parts?: unknown; uncovered?: unknown }
  const parts = (Array.isArray(r.parts) ? r.parts : []).map(x => clean(x, 120)).filter(Boolean).slice(0, 12)
  const uncovered = (Array.isArray(r.uncovered) ? r.uncovered : []).map(x => clean(x, 120)).filter(Boolean).slice(0, PART_STEPS)
  const steps = (Array.isArray(r.steps) ? r.steps : []).map(s => {
    const x = (s ?? {}) as { title?: unknown; queries?: unknown; image_query?: unknown }
    const queries = (Array.isArray(x.queries) ? x.queries : []).map(q => clean(q, 200)).filter(Boolean).slice(0, leanValue('queries', DEEP_RESEARCH_LIMITS.queriesPerStep, 2))
    const image = clean(x.image_query, 80)
    return { title: clean(x.title, 160), queries, ...(image ? { image_query: image } : {}) }
  }).filter(s => s.title && s.queries.length).slice(0, leanValue('planSteps', DEEP_RESEARCH_LIMITS.planSteps, 8))
  if (!steps.length) return null
  // the label is one short heading word or two: markup characters are blanked like a source title's
  const label = clean(r.sources_label, 30).replace(/[[\]()<>`*_#|\\]/g, ' ').replace(/\s+/g, ' ').trim()
  return { title: clean(r.title, 160) || clean(question, 120), ...(label ? { sources_label: label } : {}), ...(parts.length ? { parts } : {}), ...(uncovered.length ? { uncovered } : {}), steps }
}

/** At most this many steps are added for parts of the question no step covers. */
export const PART_STEPS = 3
/**
 * 02/11 (blind grading: a report with no section on how the players make money, another with no gaps section, though the question listed both):
 * every part the question asks for must have a step. The plan call says, for each part, which step researches it; a part it says no step
 * researches (`uncovered`) gets a step of its own, titled with the person's words and searched as "part - subject". Pure.
 */
export function withPartSteps(plan: ResearchPlan): ResearchPlan {
  const missing = (plan.uncovered ?? []).slice(0, PART_STEPS)
  if (!missing.length) return plan
  return { ...plan, steps: [...plan.steps, ...missing.map(part => ({ title: part.slice(0, 160), queries: [`${part} - ${plan.title}`.slice(0, 200)] }))] }
}

/**
 * The writer never writes a link (its instruction says so, and this makes it true): a markdown link keeps its label, a bare URL goes.
 * Streaming-safe - text is released up to the last whitespace before any "[" that may still open a link, the rest waits for the next delta
 * (or the end).
 */
export function linkStripper(): { push(delta: string): string; end(): string } {
  let carry = ''
  const strip = (s: string) => s.replace(/\[([^\]\n]*)\]\(\s*[a-z][a-z0-9+.-]*:[^)\s]*\s*\)/gi, '$1').replace(/\]\(\s*https?:[^)\s]*\s*\)/gi, ']').replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
  // a "[" whose link is not finished yet ("[label", "[label]", "[label](http...") holds the text from there on
  const openLink = (s: string) => {
    const at = s.lastIndexOf('[')
    if (at < 0) return -1
    const tail = s.slice(at)
    if (tail.includes('\n') || tail.length >= 600) return -1
    return !tail.includes(']') || tail.endsWith(']') || (tail.includes('](') && !/\]\([^)]*\)/.test(tail)) ? at : -1
  }
  return {
    push(delta: string) {
      carry += delta
      const hold = openLink(carry)
      const upto = hold < 0 ? carry : carry.slice(0, hold)
      const cut = Math.max(upto.lastIndexOf(' '), upto.lastIndexOf('\n'))
      if (cut < 0 && carry.length < 600) return ''
      const at = cut < 0 ? carry.length : cut + 1
      const out = strip(carry.slice(0, at)); carry = carry.slice(at)
      return out
    },
    end() { const out = strip(carry); carry = ''; return out },
  }
}

/**
 * A search result's page, not Google's wrapper around it (measured 31/10: sources shown as "google.com" / "translate.google.com"): a redirect
 * (`google.com/url?q=` / `url=`), a translate proxy (`translate.google.com/translate?u=`, `<host-with-dashes>.translate.goog`) becomes the page
 * it points to; any other Google page (a search page) is not a source (null). Only https results are sources. Pure.
 */
export function canonicalSourceUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const host = u.hostname.toLowerCase()
  if (host.endsWith('.translate.goog')) {
    // Google's scheme: "-" stands for "." and "--" for "-" in the original host; the _x_tr_* parameters are the proxy's own
    const original = host.slice(0, -'.translate.goog'.length).split('--').map(p => p.replace(/-/g, '.')).join('-')
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('_x_tr_')) u.searchParams.delete(k)
    return canonicalSourceUrl(`https://${original}${u.pathname}${u.search}${u.hash}`)
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    // 31/10: a google.com/goto token the search layer could not resolve (Google's bot check) - kept: it opens the page in a browser, and its
    // snippet is evidence; the site it names comes with the row (Evidence.site)
    if (u.protocol === 'https:' && u.pathname === '/goto' && u.searchParams.has('url')) return u.toString()
    const inner = u.pathname === '/url' ? u.searchParams.get('q') ?? u.searchParams.get('url') : host.startsWith('translate.') ? u.searchParams.get('u') : null
    return inner && inner !== raw ? canonicalSourceUrl(inner) : null
  }
  return u.protocol === 'https:' ? u.toString() : null
}

/**
 * Measured 31/10: the writer numbered its own sections "1. Summary, 2. Scope" and then the research sections from 1 again. The numbers are
 * the code's: every "## <n>." heading is renumbered 1, 2, 3… in order, and every "### <n>.<m>" under it becomes "<section>.<1, 2…>" (an
 * unnumbered heading stays as written). Streaming-safe: a line that may be a heading is held until it ends.
 */
export function headingNumberer(): { push(delta: string): string; end(): string } {
  let held = ''
  let mid = false
  let section = 0
  let sub = 0
  const fix = (line: string) => {
    const h2 = /^##\s+\d{1,2}[.)]?\s+/.exec(line)
    if (h2 && !line.startsWith('###')) { section++; sub = 0; return `## ${section}. ${line.slice(h2[0].length)}` }
    const h3 = /^###\s+\d{1,2}\.\d{1,2}[.)]?\s+/.exec(line)
    if (h3 && section > 0) { sub++; return `### ${section}.${sub}. ${line.slice(h3[0].length)}` }
    return line
  }
  return {
    push(delta: string) {
      let text = held + delta
      held = ''
      let out = ''
      for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n')) {
        const line = text.slice(0, i)
        out += (mid ? line : fix(line)) + '\n'
        mid = false
        text = text.slice(i + 1)
      }
      if (!text) return out
      if (!mid && text.startsWith('#') && text.length < 300) { held = text; return out }
      mid = true
      return out + text
    },
    end() { const out = mid ? held : fix(held); held = ''; return out },
  }
}

/** The evidence the findings cite, in report order. */
export const citedEvidence = (evidence: readonly Evidence[], findings: readonly Finding[]) => {
  const cited = new Set(findings.map(f => f.source))
  return evidence.filter(e => cited.has(e.id))
}

/**
 * The sources list under the report: built by code, numbered as in the report, as PLAIN TEXT - the title and the site, never a link (the
 * research card links them; retrievalArchitecture.test.ts G1 keeps markdown links from retrieval to the enrichment site). Markdown and HTML
 * characters of a title are blanked, so a search result cannot turn into markup.
 */
export function sourcesBlock(evidence: readonly Evidence[], findings: readonly Finding[], lang: string, heading?: string): string {
  const used = citedEvidence(evidence, findings)
  if (!used.length) return ''
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
  const label = (t: string) => t.replace(/[[\]()<>`*_#|\\\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
  const head = heading || (lang === 'en' ? 'Sources' : 'Nguồn')
  return `\n\n### ${head}\n${used.map(e => `${e.id}. ${label(e.title) || e.site || host(e.url)} — ${e.site ?? host(e.url)}${e.published ? `, ${sourceDate(e.published, lang)}` : ''}`).join('\n')}\n`
}

/** A source's date as the reader's locale writes it: 22/10/2025 (vi), 2025-10-22 otherwise. Pure. */
export function sourceDate(iso: string, lang: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return lang === 'vi' ? `${d}/${m}/${y}` : `${y}-${m}-${d}`
}

/**
 * Which picture goes under which section of the written report: the writer heads each research section with its step's title, so a picture
 * goes to the level-2 heading whose title IS its step's title (numbering aside). No position guess: the report also has sections of its own
 * (the summary, the scope note, the recommendations), and a picture under the wrong section is worse than none. The picture's `title` is the
 * heading's title as the client reads it (answerDoc/parse headingTitle), so the article layout puts it right under that heading. Pure.
 */
export function sectionImages(report: string, plan: ResearchPlan, pictures: ReadonlyArray<string | null>): SectionImage[] {
  const heads = parseDoc(report).filter((b): b is Extract<DocBlock, { t: 'heading' }> => b.t === 'heading' && b.level === 2).map(b => headingTitle(b.text))
  const used = new Set<number>()
  const at = new Map<number, number>()
  const sections = sectionSteps(plan) // the plan's own steps come first, so `pictures[k]` is section k's
  sections.forEach((s, k) => {
    const own = headingTitle(s.title)
    const i = own ? heads.findIndex((h, j) => !used.has(j) && !!h && titleKey(h) === titleKey(own)) : -1
    if (i >= 0) { used.add(i); at.set(k, i) }
  })
  const out: SectionImage[] = []
  sections.forEach((_, k) => {
    const src = pictures[k]
    const i = at.get(k)
    if (!src || !httpsUrl(src) || i === undefined || out.length >= MAX_SECTION_IMAGES) return
    out.push({ title: heads[i]!, src })
  })
  return out
}

/** Runs one deep research. Never throws: a failure ends with a `failed` status and whatever was written. */
/** `left` (review 02/11): the person went away - the run stops where it is, writes nothing more and ends as 'client_gone'. */
export async function runDeepResearch(question: string, context: string, lang: string, deps: DeepResearchDeps, emit: ResearchEmit, left?: AbortSignal): Promise<{ plan: ResearchPlan | null; evidence: Evidence[]; findings: Finding[]; failed: string | null; cut?: boolean; followUps?: number; charts?: number; figures?: { proposed: number; kept: number }; stepStats?: StepStat[]; unsupported?: string[]; repaired?: number }> {
  const now = deps.now ?? Date.now
  const t0 = now()
  // DEEP_RESEARCH_V2 (03/11, OFF unless "1", never in production): several gap rounds in this request and a repair of the parts the report does not name
  const v2 = deepResearchV2On()
  const researchDeadline = v2 ? V2_LIMITS.researchDeadlineMs : DEEP_RESEARCH_LIMITS.researchDeadlineMs
  const evidence: Evidence[] = []
  const findings: Finding[] = []
  const byUrl = new Map<string, Evidence>()
  /** For the run's log: figures the notes gave, and those found in their own source. */
  const figureCount = { proposed: 0, kept: 0 }
  const stepStats: StepStat[] = []
  const fail = (title: string, steps: ResearchStatus['steps'], why: string) => { emit.status({ type: 'tappy.research.v1', title, phase: 'failed', steps, sources: evidence.length }); return why }
  emit.status({ type: 'tappy.research.v1', title: clean(question, 120), phase: 'planning', steps: [], sources: 0 })
  let plan: ResearchPlan | null = null
  try { const first = normalisePlan(await deps.plan(question, context), question); plan = first ? withPartSteps(first) : null } catch { plan = null }
  if (left?.aborted) return { plan, evidence, findings, failed: 'client_gone' }
  if (!plan) return { plan: null, evidence, findings, failed: fail(clean(question, 120), [], 'no_plan') }
  deps.trace?.({ ev: 'plan', title: plan.title, steps: plan.steps.map(s => ({ title: s.title, queries: s.queries })) })
  const steps: ResearchStatus['steps'] = plan.steps.map(s => ({ title: s.title, status: 'pending' }))
  const show = (phase: ResearchStatus['phase']) => emit.status({ type: 'tappy.research.v1', title: plan!.title, phase, steps: steps.map(s => ({ ...s })), sources: evidence.length })
  show('researching')
  // the section pictures are looked up while the research runs (no added wait): the first MAX_SECTION_IMAGES steps that have something to show
  let wanted = 0
  const picturesP: Promise<Array<string | null>> = Promise.all(plan.steps.map(async s => {
    if (!deps.images || !s.image_query || wanted >= MAX_SECTION_IMAGES) return null
    wanted++
    return (await deps.images(s.image_query).catch(() => [] as string[])).find(httpsUrl) ?? null
  }))

  const runStep = async (k: number): Promise<void> => {
    const step = plan!.steps[k]
    steps[k].status = 'running'; show('researching')
    const gathered = (await Promise.all(step.queries.map(q => deps.gather(q, `${step.title} - ${question}`).catch(() => [])))).flat()
    const mine: Evidence[] = []
    for (const g of gathered) {
      const url = g.url ? canonicalSourceUrl(g.url) : null
      if (!url || isLowValueSource(url)) continue
      let e = byUrl.get(url)
      if (!e) {
        const published = typeof g.published === 'string' && /^\d{4}-\d{2}-\d{2}/.test(g.published) ? g.published.slice(0, 10) : undefined
        const site = typeof g.site === 'string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(g.site) ? g.site.toLowerCase() : undefined
        e = { id: evidence.length + 1, title: clean(g.title, 200), url, snippet: clean(g.snippet, 400), text: g.text.slice(0, pageTextLimit()), ...(published ? { published } : {}), ...(site ? { site } : {}) }
        evidence.push(e); byUrl.set(url, e)
      }
      if (!mine.includes(e)) mine.push(e)
    }
    // 02/11 (owner: "tại sao thiếu thông tin"): counts per step - where the information is lost (not found / not read / cut at the page limit / not kept)
    const stat = stepStats[k] = { rows: gathered.length, evidence: mine.length, with_text: gathered.filter(g => g.text.trim()).length, cut_pages: gathered.filter(g => g.text.length > pageTextLimit()).length, notes: 0, kept: 0 }
    if (!mine.length) { steps[k].status = 'failed'; show('researching'); return }
    const got = await deps.notes(step.title, question, mine).catch(() => [])
    stat.notes = got.length
    deps.trace?.({ ev: 'dump', step: k + 1, evidence: mine.map(e => ({ id: e.id, url: e.url, title: e.title, snippet: e.snippet, text: e.text })), findings: got.map(f => ({ source: f.source, text: f.text, figure: f.figure ?? null })) })
    deps.trace?.({ ev: 'step', step: k + 1, title: step.title, queries: step.queries, evidence: mine.map(e => ({ id: e.id, url: e.url.slice(0, 110), title: e.title.slice(0, 90), chars: e.text.length })), findings: got.map(f => ({ source: f.source, text: clean(f.text, 200), figure: !!f.figure })) })
    const byId = new Map(mine.map(e => [e.id, e]))
    let kept = 0
    const keptNumbers: Array<Set<string>> = []
    for (const f of got) {
      const text = clean(f.text, 600)
      const src = byId.get(f.source)
      if (!text || !src) continue
      // 02/11 (measured: one company's quarterly release restated by four sites filled 7 of a step's slots): a finding whose figures are all
      // already in a kept finding of the same step is the same fact again
      const nums = numbersOf(text)
      if (nums.size >= 2 && keptNumbers.some(k => [...nums].every(n => k.has(n)))) continue
      keptNumbers.push(nums)
      // a figure stays only when its value is written in its own source (title, snippet or the page read)
      const figure = checkedFigure(f.figure, `${src.title}\n${src.snippet}\n${src.text}`)
      if (f.figure) figureCount.proposed++
      if (figure) figureCount.kept++
      findings.push({ step: k + 1, text, source: f.source, ...(figure ? { figure } : {}) })
      stat.kept = kept + 1
      if (++kept >= DEEP_RESEARCH_LIMITS.findingsPerStep) break
    }
    steps[k].status = 'done'; show('researching')
  }
  // every step at once; a step still running at the deadline is dropped (marked failed), the report is written from what came back
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'deadline'>(r => { timer = setTimeout(() => r('deadline'), Math.max(0, researchDeadline - (now() - t0))) })
  const gone = new Promise<'deadline'>(r => { if (left?.aborted) r('deadline'); else left?.addEventListener('abort', () => r('deadline'), { once: true }) })
  const round = (from: number) => Promise.race([Promise.all(plan!.steps.slice(from).map((_, j) => runStep(from + j).catch(() => { steps[from + j].status = 'failed' }))), deadline, gone])
  let timedOut = (await round(0)) === 'deadline'
  // the follow-up round: what the question asks that the findings do not answer yet, as follow-up steps (shown on the card like the others).
  // One-pass: one round. DEEP_RESEARCH_V2: up to V2_LIMITS.maxGapRounds, each further one decided by decideNext (time, rounds, diminishing returns, coverage)
  let followUps = 0
  let lastNew = 0
  for (let r = 0; r < (v2 ? V2_LIMITS.maxGapRounds : 1); r++) {
    if (timedOut || !deps.gaps || !findings.length || researchDeadline - (now() - t0) < GAP_MIN_LEFT_MS) break
    if (r > 0) {
      const d = decideNext({ round: r, newFindings: lastNew, msLeft: researchDeadline - (now() - t0), coverage: stepCoverage(plan, findings), ...(deps.spent ? { llmUsd: deps.spent() } : {}) })
      deps.trace?.({ ev: 'decide', round: r, next: d.next, reason: d.reason })
      if (d.next === 'synthesize') break
    }
    // how much each plan step brought (02/11): the check sees a thin step, not only the pooled findings
    const coverage: Array<{ title: string; findings: number; figures: number }> = plan.steps.map((s, k) => ({ title: s.title, findings: findings.filter(f => f.step === k + 1).length, figures: findings.filter(f => f.step === k + 1 && f.figure).length }))
    const asked: Awaited<ReturnType<NonNullable<DeepResearchDeps['gaps']>>> = await deps.gaps(question, plan, packFindingsForGapCheck(findings), coverage).catch(() => [])
    const planned = plan.steps.length
    const more: ResearchPlan['steps'] = (Array.isArray(asked) ? asked : [])
      .map(g => {
        const s = normalisePlan({ title: plan!.title, steps: [g] }, question)?.steps[0]
        const given = Number((g as { completes?: unknown } | null)?.completes)
        // 02/11: a follow-up the check did not tie to a step still joins the section whose title it shares the most words with (when that is unique)
        const c = Number.isInteger(given) && given >= 1 && given <= planned ? given : stepForGap(s?.title ?? '', plan!.steps.slice(0, planned))
        return s ? { title: s.title, queries: s.queries, ...(c ? { completes: c } : {}) } : null
      }).filter((s): s is ResearchPlan['steps'][number] => !!s).slice(0, leanValue('gaps', GAP_STEPS, 2))
    deps.trace?.({ ev: 'gaps', steps: more.map(s => ({ title: s.title, queries: s.queries })) })
    if (!more.length) break
    const from = plan.steps.length
    plan = { ...plan, steps: [...plan.steps, ...more] }
    for (const s of more) steps.push({ title: s.title, status: 'pending' })
    followUps += more.length
    show('researching')
    const before = findings.length
    timedOut = (await round(from)) === 'deadline'
    lastNew = findings.length - before
  }
  clearTimeout(timer)
  if (left?.aborted) return { plan, evidence, findings, failed: 'client_gone' }
  for (const s of steps) if (s.status !== 'done') s.status = 'failed'
  if (!findings.length) return { plan, evidence, findings, failed: fail(plan.title, steps, 'no_findings') }

  show('writing')
  // the report numbers its sources 1..n: only the cited ones, renumbered in the order they were found (the person reads [1]..[n], not [3][14][24])
  const renumber = new Map(citedEvidence(evidence, findings).map((e, i) => [e.id, i + 1]))
  const cited = citedEvidence(evidence, findings).map(e => ({ ...e, id: renumber.get(e.id)! }))
  const notes = findings.map(f => ({ ...f, source: renumber.get(f.source)! }))
  const stripper = linkStripper()
  const numberer = headingNumberer()
  let cut = false
  let repaired = 0
  let written = ''
  const say = (t: string) => { if (t) { written += t; emit.text(t) } }
  const finish = () => { say(numberer.push(stripper.end())); say(numberer.end()) }
  try {
    for await (const delta of deps.write({ question, plan, evidence: cited, findings: notes })) {
      say(numberer.push(stripper.push(delta)))
      if (left?.aborted) break
      // the run's own deadline: what was written stays and gets its sources (the route must answer inside its maxDuration)
      if (now() - t0 >= DEEP_RESEARCH_LIMITS.runDeadlineMs) { cut = true; break }
    }
    // DEEP_RESEARCH_V2 (03/11): the parts of the question that no heading of the report names are answered in one appended section (once; a structural check only)
    if (v2 && deps.repair && !left?.aborted && !cut && plan.parts?.length) {
      const heads = parseDoc(written).filter((b): b is Extract<DocBlock, { t: 'heading' }> => b.t === 'heading').map(b => headingTitle(b.text) ?? '').filter(Boolean)
      const parts = plan.parts
      const named = missingParts(parts, heads)
      // the semantic half: a model reads the report against the parts; a part it calls thin or missing is repaired like one no heading names
      let weak: string[] = []
      if (deps.critic && DEEP_RESEARCH_LIMITS.runDeadlineMs - (now() - t0) >= V2_LIMITS.repairMinMsLeft + V2_LIMITS.criticMaxMs) {
        let criticTimer: ReturnType<typeof setTimeout> | undefined
        const verdicts = await Promise.race([
          deps.critic({ question, parts, report: written.slice(0, V2_LIMITS.criticMaxReportChars) }).catch(() => []),
          new Promise<[]>(r => { criticTimer = setTimeout(() => r([]), V2_LIMITS.criticMaxMs) }),
        ])
        clearTimeout(criticTimer)
        weak = verdicts.filter(v => v.verdict !== 'answered' && parts.includes(v.part)).map(v => v.part)
      }
      const absent = [...new Set([...named, ...weak])].slice(0, V2_LIMITS.maxRepairParts)
      deps.trace?.({ ev: 'repair_check', parts: parts.length, unnamed: named.length, weak: weak.length, repaired: absent.length })
      if (absent.length && DEEP_RESEARCH_LIMITS.runDeadlineMs - (now() - t0) >= V2_LIMITS.repairMinMsLeft) {
        say(numberer.push(stripper.push('\n\n')))
        for await (const delta of deps.repair({ question, plan, evidence: cited, parts: absent.map(p => ({ part: p, findings: findingsForPart(p, notes, V2_LIMITS.repairFindingsPerPart) })) })) {
          say(numberer.push(stripper.push(delta)))
          if (left?.aborted) break
          if (now() - t0 >= DEEP_RESEARCH_LIMITS.runDeadlineMs) { cut = true; break }
        }
        repaired = absent.length
      }
    }
    finish()
    // review 02/11: a writer that wrote nothing is a failed write (refunded), not a report of sources alone
    if (!written.trim()) throw new Error('empty_report')
  } catch {
    finish()
    return { plan, evidence, findings, failed: left?.aborted ? 'client_gone' : fail(plan.title, steps, 'write_failed'), cut }
  }
  if (left?.aborted) return { plan, evidence, findings, failed: 'client_gone', cut }
  emit.text(sourcesBlock(cited, notes, lang, plan.sources_label))
  // the pictures go under their sections (an annotation the article layout places; never in the text). A lookup still running is not waited for.
  let pictureTimer: ReturnType<typeof setTimeout> | undefined
  const pictures = await Promise.race([picturesP, new Promise<null>(r => { pictureTimer = setTimeout(() => r(null), 1500) })])
  clearTimeout(pictureTimer)
  // owner 31/10: the figures matter more than a picture - a section with a chart gets the chart, not a (small) picture
  const charts = sectionCharts(written, plan, notes)
  if (charts.length && emit.charts) emit.charts(charts)
  const charted = new Set(charts.map(c => titleKey(c.section)))
  const placed = (pictures ? sectionImages(written, plan, pictures) : []).filter(p => !charted.has(titleKey(p.title)))
  if (placed.length && emit.images) emit.images(placed)
  const links = cited.map(e => ({ id: e.id, title: e.title, url: e.url }))
  emit.status({ type: 'tappy.research.v1', title: plan.title, phase: 'done', steps: steps.map(s => ({ ...s })), sources: evidence.length, links })
  return { plan, evidence, findings, failed: null, cut, followUps, charts: charts.length, figures: { ...figureCount }, stepStats, unsupported: unsupportedNumbers(written, notes), ...(repaired ? { repaired } : {}) }
}
