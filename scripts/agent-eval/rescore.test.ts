/**
 * Re-score a finished eval run from its raw files (no model, no network, free):
 *   AGENT_EVAL_RESCORE=scripts/agent-eval/out/eval-<ts> npx vitest run scripts/agent-eval/rescore.test.ts
 * Used when a CHECK changes (lib/checks.ts) — the model's replies are not re-bought. WS2: the observation is rebuilt from the raw file
 * exactly as the live harness builds it (pre-guard text, run trace research / ranking, URLs the turn had, runtime turn or not).
 */
import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateTurn, outputKind, researchFromTrace, rankingFromTrace, type Scenario } from './lib/checks'
import { summarize, markdown, type EvalRow } from './lib/report'

const DIR = process.env.AGENT_EVAL_RESCORE ?? ''

describe.skipIf(!DIR)('agent eval — rescore', () => {
  it(`rescore ${DIR}`, () => {
    const { meta, rows } = JSON.parse(readFileSync(join(DIR, 'results.json'), 'utf8')) as { meta: Record<string, unknown>; rows: EvalRow[] }
    const { scenarios } = JSON.parse(readFileSync(join('scripts', 'agent-eval', 'scenarios.json'), 'utf8')) as { scenarios: Scenario[] }
    const byId = new Map(scenarios.map(s => [s.id, s]))
    const out: EvalRow[] = rows.map(r => {
      const raw = JSON.parse(readFileSync(join(DIR, 'raw', `${r.mode}-${r.scenario}-t${r.turn}.json`), 'utf8')) as { sent?: string; rawText?: string | null; parsed: { tools: Array<{ toolName?: string; args?: unknown; result?: unknown }>; annotations: Array<Record<string, unknown>> }; logEvents?: Array<Record<string, unknown>> }
      const expect = byId.get(r.scenario)?.turns[r.turn - 1]?.expect ?? {}
      const runTraces = (raw.logEvents ?? []).filter(e => e.type === 'tappyai_agent_run_trace')
      const rt = runTraces[0] as never
      const urlsSeen = [...JSON.stringify([raw.parsed.tools.map(x => ({ a: x.args, r: x.result })), raw.parsed.annotations, raw.sent ?? r.sent]).matchAll(/https?:\/\/[^\s"'<>\\)\]]+/g)].map(m => m[0])
      const obs = { text: r.reply, rawText: raw.rawText ?? null, tools: raw.parsed.tools.map(t => ({ name: t.toolName ?? '?', args: t.args })), annotations: raw.parsed.annotations, crashed: !!r.crash, research: researchFromTrace(rt), ranking: rankingFromTrace(rt), urlsSeen, runtimeTurn: runTraces.length > 0 }
      const checks = evaluateTurn(expect, obs)
      return { ...r, checks, pass: checks.every(c => c.pass), output: outputKind(obs) }
    })
    const s = summarize(out)
    const m = { ...meta, rescoredAt: new Date().toISOString() }
    writeFileSync(join(DIR, 'results.json'), JSON.stringify({ meta: m, summary: s, rows: out }, null, 1))
    writeFileSync(join(DIR, 'summary.md'), markdown(out, s, m))
  })
})
