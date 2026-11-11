// LIVE measurement of one deep research run per tier (owner 11/11: "đo lại rồi mới quyết định"). SKIPPED unless RUN_LIVE_RESEARCH_MEASURE=1: it spends real money (the models, Serper, Parallel)
// and loads the repo's own .env.local for the keys (never printed). It bypasses the chat route (no sign-in needed), runs the SAME engine and deps the route builds, and writes counts, costs and the
// report to MEASURE_OUT (default: the OS temp dir). Run:  RUN_LIVE_RESEARCH_MEASURE=1 MEASURE_TIERS=standard,advanced npx vitest run src/lib/ai/research/liveMeasure.test.ts
import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runDeepResearch, type DeepResearchDeps } from './deepResearch'
import { createDeepResearchDeps, deepResearchParallel, PARALLEL_PRICE } from './deepResearchDeps'
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
}
const PLAN: Array<{ tier: 'standard' | 'advanced' | 'legacy'; q: keyof typeof QUESTIONS }> = (process.env.MEASURE_TIERS ?? 'standard,advanced')
  .split(',').map(s => s.trim()).filter(Boolean).map(s => { const [tier, q] = s.split(':'); return { tier: tier as 'standard' | 'advanced' | 'legacy', q: (q ?? (tier === 'advanced' ? 'forecast' : 'trend')) as keyof typeof QUESTIONS } })

describe.skipIf(!ON)('LIVE: one run per tier (costs money)', () => {
  for (const { tier, q } of PLAN) {
    it(`${tier} on "${q}"`, async () => {
      try { process.loadEnvFile(join(process.cwd(), '.env.local')) } catch { throw new Error('env not loaded') }
      process.env.RESEARCH_SOURCE_DIVERSITY = '1'
      const question = QUESTIONS[q]
      const cost = { usd: 0, calls: 0 }
      const par = process.env.PARALLEL_API_KEY ? deepResearchParallel() : null
      const base = { lang: 'vi', userTexts: [question], cost, questionLang: 'vi' as const, ...(par ? { parallelSearch: par } : {}) }
      const deps: DeepResearchDeps = createDeepResearchDeps({ ...base, ...(tier === 'standard' ? { standard: true } : tier === 'advanced' ? { advanced: true } : {}) })
      const bounds = tier === 'standard' ? { ...STANDARD_RUN_BOUNDS } : tier === 'advanced' ? { ...ADVANCED_RUN_BOUNDS } : undefined
      const at = serperSnapshot()
      const t0 = Date.now()
      let text = ''
      const out = await runDeepResearch(question, '', 'vi', deps, { status() {}, text(x) { text += x } }, undefined, bounds)
      const ms = Date.now() - t0
      const d = serperDelta(at)
      const serperUsd = turnUsd({ promptTokens: 0, completionTokens: 0, serperCredits: d.credits })
      const parallelUsd = (par?.sent() ?? 0) * PARALLEL_PRICE.searchFastUsd
      const ver = out.checked ? verifyReport(out.checked.report, out.checked.sources) : null
      const row = {
        tier, question: q, ok: !out.failed, failed: out.failed, ms,
        usd: { llm: Math.round(cost.usd * 1e5) / 1e5, serper: Math.round(serperUsd * 1e5) / 1e5, parallel: Math.round(parallelUsd * 1e5) / 1e5, total: Math.round((cost.usd + serperUsd + parallelUsd) * 1e5) / 1e5 },
        modelCalls: cost.calls, serperCalls: sumCounts(d.calls), parallelCalls: par?.sent() ?? 0,
        steps: out.plan?.steps.length ?? 0, followUps: out.followUps ?? 0, sources: out.evidence.length, findings: out.findings.length, reportChars: text.length,
        charts: out.charts ?? 0, tableProblems: tableProblems(text).length, conflicts: structuredConflicts(out.findings).length,
        verifier: ver ? { ...ver.counts, checked: ver.checked } : null,
      }
      const dir = process.env.MEASURE_OUT ?? join(tmpdir(), 'tappy-live-measure')
      mkdirSync(dir, { recursive: true })
      const stamp = `${tier}-${q}-${Date.now()}`
      writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(row, null, 2))
      writeFileSync(join(dir, `${stamp}.md`), text)
      console.log('LIVE_MEASURE', JSON.stringify(row))
    }, 600_000)
  }
})
