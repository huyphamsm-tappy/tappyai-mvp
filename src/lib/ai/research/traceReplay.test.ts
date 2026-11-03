// ── 03/11 · Phase 1 proof: nothing a research step found is lost on its way to the next step ─────────────────────────────────────────────────
//
// Replays recorded Deep Research traces (DEEP_RESEARCH_TRACE_DIAGNOSTICS + DEEP_RESEARCH_TRACE_FULL, a run directory holding trace-full.jsonl) through the REAL
// runDeepResearch with the model calls and the web replaced by what the trace recorded. Costs nothing (no network, no model). Skipped unless
// DEEP_RESEARCH_TRACE_ROOT is set (the run directories live outside the repository):
//   DEEP_RESEARCH_TRACE_ROOT=<measure30/runs> DEEP_RESEARCH_TRACE_PREFIX=LEAN- [DEEP_RESEARCH_REPLAY_OUT=<file.json>] npx vitest run src/lib/ai/research/traceReplay.test.ts
// For each trace it follows every finding from the notes step to the writer: kept / dropped (each drop with a NAMED rule, the sum must be exact),
// the sources the writer is given, the figures, and what the gap check is shown (packed) against what it was shown before (the first 30 000 characters).

import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runDeepResearch, writerNotes, numbersOf, DEEP_RESEARCH_LIMITS, GAP_FINDINGS_BUDGET, type DeepResearchDeps, type Evidence, type Finding, type ResearchPlan } from './deepResearch'

const ROOT = process.env.DEEP_RESEARCH_TRACE_ROOT
const PREFIX = process.env.DEEP_RESEARCH_TRACE_PREFIX ?? ''
const OUT = process.env.DEEP_RESEARCH_REPLAY_OUT

interface TraceStep { title: string; queries: string[] }
interface TraceEvidence { id: number; url: string; title: string; snippet: string; text: string }
interface TraceFinding { source: number; text: string; figure: unknown }
interface TraceDump { step: number; evidence: TraceEvidence[]; findings: TraceFinding[] }

const clean600 = (s: string) => s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600)

function readTrace(dir: string): Array<Record<string, unknown>> {
  return readFileSync(join(dir, 'trace-full.jsonl'), 'utf8').split('\n').flatMap(l => { try { const o = JSON.parse(l) as Record<string, unknown>; return o.type === 'tappyai_deep_research_trace' ? [o] : [] } catch { return [] } })
}

/** The run's own outcome line (counts only), when its log slice was kept beside the trace. */
function originalOutcome(dir: string): { findings: number; stepKept: number[] } | null {
  const p = join(dir, 'log-slice.txt')
  if (!existsSync(p)) return null
  const line = readFileSync(p, 'utf8').split('\n').find(l => l.includes('"type":"tappyai_deep_research",'))
  if (!line) return null
  try { const o = JSON.parse(line) as { findings: number; step_stats?: Array<{ kept: number }> }; return { findings: o.findings, stepKept: (o.step_stats ?? []).map(s => s.kept) } } catch { return null }
}

async function replay(dir: string) {
  const events = readTrace(dir)
  const planEv = events.find(e => e.ev === 'plan') as { title: string; steps: TraceStep[] } | undefined
  if (!planEv) return null
  const gapsEv = events.find(e => e.ev === 'gaps') as { steps: TraceStep[] } | undefined
  const dumps = events.filter(e => e.ev === 'dump') as unknown as TraceDump[]
  const dumpOf = new Map(dumps.map(d => [d.step, d]))
  const all: TraceStep[] = [...planEv.steps, ...(gapsEv?.steps ?? [])] // step k (1-based) = all[k - 1], as the run numbers them
  const queueFor = () => { const m = new Map<string, number[]>(); all.forEach((s, i) => m.set(s.title, [...(m.get(s.title) ?? []), i + 1])); return m }
  const gatherQ = queueFor()
  const notesQ = queueFor()
  const served = new Set<number>()
  const question = 'replayed question'

  let gapFound: string[] | null = null
  let writerIn: { plan: ResearchPlan; evidence: readonly Evidence[]; findings: readonly Finding[] } | null = null
  const deps: DeepResearchDeps = {
    async plan() {
      // the run caps the plan at planSteps and adds up to PART_STEPS steps for uncovered parts: the traced steps beyond the cap come back as such parts
      const cap = DEEP_RESEARCH_LIMITS.planSteps
      const steps = planEv.steps.slice(0, cap).map(s => ({ title: s.title, queries: s.queries }))
      const uncovered = planEv.steps.slice(cap).map(s => s.title)
      return { title: planEv.title, steps, ...(uncovered.length ? { uncovered } : {}) }
    },
    async gather(_query, focus) {
      const title = [...gatherQ.keys()].filter(t => focus.startsWith(`${t} - `)).sort((a, b) => b.length - a.length)[0]
      const k = title ? gatherQ.get(title)!.find(i => !served.has(i)) : undefined
      if (!k || served.has(k)) return [] // one search per step carries the step's whole recorded evidence
      served.add(k)
      return (dumpOf.get(k)?.evidence ?? []).map(e => ({ title: e.title, url: e.url, snippet: e.snippet, text: e.text }))
    },
    async notes(step, _q, evidence) {
      const k = notesQ.get(step)?.shift()
      const d = k ? dumpOf.get(k) : undefined
      if (!d) return []
      const urlOfOriginal = new Map(d.evidence.map(e => [e.id, e.url]))
      const idOfUrl = new Map(evidence.map(e => [e.url, e.id]))
      return d.findings.flatMap(f => { const id = idOfUrl.get(urlOfOriginal.get(f.source) ?? ''); return id ? [{ text: f.text, source: id, figure: (f.figure ?? null) as never }] : [{ text: f.text, source: -1, figure: (f.figure ?? null) as never }] })
    },
    async gaps(_q, _plan, found) { gapFound = [...found]; return (gapsEv?.steps ?? []).map(s => ({ title: s.title, queries: s.queries, completes: null })) },
    async *write(input) { writerIn = input; yield '# replay\n' },
  }
  const out = await runDeepResearch(question, '', 'vi', deps, { status() {}, text() {} })

  // what the pipeline kept, step by step, and what it dropped, each drop under a named rule (the sum must be exact)
  const reasons = { empty_text: 0, unknown_source: 0, duplicate_figures: 0, step_cap: 0 }
  let recorded = 0, recordedFigures = 0, simKept = 0, keptTruncated600 = 0
  const simKeptByStep = new Map<number, number>()
  for (const d of dumps) {
    const known = new Set(d.evidence.map(e => e.id))
    const numbers: Array<Set<string>> = []
    let kept = 0
    for (let i = 0; i < d.findings.length; i++) {
      const f = d.findings[i]!
      recorded++; if (f.figure) recordedFigures++
      const text = clean600(f.text)
      if (!text) { reasons.empty_text++; continue }
      if (!known.has(f.source)) { reasons.unknown_source++; continue }
      const nums = numbersOf(text)
      if (nums.size >= 2 && numbers.some(k => [...nums].every(n => k.has(n)))) { reasons.duplicate_figures++; continue }
      numbers.push(nums); kept++; simKept++
      if (f.text.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().length > 600) keptTruncated600++
      if (kept >= DEEP_RESEARCH_LIMITS.findingsPerStep) { reasons.step_cap += d.findings.length - i - 1; recorded += d.findings.length - i - 1; recordedFigures += d.findings.slice(i + 1).filter(x => x.figure).length; break }
    }
    simKeptByStep.set(d.step, kept)
  }

  const w = writerIn as { plan: ResearchPlan; evidence: readonly Evidence[]; findings: readonly Finding[] } | null
  const notes = w ? writerNotes(w.plan, w.findings) : ''
  // DEEP_RESEARCH_WRITER_OUT=<dir>: also writes what the writer was given (plan title, sources, findings by step), to feed the same evidence to another writer
  if (process.env.DEEP_RESEARCH_WRITER_OUT && w) {
    const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
    const sources = w.evidence.filter(e => w.findings.some(f => f.source === e.id)).map(e => `[${e.id}] ${e.title} — ${e.site ?? host(e.url)}${e.published ? `, ${e.published}` : ''}`).join('\n')
    mkdirSync(process.env.DEEP_RESEARCH_WRITER_OUT, { recursive: true })
    writeFileSync(join(process.env.DEEP_RESEARCH_WRITER_OUT, `${dir.split(/[\\/]/).pop()}.writer-input.md`), `Research plan: ${w.plan.title}\n\nSources:\n${sources}\n\nFindings by step:\n${notes}\n`)
  }
  const writerEvidenceIds = new Set((w?.evidence ?? []).map(e => e.id))
  const missingInNotes = (w?.findings ?? []).filter(f => !notes.includes(`- ${f.text} [${f.source}]`)).length
  const orphanSources = (w?.findings ?? []).filter(f => !writerEvidenceIds.has(f.source)).length

  // the gap check: before = the findings in order, cut at the budget; now = the pack the run gave it
  const findings = out.findings
  // the gap check runs before the follow-up steps: it can only be shown the findings of the plan's own steps
  const atCheck = findings.filter(f => f.step <= planEv.steps.length)
  const stepsWithFindings = new Set(atCheck.map(f => f.step))
  let spent = 0
  const oldLines: Finding[] = []
  for (const f of atCheck) { spent += f.text.length + 3; if (spent > GAP_FINDINGS_BUDGET) break; oldLines.push(f) }
  const pack = new Set((gapFound as string[] | null) ?? [])
  const newLines = atCheck.filter(f => pack.has(`[S${f.step}] ${f.text}`))
  const stepsSeen = (xs: Finding[]) => new Set(xs.map(f => f.step)).size
  const figuresOf = (xs: Finding[]) => xs.filter(f => f.figure).length
  const packChars = ((gapFound as string[] | null) ?? []).reduce((a, l) => a + l.length + 3, 0)

  const original = originalOutcome(dir)
  return {
    run: dir.split(/[\\/]/).pop()!,
    failed: out.failed,
    recorded, recordedFigures, kept: findings.length, simKept, keptByRun: findings.length, reasons, keptTruncated600,
    figuresProposed: out.figures?.proposed ?? 0, figuresKept: out.figures?.kept ?? 0,
    writerFindings: w?.findings.length ?? 0, writerSources: w?.evidence.length ?? 0, missingInNotes, orphanSources,
    gap: { stepsWithFindings: stepsWithFindings.size, stepsSeenBefore: stepsSeen(oldLines), stepsSeenNow: stepsSeen(newLines), findingsSeenBefore: oldLines.length, findingsSeenNow: newLines.length, figuresSeenBefore: figuresOf(oldLines), figuresSeenNow: figuresOf(newLines), figuresTotal: figuresOf(atCheck), findingsAtCheck: atCheck.length, packChars, budget: GAP_FINDINGS_BUDGET },
    original: original ? { findings: original.findings, replayMatches: original.findings === findings.length } : null,
  }
}

describe.skipIf(!ROOT)('Deep Research trace replay (03/11, Phase 1: no information lost between steps)', () => {
  const dirs = ROOT ? readdirSync(ROOT).filter(n => n.startsWith(PREFIX) && existsSync(join(ROOT, n, 'trace-full.jsonl'))).sort().map(n => join(ROOT, n)) : []

  it('has traces to replay', () => { expect(dirs.length).toBeGreaterThan(0) })

  it('follows every finding from the notes step to the writer, and the gap check sees every step', async () => {
    const rows = []
    for (const d of dirs) { const r = await replay(d); if (r) rows.push(r) }
    if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      // every recorded finding is kept or dropped under one of four named rules: nothing disappears unexplained
      expect(r.kept + r.reasons.empty_text + r.reasons.unknown_source + r.reasons.duplicate_figures + r.reasons.step_cap, `${r.run}: unexplained loss`).toBe(r.recorded)
      expect(r.kept, `${r.run}: the named rules reproduce what the run kept`).toBe(r.simKept)
      // what the run kept is what the writer is given: the findings, their sources, and every finding line in the notes
      expect(r.writerFindings, `${r.run}: writer findings`).toBe(r.kept)
      expect(r.orphanSources, `${r.run}: a finding whose source the writer is not given`).toBe(0)
      expect(r.missingInNotes, `${r.run}: a kept finding missing from the writer's notes`).toBe(0)
      // the gap check sees every step that has findings, inside its budget
      expect(r.gap.stepsSeenNow, `${r.run}: steps the gap check sees`).toBe(r.gap.stepsWithFindings)
      expect(r.gap.packChars, `${r.run}: pack within budget`).toBeLessThanOrEqual(r.gap.budget)
      // the replay is faithful to the run it replays
      if (r.original) expect(r.original.replayMatches, `${r.run}: replay kept ${r.kept}, the run kept ${r.original.findings}`).toBe(true)
    }
  })
})
