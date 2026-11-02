// PHIÊN LUNA — side-by-side numbers for replay out dirs (owner 30/09).
//   node scripts/consult/luna/compare.mjs "Haiku=<dir>,<dir>" "Luna none=<dir>,<dir>" "Luna low=<dir>,<dir>"
// Per configuration (mean over its runs): automatic §9 passes per area (/21), $/turn as the route prices it (Serper
// priced per metered call, replayed or not — comparable with the Phase 7 baseline), $/turn at REAL spend (Serper
// only for calls that went to the network), time to first text (route ttftMs = first model token; ttuaMs = first
// byte of the answer to the client), 900 turns/month, and the total real spend of the runs.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SERPER = 0.001
const q = (xs, p) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))] }
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function loadRun(dir) {
  const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
  const rows = res.rows ?? res
  const usage = new Map()
  const raw = join(dir, 'raw')
  if (existsSync(raw)) for (const f of readdirSync(raw)) {
    const j = JSON.parse(readFileSync(join(raw, f), 'utf8'))
    const u = (j.logEvents ?? []).filter(e => e.type === 'tappyai_usage').at(-1)
    const cost = (j.parsed?.annotations ?? []).find(a => a.kind === 'tappy.turn.v1')
    usage.set(f.replace(/\.json$/, ''), { u, cost })
  }
  return rows.map(r => ({ ...r, log: usage.get(`${r.conv}-t${r.turnIndex}`) ?? {} }))
}

function summarize(dirs) {
  const runs = dirs.map(loadRun)
  const perRun = runs.map(rows => {
    const byArea = {}
    for (const r of rows) { const a = r.area ?? 'none'; byArea[a] ??= { pass: 0, turns: 0 }; byArea[a].turns++; if (r.pass) byArea[a].pass++ }
    const usd = rows.reduce((n, r) => n + (r.usd ?? 0), 0)
    // real spend: models + Serper calls that actually hit the network
    const serperMetered = rows.reduce((n, r) => n + (r.serperCalls ?? 0), 0)
    const serperReal = rows.reduce((n, r) => n + (r.net?.serperReal ?? 0), 0)
    const real = usd - serperMetered * SERPER + serperReal * SERPER
    const byType = {}
    for (const r of rows) { const t = r.server?.turnType ?? r.type; byType[t] ??= []; byType[t].push(r.usd ?? 0) }
    return { turns: rows.length, pass: rows.filter(r => r.pass).length, byArea, usd, real, byType,
      ttft: rows.map(r => r.log.u?.ttftMs).filter(x => typeof x === 'number'),
      ttua: rows.map(r => r.log.u?.ttuaMs).filter(x => typeof x === 'number'),
      reasoning: rows.reduce((n, r) => n + (r.cost?.reasoningTokens ?? r.log.cost?.reasoningTokens ?? 0), 0),
      fallbacks: rows.filter(r => r.cost?.fellBack || r.log.cost?.fellBack).length }
  })
  const areas = [...new Set(perRun.flatMap(r => Object.keys(r.byArea)))].sort()
  const turns = perRun.reduce((n, r) => n + r.turns, 0)
  const typeKeys = [...new Set(perRun.flatMap(r => Object.keys(r.byType)))].sort()
  return {
    runs: perRun.length,
    passTotal: mean(perRun.map(r => r.pass)), turnsPerRun: mean(perRun.map(r => r.turns)),
    area: Object.fromEntries(areas.map(a => [a, mean(perRun.map(r => r.byArea[a]?.pass ?? 0))])),
    usdTurn: perRun.reduce((n, r) => n + r.usd, 0) / turns,
    realTurn: perRun.reduce((n, r) => n + r.real, 0) / turns,
    realTotal: perRun.reduce((n, r) => n + r.real, 0),
    byType: Object.fromEntries(typeKeys.map(t => { const xs = perRun.flatMap(r => r.byType[t] ?? []); return [t, mean(xs)] })),
    ttft: { p50: q(perRun.flatMap(r => r.ttft), 0.5), p90: q(perRun.flatMap(r => r.ttft), 0.9) },
    ttua: { p50: q(perRun.flatMap(r => r.ttua), 0.5), p90: q(perRun.flatMap(r => r.ttua), 0.9) },
    reasoning: perRun.reduce((n, r) => n + r.reasoning, 0), fallbacks: perRun.reduce((n, r) => n + r.fallbacks, 0),
  }
}

const cfgs = process.argv.slice(2).map(a => { const [name, list] = a.split('='); return { name, dirs: list.split(',') } })
const S = cfgs.map(c => ({ name: c.name, s: summarize(c.dirs) }))
const f5 = n => (n == null ? '-' : `$${n.toFixed(5)}`)
const row = (label, fn) => `| ${label} | ${S.map(x => fn(x.s)).join(' | ')} |`
const areas = [...new Set(S.flatMap(x => Object.keys(x.s.area)))].sort()
const types = [...new Set(S.flatMap(x => Object.keys(x.s.byType)))].sort()
console.log([`| | ${S.map(x => `${x.name} (${x.s.runs} lượt)`).join(' | ')} |`, `|---|${S.map(() => '---').join('|')}|`,
  row('Đạt tiêu chí tự động (TB)', s => `${s.passTotal}/${s.turnsPerRun}`),
  ...areas.map(a => row(`— ${a} /21`, s => s.area[a] ?? '-')),
  row('$/lượt (cách route tính, như mốc)', s => f5(s.usdTurn)),
  row('$/lượt thực chi', s => f5(s.realTurn)),
  ...types.map(t => row(`— $/lượt ${t}`, s => f5(s.byType[t]))),
  row('900 lượt/tháng (cách route tính)', s => `$${(900 * s.usdTurn).toFixed(2)}`),
  row('TTFT model p50 / p90 (ms)', s => `${s.ttft.p50} / ${s.ttft.p90}`),
  row('Tới chữ đầu cho user p50 / p90 (ms)', s => `${s.ttua.p50} / ${s.ttua.p90}`),
  row('Token suy luận (tổng)', s => s.reasoning),
  row('Lượt phải chuyển Haiku', s => s.fallbacks),
  row('Thực chi các lượt chạy', s => `$${s.realTotal.toFixed(3)}`),
].join('\n'))
