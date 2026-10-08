/**
 * Re-score a finished eval run from its raw files (no model, no network, free):
 *   AGENT_EVAL_RESCORE=scripts/agent-eval/out/eval-<ts> npx vitest run scripts/agent-eval/rescore.test.ts
 * Used when a CHECK changes (lib/checks.ts) — the model's replies are not re-bought.
 */
import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateTurn, outputKind, type Scenario } from './lib/checks'
import { summarize, markdown, type EvalRow } from './lib/report'

const DIR = process.env.AGENT_EVAL_RESCORE ?? ''

describe.skipIf(!DIR)('agent eval — rescore', () => {
  it(`rescore ${DIR}`, () => {
    const { meta, rows } = JSON.parse(readFileSync(join(DIR, 'results.json'), 'utf8')) as { meta: Record<string, unknown>; rows: EvalRow[] }
    const { scenarios } = JSON.parse(readFileSync(join('scripts', 'agent-eval', 'scenarios.json'), 'utf8')) as { scenarios: Scenario[] }
    const byId = new Map(scenarios.map(s => [s.id, s]))
    const out: EvalRow[] = rows.map(r => {
      const raw = JSON.parse(readFileSync(join(DIR, 'raw', `${r.mode}-${r.scenario}-t${r.turn}.json`), 'utf8')) as { parsed: { tools: Array<{ toolName?: string; args?: unknown }>; annotations: Array<Record<string, unknown>> } }
      const expect = byId.get(r.scenario)?.turns[r.turn - 1]?.expect ?? {}
      const obs = { text: r.reply, rawText: null, tools: raw.parsed.tools.map(t => ({ name: t.toolName ?? '?', args: t.args })), annotations: raw.parsed.annotations, crashed: !!r.crash, research: r.runTrace?.research ?? null }
      const checks = evaluateTurn(expect, obs)
      return { ...r, checks, pass: checks.every(c => c.pass), output: outputKind(obs) }
    })
    const s = summarize(out)
    const m = { ...meta, rescoredAt: new Date().toISOString() }
    writeFileSync(join(DIR, 'results.json'), JSON.stringify({ meta: m, summary: s, rows: out }, null, 1))
    writeFileSync(join(DIR, 'summary.md'), markdown(out, s, m))
  })
})
