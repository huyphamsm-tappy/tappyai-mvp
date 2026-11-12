// LIVE measurement of one deep research run per tier (owner 11/11: "đo lại rồi mới quyết định"). SKIPPED unless RUN_LIVE_RESEARCH_MEASURE=1: it spends real money (the models, Serper, Parallel)
// and loads the repo's own .env.local for the keys (never printed). It bypasses the chat route (no sign-in needed), runs the SAME engine and deps the route builds, and writes counts, costs and the
// report to MEASURE_OUT (default: the OS temp dir). Run:  RUN_LIVE_RESEARCH_MEASURE=1 MEASURE_TIERS=standard,advanced npx vitest run src/lib/ai/research/liveMeasure.test.ts
import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runDeepResearch, numberInText, type DeepResearchDeps } from './deepResearch'
import { consolidate } from './consolidate'
import { repeatedFigures } from './reportRepeats'
import { BENCHMARK, benchmarkById } from './benchmark/benchmarkSet'
import { scoreReport } from './benchmark/benchmarkScore'
import type { ForecastResult } from './forecastModel'
import { createDeepResearchDeps, deepResearchParallel, PARALLEL_PRICE } from './deepResearchDeps'
import { reportQuestionLang } from './reportLang'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'
import { ADVANCED_RUN_BOUNDS } from './researchController'
import { verifyReport } from './claimVerifier'
import { tableProblems } from './tableIntegrity'
import { structuredConflicts } from './conflictMetadata'
import { serperSnapshot, serperDelta } from '@/lib/ai/tools/serperMeter'
import { turnUsd, sumCounts } from '@/lib/ai/turnCost'

const ON = process.env.RUN_LIVE_RESEARCH_MEASURE === '1'
const QUESTIONS: Record<string, string> = {
  trend: process.env.MEASURE_Q_TREND ?? 'Xu hướng thị trường trà sữa tại Hà Nội',
  forecast: process.env.MEASURE_Q_FORECAST ?? 'Dự báo doanh thu trà sữa Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy',
  // the ten questions of the V2.1 benchmark (benchmark/benchmarkSet.ts): "standard:q05", "advanced:q05"
  ...Object.fromEntries(BENCHMARK.map(b => [b.id, b.text])),
}
// BENCH_CAP_USD: a ceiling on what one process may spend in all; once it is reached the remaining entries are skipped (0 or unset = no ceiling)
const CAP_USD = Number(process.env.BENCH_CAP_USD ?? 0)
let spentUsd = 0
const PLAN: Array<{ tier: 'standard' | 'advanced' | 'legacy'; q: keyof typeof QUESTIONS }> = (process.env.MEASURE_TIERS ?? 'standard,advanced')
  .split(',').map(s => s.trim()).filter(Boolean).map(s => { const [tier, q] = s.split(':'); return { tier: tier as 'standard' | 'advanced' | 'legacy', q: (q ?? (tier === 'advanced' ? 'forecast' : 'trend')) as keyof typeof QUESTIONS } })

describe.skipIf(!ON)('LIVE: one run per tier (costs money)', () => {
  for (const { tier, q } of PLAN) {
    it(`${tier} on "${q}"`, async () => {
      if (CAP_USD > 0 && spentUsd >= CAP_USD) { console.log('LIVE_MEASURE_SKIPPED_CAP', JSON.stringify({ tier, q, spentUsd: Math.round(spentUsd * 1e4) / 1e4, cap: CAP_USD })); return }
      try { process.loadEnvFile(join(process.cwd(), '.env.local')) } catch { throw new Error('env not loaded') }
      process.env.RESEARCH_SOURCE_DIVERSITY = '1'
      const question = QUESTIONS[q]
      const cost = { usd: 0, calls: 0 }
      const par = process.env.PARALLEL_API_KEY ? deepResearchParallel() : null
      // MEASURE_LANG_DETECT=1: the question's language is detected the way the chat route does (detectLangConfident), so a Chinese or English question is written in its own language; absent = 'vi' as before (the older measurements)
      const questionLang = process.env.MEASURE_LANG_DETECT === '1' ? reportQuestionLang(question) : 'vi'
      const base = { lang: 'vi', userTexts: [question], cost, questionLang, ...(par ? { parallelSearch: par } : {}) }
      const deps: DeepResearchDeps = createDeepResearchDeps({ ...base, ...(tier === 'standard' ? { standard: true } : tier === 'advanced' ? { advanced: true } : {}) })
      const bounds = tier === 'standard' ? { ...STANDARD_RUN_BOUNDS } : tier === 'advanced' ? { ...ADVANCED_RUN_BOUNDS } : undefined
      // what the new slices did (counts and names only): the engine's own trace events, the model the writer was handed, and the charts drawn
      const traces: Array<Record<string, unknown>> = []
      const trace0 = deps.trace
      deps.trace = e => { traces.push(e); trace0?.(e) }
      let forecastSeen: ForecastResult | undefined
      const write0 = deps.write.bind(deps)
      deps.write = i => { forecastSeen = i.forecast; return write0(i) }
      const charts: Array<{ section: string; title: string; unit: string; points: number }> = []
      const at = serperSnapshot()
      const t0 = Date.now()
      let text = ''
      const out = await runDeepResearch(question, '', 'vi', deps, { status() {}, text(x) { text += x }, charts(c) { charts.push(...c.map(x => ({ section: x.section, title: x.title, unit: x.unit, points: x.points.length }))) } }, undefined, bounds)
      const ms = Date.now() - t0
      const d = serperDelta(at)
      const serperUsd = turnUsd({ promptTokens: 0, completionTokens: 0, serperCredits: d.credits })
      const parallelUsd = (par?.sent() ?? 0) * PARALLEL_PRICE.searchFastUsd
      const ver = out.checked ? verifyReport(out.checked.report, out.checked.sources) : null
      const totalUsd = cost.usd + serperUsd + parallelUsd
      const row = {
        tier, question: q, ok: !out.failed, failed: out.failed, ms,
        usd: { llm: Math.round(cost.usd * 1e5) / 1e5, serper: Math.round(serperUsd * 1e5) / 1e5, parallel: Math.round(parallelUsd * 1e5) / 1e5, total: Math.round((cost.usd + serperUsd + parallelUsd) * 1e5) / 1e5 },
        modelCalls: cost.calls, serperCalls: sumCounts(d.calls), parallelCalls: par?.sent() ?? 0,
        steps: out.plan?.steps.length ?? 0, followUps: out.followUps ?? 0, sources: out.evidence.length, findings: out.findings.length, reportChars: text.length,
        charts: out.charts ?? 0, tableProblems: tableProblems(text).length, conflicts: structuredConflicts(out.findings).length,
        verifier: ver ? { ...ver.counts, checked: ver.checked } : null,
        label: process.env.MEASURE_LABEL ?? '',
        // the automatic part of the V2.1 benchmark score (mandatory facts, pages, repetition, filler candidates, forecast checks, efficiency); null for a question outside the set
        bench: benchmarkById(String(q)) && !out.failed ? scoreReport(text, benchmarkById(String(q))!, { tier: tier === 'advanced' ? 'advanced' : 'standard', usd: totalUsd, verifier: ver ? { supported: ver.counts.supported, checked: ver.checked } : null }) : null,
        flags: { consolidation: process.env.RESEARCH_CONSOLIDATION === '1', packages: process.env.RESEARCH_PACKAGES === '1', forecastModel: process.env.RESEARCH_FORECAST_MODEL === '1', freshness: process.env.RESEARCH_FRESHNESS === '1', tightWrite: process.env.RESEARCH_TIGHT_WRITE === '1', chartRelevance: process.env.RESEARCH_CHART_RELEVANCE === '1' },
        repeats: repeatedFigures(text),
        // RESEARCH_EVIDENCE_CARDS: the counts of the run's cards (exact quotes verified against the page or not, kinds of source, confidence, facts by support); the cards themselves go to a .cards.json file
        cards: out.cards ? out.cards.summary : null,
        evidenceCards: process.env.RESEARCH_EVIDENCE_CARDS === '1',
        // RESEARCH_THESIS_REPORT: whether the analyst's outline was used (a null outline means the old way), its size, and what the code dropped before showing the text
        thesisFlag: process.env.RESEARCH_THESIS_REPORT === '1',
        thesis: { used: !!out.thesis, dropped: out.thesis?.dropped ?? null, charsBefore: out.thesis?.charsBefore ?? null, outline: traces.find(t => t.ev === 'thesis') ?? null, released: traces.find(t => t.ev === 'released') ?? null },
        freshnessHints: traces.filter(t => t.ev === 'freshness_hints').map(t => t.n),
        // what the consolidation WOULD say about this run's findings (computed after the fact for every config, so the baseline shows how much it repeats and how many "conflicts" are not)
        consolidation: (() => { const c = consolidate(out.findings); return { ...c.stats, staleItems: c.stale.slice(0, 10).map(s => `${s.subject || '-'} / ${s.metric}: ${s.newest}`), conflictsOld: structuredConflicts(out.findings).length } })(),
        packages: { briefs: out.plan?.steps.filter(s => s.brief).length ?? 0, merged: traces.find(t => t.ev === 'packages_merged')?.merged ?? [] },
        forecast: { trace: traces.find(t => t.ev === 'forecast') ?? null, modelGiven: !!forecastSeen, modelEndValuesInReport: forecastSeen ? forecastSeen.scenarios.map(s => numberInText(Math.round(s.series[s.series.length - 1].value * 100) / 100, text)) : null },
        chartList: charts,
        stepTitles: out.plan?.steps.map(s => s.title) ?? [],
        headings: [...text.matchAll(/^#{1,3} (.+)$/gm)].map(m => m[1].slice(0, 100)),
      }
      spentUsd += totalUsd
      const dir = process.env.MEASURE_OUT ?? join(tmpdir(), 'tappy-live-measure')
      mkdirSync(dir, { recursive: true })
      const stamp = `${process.env.MEASURE_LABEL ? `${process.env.MEASURE_LABEL}-` : ''}${tier}-${q}-${Date.now()}`
      writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(row, null, 2))
      writeFileSync(join(dir, `${stamp}.md`), text)
      if (out.cards) writeFileSync(join(dir, `${stamp}.cards.json`), JSON.stringify(out.cards.cards.map(c => ({ id: c.id, step: c.step, source: c.source, kind: c.sourceKind, host: c.host, family: c.family, quote: c.quoteStatus, confidence: c.confidence, text: c.text.slice(0, 160), quoteText: c.quote?.slice(0, 220) })), null, 1))
      console.log('LIVE_MEASURE', JSON.stringify(row))
    }, 600_000)
  }
})
