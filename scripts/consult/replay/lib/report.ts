// Replay harness — per-turn rows → aggregates, cost projection and the markdown summary.
import type { Check } from './criteria'
import type { NetStats } from './serperReplay'

export interface TurnRow {
  conv: string
  area: string | null
  turnIndex: number
  sent: string
  unresolved: string[]
  expect: string | null
  type: string
  server: { domain: string | null; turnType: string } | null
  usd: number
  tokensIn: number
  tokensOut: number
  serperCalls: number
  cacheHits: number
  promptCacheRead?: number
  promptCacheWrite?: number
  /** Post-model text patches that CHANGED this reply (tappyai_consult_patch) and guard events that fired. */
  patches?: string[]
  guards?: string[]
  net: NetStats
  toolRows: number
  tools: string[]
  mainPick: string | null
  alternatives: string[]
  ms: number
  pass: boolean
  checks: Check[]
  reply: string
  crash?: string
}

interface Agg { turns: number; pass: number; usd: number; tokensIn: number; tokensOut: number; serperCalls: number; serperReal: number; serperReplayed: number; pcRead: number; pcWrite: number }
const agg = (rows: TurnRow[]): Agg => rows.reduce<Agg>((a, r) => ({
  turns: a.turns + 1, pass: a.pass + (r.pass ? 1 : 0), usd: a.usd + r.usd, tokensIn: a.tokensIn + r.tokensIn, tokensOut: a.tokensOut + r.tokensOut, pcRead: a.pcRead + (r.promptCacheRead ?? 0), pcWrite: a.pcWrite + (r.promptCacheWrite ?? 0),
  serperCalls: a.serperCalls + r.serperCalls, serperReal: a.serperReal + r.net.serperReal, serperReplayed: a.serperReplayed + r.net.serperReplayed,
}), { turns: 0, pass: 0, usd: 0, tokensIn: 0, tokensOut: 0, serperCalls: 0, serperReal: 0, serperReplayed: 0, pcRead: 0, pcWrite: 0 })

const groupBy = (rows: TurnRow[], key: (r: TurnRow) => string) => {
  const m: Record<string, TurnRow[]> = {}
  for (const r of rows) (m[key(r)] ??= []).push(r)
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, agg(v)]))
}

const SESSION_SHAPE = ['ask', 'pick', 'followup', 'compare', 'more', 'plan']

export function summarize(rows: TurnRow[]) {
  const total = agg(rows)
  const byType = groupBy(rows, r => r.server?.turnType ?? r.type)
  const byArea = groupBy(rows, r => r.area ?? 'none')
  const byAreaType = groupBy(rows, r => `${r.area ?? 'none'} / ${r.server?.turnType ?? r.type}`)
  const mean = (a?: Agg) => (a && a.turns ? a.usd / a.turns : null)
  const overall = total.turns ? total.usd / total.turns : 0
  // 6-turn session: ask → pick → followup → compare → more → plan, each at its observed mean
  // (overall mean for a type this run did not see).
  const sessionParts = SESSION_SHAPE.map(t => ({ type: t, usd: mean(byType[t]) ?? overall, observed: mean(byType[t]) !== null }))
  const session6 = sessionParts.reduce((n, p) => n + p.usd, 0)
  // 900 turns/month at the turn-type mix this run observed = 900 × the run's mean turn cost.
  const mix = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, total.turns ? v.turns / total.turns : 0]))
  const month900 = 900 * overall
  const failures = rows.filter(r => !r.pass).map(r => ({ conv: r.conv, turn: r.turnIndex, type: r.type, failed: r.checks.filter(c => !c.pass && !c.info).map(c => `${c.id}${c.detail ? ` (${c.detail})` : ''}`) }))
  const typeMismatch = rows.filter(r => r.expect && r.server && r.server.turnType !== r.expect).map(r => `${r.conv}#${r.turnIndex}: expected ${r.expect}, server ${r.server!.turnType}`)
  return { total, byType, byArea, byAreaType, cost: { meanTurnUsd: overall, session6, sessionParts, mix, month900 }, failures, typeMismatch, crashes: rows.filter(r => r.crash).map(r => `${r.conv}#${r.turnIndex}: ${r.crash}`) }
}

const usd = (n: number) => `$${n.toFixed(5)}`
const aggTable = (title: string, m: Record<string, Agg>) => [
  `### ${title}`, '', '| key | turns | pass | usd total | usd/turn | tok in/turn | tok out/turn | serper (meter) | real | replayed | prompt cache read % of in | cache write/turn |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...Object.entries(m).sort().map(([k, a]) => `| ${k} | ${a.turns} | ${a.pass} | ${usd(a.usd)} | ${usd(a.turns ? a.usd / a.turns : 0)} | ${Math.round(a.tokensIn / (a.turns || 1))} | ${Math.round(a.tokensOut / (a.turns || 1))} | ${a.serperCalls} | ${a.serperReal} | ${a.serperReplayed} | ${a.tokensIn ? Math.round(100 * a.pcRead / a.tokensIn) : 0}% | ${Math.round(a.pcWrite / (a.turns || 1))} |`), '',
]

export function markdown(suite: string, rows: TurnRow[], s: ReturnType<typeof summarize>, meta: Record<string, unknown>): string {
  const L: string[] = [`# Replay — ${suite}`, '', `- run: ${String(meta.startedAt)} → ${String(meta.finishedAt)}`, `- conversations: ${String(meta.conversations)} · turns: ${s.total.turns} · passed: ${s.total.pass}`,
    `- flags: ${JSON.stringify(meta.flags)}`, `- serper: meter ${s.total.serperCalls} · real ${s.total.serperReal} · replayed ${s.total.serperReplayed} · missing ${String(meta.serperMissing ?? 0)}`, '']
  L.push('## Cost', '', `- mean per turn: ${usd(s.cost.meanTurnUsd)}`, `- 6-turn session (ask→pick→followup→compare→more→plan): ${usd(s.cost.session6)}  (${s.cost.sessionParts.map(p => `${p.type} ${usd(p.usd)}${p.observed ? '' : '*'}`).join(' · ')}; * = not observed, overall mean used)`,
    `- 900 turns/month at the observed mix: ${usd(s.cost.month900)}  (mix: ${Object.entries(s.cost.mix).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ')})`,
    '- note: `usd` is the route\'s own figure; it prices every Serper call the meter saw, including replayed ones.', '')
  L.push(...aggTable('By turn type (server)', s.byType), ...aggTable('By area', s.byArea), ...aggTable('By area / turn type', s.byAreaType))
  // Owner 29/09 "hạn chế guard vá": how often each post-model patch had to change a reply, per turn type.
  {
    const byType = new Map<string, { turns: number; hits: Map<string, number> }>()
    for (const r of rows) {
      const t = r.server?.turnType ?? r.type
      const e = byType.get(t) ?? { turns: 0, hits: new Map<string, number>() }
      e.turns++
      for (const p of new Set([...(r.patches ?? []), ...(r.guards ?? []).map(g => `guard:${g}`)])) e.hits.set(p, (e.hits.get(p) ?? 0) + 1)
      byType.set(t, e)
    }
    L.push('### Patches and guards that changed a reply (turns affected / turns)', '', '| turn type | turns | patches / guards (count) |', '|---|---|---|')
    for (const [t, e] of [...byType.entries()].sort()) L.push(`| ${t} | ${e.turns} | ${[...e.hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'} |`)
    L.push('')
  }
  if (s.crashes.length) L.push('## Crashes', '', ...s.crashes.map(c => `- ${c}`), '')
  if (s.typeMismatch.length) L.push('## Turn type ≠ expected', '', ...s.typeMismatch.map(c => `- ${c}`), '')
  L.push('## Failures', '', ...(s.failures.length ? s.failures.map(f => `- ${f.conv}#${f.turn} [${f.type}]: ${f.failed.join('; ')}`) : ['- none']), '')
  L.push('## Turns', '')
  for (const r of rows) {
    L.push(`### ${r.conv} #${r.turnIndex} — ${r.type}${r.server ? ` (server ${r.server.turnType}/${r.server.domain ?? '-'})` : ''} — ${r.pass ? 'PASS' : 'FAIL'}`, '',
      `> ${r.sent}`, '', `usd ${usd(r.usd)} · in ${r.tokensIn} · out ${r.tokensOut} · serper ${r.serperCalls} (real ${r.net.serperReal}, replayed ${r.net.serperReplayed}) · tools ${r.tools.join(',') || '-'} · rows ${r.toolRows} · ${r.ms} ms`,
      `pick: ${r.mainPick ?? '-'} · alts: ${r.alternatives.join(' · ') || '-'}`, '',
      ...r.checks.map(c => `- ${c.pass ? '✓' : c.info ? '·' : '✗'} ${c.id}${c.detail ? ` — ${c.detail}` : ''}`), '',
      '<details><summary>reply</summary>', '', '```', r.reply, '```', '', '</details>', '')
  }
  return L.join('\n')
}
