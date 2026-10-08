// Phase 8 agent eval — aggregation + markdown report (pure).
import { pct, type CheckResult, type OutputKind, type ResearchObservation } from './checks'

export interface EvalRow {
  mode: string
  scenario: string
  category: string
  turn: number
  sent: string
  checks: CheckResult[]
  pass: boolean
  output: OutputKind
  tools: string[]
  modelCalls: number | null
  stop: string | null
  ms: number
  ttftMs: number | null
  usd: number
  tokensIn: number
  tokensOut: number
  serperCalls: number
  serperReal: number
  fellBack: boolean
  guardsChanged: string[]
  kept: number | null
  /** TAPPY_AGENT=2 only: the run trace this turn emitted (null on other modes). */
  runTrace?: { lines: number; status: string | null; outputType: string | null; rounds: number; toolCalls: number; serperCredits: number; timeouts: number; retries: number; budgetRefusals: number; guardEvents: number; events: number; taskId?: string | null; taskConstraints?: number | null; taskPersisted?: boolean | null; evidenceRefs?: number | null; research?: ResearchObservation | null } | null
  reply: string
  crash?: string
}

export interface ModeSummary {
  turns: number
  turnsPassed: number
  checks: Record<string, { pass: number; total: number }>
  byCategory: Record<string, { pass: number; total: number }>
  toolsPerTurn: { mean: number; max: number; zeroToolTurns: number }
  modelCalls: { mean: number | null; max: number | null }
  latencyMs: { p50: number; p90: number; max: number }
  ttftMs: { p50: number; p90: number }
  usd: { total: number; meanTurn: number }
  serper: { calls: number; real: number }
  guards: { turnsChanged: number; byGuard: Record<string, number>; keptMean: number | null; keptMin: number | null; under60: number }
  outputs: Record<string, number>
  crashes: number
  fellBack: number
  trace: { turns: number; exactlyOne: number; roundsMax: number; toolCallsMax: number; serperMax: number; timeouts: number; retries: number; budgetRefusals: number; guardEvents: number } | null
  /** M2: multi-turn conversations whose turns all worked on ONE task (same task id), and constraints held at the last turn. */
  task: { conversations: number; stableTask: number; persistedTurns: number; meanLastConstraints: number } | null
  /** M3 research totals (Phase 8 run trace). */
  research: { turns: number; pages: number; failures: number; turnsWithPages: number; fact: number; inference: number; unknown: number; conflict: number; citedTurns: number; searchAfterRead: number } | null
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function summarizeMode(rows: readonly EvalRow[]): ModeSummary {
  const checks: ModeSummary['checks'] = {}
  const byCategory: ModeSummary['byCategory'] = {}
  for (const r of rows) {
    for (const c of r.checks) { const x = (checks[c.id] ??= { pass: 0, total: 0 }); x.total++; if (c.pass) x.pass++ }
    const y = (byCategory[r.category] ??= { pass: 0, total: 0 }); y.total++; if (r.pass) y.pass++
  }
  const byGuard: Record<string, number> = {}
  for (const r of rows) for (const g of r.guardsChanged) byGuard[g] = (byGuard[g] ?? 0) + 1
  const kept = rows.map(r => r.kept).filter((k): k is number => k != null)
  const mc = rows.map(r => r.modelCalls).filter((k): k is number => k != null)
  const outputs: Record<string, number> = {}
  for (const r of rows) outputs[r.output] = (outputs[r.output] ?? 0) + 1
  const ttft = rows.map(r => r.ttftMs).filter((k): k is number => k != null)
  return {
    turns: rows.length,
    turnsPassed: rows.filter(r => r.pass).length,
    checks, byCategory,
    toolsPerTurn: { mean: mean(rows.map(r => r.tools.length)), max: Math.max(0, ...rows.map(r => r.tools.length)), zeroToolTurns: rows.filter(r => r.tools.length === 0).length },
    modelCalls: { mean: mc.length ? mean(mc) : null, max: mc.length ? Math.max(...mc) : null },
    latencyMs: { p50: pct(rows.map(r => r.ms), 50), p90: pct(rows.map(r => r.ms), 90), max: Math.max(0, ...rows.map(r => r.ms)) },
    ttftMs: { p50: pct(ttft, 50), p90: pct(ttft, 90) },
    usd: { total: rows.reduce((a, r) => a + r.usd, 0), meanTurn: mean(rows.map(r => r.usd)) },
    serper: { calls: rows.reduce((a, r) => a + r.serperCalls, 0), real: rows.reduce((a, r) => a + r.serperReal, 0) },
    guards: { turnsChanged: rows.filter(r => r.guardsChanged.length).length, byGuard, keptMean: kept.length ? mean(kept) : null, keptMin: kept.length ? Math.min(...kept) : null, under60: kept.filter(k => k < 0.6).length },
    outputs,
    crashes: rows.filter(r => r.crash).length,
    fellBack: rows.filter(r => r.fellBack).length,
    research: (() => {
      const r = rows.map(x => x.runTrace?.research).filter((x): x is NonNullable<typeof x> => !!x)
      if (!r.length) return null
      const sum = (f: (x: typeof r[number]) => number) => r.reduce((a, x) => a + f(x), 0)
      return { turns: r.length, pages: sum(x => x.pages), failures: sum(x => x.failures), turnsWithPages: r.filter(x => x.pages > 0).length, fact: sum(x => x.fact), inference: sum(x => x.inference), unknown: sum(x => x.unknown), conflict: sum(x => x.conflict), citedTurns: r.filter(x => x.citations > 0).length, searchAfterRead: r.filter(x => x.searchAfterRead).length }
    })(),
    task: (() => {
      const byConv = new Map<string, EvalRow[]>()
      for (const r of rows) if (r.runTrace?.taskId) byConv.set(r.scenario, [...(byConv.get(r.scenario) ?? []), r])
      const multi = [...byConv.values()].filter(rs => rs.length > 1)
      if (!byConv.size) return null
      return { conversations: multi.length, stableTask: multi.filter(rs => new Set(rs.map(r => r.runTrace!.taskId)).size === 1).length, persistedTurns: rows.filter(r => r.runTrace?.taskPersisted).length, meanLastConstraints: multi.length ? mean(multi.map(rs => rs[rs.length - 1].runTrace!.taskConstraints ?? 0)) : 0 }
    })(),
    trace: (() => {
      const t = rows.map(r => r.runTrace).filter((x): x is NonNullable<EvalRow['runTrace']> => !!x)
      if (!t.length) return null
      return { turns: t.length, exactlyOne: t.filter(x => x.lines === 1).length, roundsMax: Math.max(...t.map(x => x.rounds)), toolCallsMax: Math.max(...t.map(x => x.toolCalls)), serperMax: Math.max(...t.map(x => x.serperCredits)), timeouts: t.reduce((a, x) => a + x.timeouts, 0), retries: t.reduce((a, x) => a + x.retries, 0), budgetRefusals: t.reduce((a, x) => a + x.budgetRefusals, 0), guardEvents: t.reduce((a, x) => a + x.guardEvents, 0) }
    })(),
  }
}

export function summarize(rows: readonly EvalRow[]): Record<string, ModeSummary> {
  const out: Record<string, ModeSummary> = {}
  for (const m of [...new Set(rows.map(r => r.mode))]) out[m] = summarizeMode(rows.filter(r => r.mode === m))
  return out
}

const r2 = (n: number | null) => (n == null ? '—' : (Math.round(n * 100) / 100).toString())
const rate = (x?: { pass: number; total: number }) => (x ? `${x.pass}/${x.total}` : '—')

export function markdown(rows: readonly EvalRow[], s: Record<string, ModeSummary>, meta: Record<string, unknown>): string {
  const modes = Object.keys(s)
  const checkIds = [...new Set(modes.flatMap(m => Object.keys(s[m].checks)))].sort()
  const cats = [...new Set(modes.flatMap(m => Object.keys(s[m].byCategory)))].sort()
  const L: string[] = []
  L.push('# Phase 8 agent eval', '', '```json', JSON.stringify(meta, null, 1), '```', '')
  L.push(`| metric | ${modes.join(' | ')} |`, `|---|${modes.map(() => '---').join('|')}|`)
  const row = (name: string, f: (x: ModeSummary) => string) => L.push(`| ${name} | ${modes.map(m => f(s[m])).join(' | ')} |`)
  row('turns passed (all checks)', x => `${x.turnsPassed}/${x.turns}`)
  for (const c of checkIds) row(`check: ${c}`, x => rate(x.checks[c]))
  for (const c of cats) row(`category: ${c}`, x => rate(x.byCategory[c]))
  row('tools/turn mean · max · zero-tool turns', x => `${r2(x.toolsPerTurn.mean)} · ${x.toolsPerTurn.max} · ${x.toolsPerTurn.zeroToolTurns}`)
  row('model calls mean · max (agent trace)', x => `${r2(x.modelCalls.mean)} · ${x.modelCalls.max ?? '—'}`)
  row('latency p50 · p90 · max (s)', x => `${r2(x.latencyMs.p50 / 1000)} · ${r2(x.latencyMs.p90 / 1000)} · ${r2(x.latencyMs.max / 1000)}`)
  row('first text p50 · p90 (s)', x => `${r2(x.ttftMs.p50 / 1000)} · ${r2(x.ttftMs.p90 / 1000)}`)
  row('USD total · mean/turn (model+serper, route meter)', x => `${x.usd.total.toFixed(4)} · ${x.usd.meanTurn.toFixed(5)}`)
  row('Serper calls (metered) · real (not replayed)', x => `${x.serper.calls} · ${x.serper.real}`)
  row('guards changed reply (turns)', x => `${x.guards.turnsChanged}`)
  row('guard kept ratio mean · min · turns <60%', x => `${r2(x.guards.keptMean)} · ${r2(x.guards.keptMin)} · ${x.guards.under60}`)
  row('outputs', x => Object.entries(x.outputs).map(([k, v]) => `${k} ${v}`).join(', '))
  row('crashes · fell back', x => `${x.crashes} · ${x.fellBack}`)
  row('task: multi-turn conversations on ONE task · turns persisted · mean constraints at last turn', x => x.task ? `${x.task.stableTask}/${x.task.conversations} · ${x.task.persistedTurns} · ${r2(x.task.meanLastConstraints)}` : '—')
  row('research: pages read · failed · turns with pages', x => x.research ? `${x.research.pages} · ${x.research.failures} · ${x.research.turnsWithPages}/${x.research.turns}` : '—')
  row('research: evidence FACT · INFERENCE · UNKNOWN · CONFLICT', x => x.research ? `${x.research.fact} · ${x.research.inference} · ${x.research.unknown} · ${x.research.conflict}` : '—')
  row('research: turns citing sources · turns that searched again after a read', x => x.research ? `${x.research.citedTurns} · ${x.research.searchAfterRead}` : '—')
  row('run trace: turns with exactly 1 trace', x => x.trace ? `${x.trace.exactlyOne}/${x.trace.turns}` : '—')
  row('run trace: max rounds · max tool calls · max Serper', x => x.trace ? `${x.trace.roundsMax} · ${x.trace.toolCallsMax} · ${x.trace.serperMax}` : '—')
  row('run trace: timeouts · retries · budget refusals · guard events', x => x.trace ? `${x.trace.timeouts} · ${x.trace.retries} · ${x.trace.budgetRefusals} · ${x.trace.guardEvents}` : '—')
  L.push('', '## Guards that changed replies', '')
  for (const m of modes) L.push(`- **${m}**: ${Object.entries(s[m].guards.byGuard).map(([k, v]) => `${k} ×${v}`).join(', ') || '—'}`)
  L.push('', '## Turns', '')
  for (const r of rows) {
    const failed = r.checks.filter(c => !c.pass)
    L.push(`### ${r.mode} · ${r.scenario} t${r.turn} — ${r.pass ? 'PASS' : 'FAIL'}`, '', `> ${r.sent}`, '',
      `output **${r.output}** · tools [${r.tools.join(', ') || '—'}] · model calls ${r.modelCalls ?? '—'} · stop ${r.stop ?? '—'} · ${(r.ms / 1000).toFixed(1)} s · $${r.usd.toFixed(5)} · serper ${r.serperCalls} · kept ${r2(r.kept)}${r.guardsChanged.length ? ` · guards: ${r.guardsChanged.join(', ')}` : ''}${r.crash ? ` · CRASH ${r.crash}` : ''}`, '')
    if (failed.length) L.push(...failed.map(c => `- ✗ ${c.id}: ${c.detail ?? ''}`), '')
    L.push('<details><summary>reply</summary>', '', '```', r.reply.slice(0, 3000), '```', '</details>', '')
  }
  return L.join('\n')
}
