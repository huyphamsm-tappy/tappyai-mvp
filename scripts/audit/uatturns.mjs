// UAT TRACE — one numbered row per /api/chat turn, joined from the three files the `uat-owner` launch
// config writes (docs/audit/uat/<day>/): server.log (console), usage.jsonl (cost sink), capture.jsonl
// (request capture: surface + GPS + last user text). 0 runs. usage:
//   node scripts/audit/uatturns.mjs docs/audit/uat/2026-09-20 [--md] [--turn N]
// Turn = one `tappyai_intent_gate` line in server.log; everything until the next one belongs to it.
// Run web and Android turns one at a time — two turns in flight interleave their log lines.
import { readFileSync, existsSync } from 'node:fs'
const [dir, ...rest] = process.argv.slice(2)
const md = rest.includes('--md')
const only = rest.includes('--turn') ? Number(rest[rest.indexOf('--turn') + 1]) : null
const read = f => existsSync(`${dir}/${f}`) ? readFileSync(`${dir}/${f}`, 'utf8').split(/\r?\n/) : []
const J = l => { const i = l.indexOf('{'); if (i < 0) return null; try { return JSON.parse(l.slice(i)) } catch { return null } }

// server.log → turns
const turns = []
let cur = null
for (const line of read('server.log')) {
  const o = J(line); if (!o || typeof o.type !== 'string' || !o.type.startsWith('tappyai_')) continue
  if (o.type === 'tappyai_intent_gate') { cur = { n: turns.length + 1, intent: o.turnIntent, tools: [], provider: null, cards: null, errors: [], hard: null, usage: null, canned: null, clarify: null, guards: [] }; turns.push(cur); continue }
  if (!cur) continue
  if (o.type === 'tappyai_clarify_gate') cur.clarify = { actionable: o.actionable, domain: o.domain, missing: o.missing, scope: o.scope ?? 'thread' }
  else if (o.type === 'tappyai_canned_reply') cur.canned = o.kind
  else if (o.type === 'tappyai_places_provider') cur.provider = o.provider
  else if (o.type === 'tappyai_tool_called' && o.tool && o.step !== 'fn_entry' && o.step !== 'type_coerced') cur.tools.push(`${o.tool}${o.query ? `(${o.query}${o.location ? ' @ ' + o.location : ''})` : ''}`)
  else if (o.type === 'tappyai_cards') cur.cards = o
  else if (o.type === 'tappyai_cards_error') cur.errors.push(o.reason)
  else if (o.type === 'tappyai_consultative_v1' && o.step === 'attributes') cur.hard = { hard: o.hard, gaps: o.hard_gaps, contrary: o.hard_contrary, backed: o.hard_row_backed, budget_gap: o.budget_gap }
  else if (o.type === 'tappyai_consultative_v1' && o.step === 'frame') cur.frame = { hard: o.hard, who: o.who, time: o.time }
  else if (o.type === 'tappyai_guard' && o.guard === 'consultative_v1') cur.guards.push(`v1: cut ${o.sentences_in - o.sentences_out}${o.trailing_question_removed ? ' +trailQ' : ''}${o.hedges ? ` hedges ${o.hedges}` : ''}`)
  else if (o.type === 'tappyai_guard' && o.guard === 'place_claim' && o.sentences_removed) cur.guards.push(`place_claim: -${o.sentences_removed} câu`)
  else if (o.type === 'tappyai_guard' && o.guard === 'snippet_price' && o.sentences_removed) cur.guards.push(`snippet_price: -${o.sentences_removed} câu`)
  else if (o.type === 'tappyai_usage') cur.usage = o
}

// usage.jsonl → cost + serper + grounding cuts, in write order (grounding records precede their turn's usage record)
const sink = read('usage.jsonl').map(J).filter(Boolean)
const sinkTurns = []; let pendingCuts = []
for (const o of sink) {
  if (o.type === 'tappyai_audit_grounding') pendingCuts.push({ suppressed: o.suppressed, preGate: (o.preGate ?? '').slice(0, 400) })
  else if (o.type === 'tappyai_usage' || o.type === 'tappyai_usage_canned') { sinkTurns.push({ at: o.at, canned: o.canned ?? null, llm: o.llmCalls, tool: o.toolCalls, credits: o.serper?.credits ?? 0, cuts: pendingCuts, prompt: o.promptTokens, cacheRead: o.cacheReadTokens, cacheWrite: o.cacheCreationTokens, out: o.completionTokens }); pendingCuts = [] }
}
// capture.jsonl → surface + GPS + text (model turns only: a canned turn never reaches the capture)
const caps = read('capture.jsonl').map(J).filter(Boolean)
let ci = 0
const cost = s => s.canned ? 0 : ((s.prompt ?? 0) * 3 + (s.cacheWrite ?? 0) * 3.75 + (s.cacheRead ?? 0) * 0.3 + (s.out ?? 0) * 15) / 1e6 + (s.credits ?? 0) * 0.001

const rows = turns.map((t, i) => {
  const s = sinkTurns[i]
  const cap = t.canned ? null : caps[ci++]
  return {
    n: t.n, at: s?.at?.slice(11, 19) ?? '-', surface: cap?.request?.surface ?? (t.canned ? '(canned)' : '-'),
    gps: cap?.request?.userLocation ? `${cap.request.userLocation.lat},${cap.request.userLocation.lng}` : '-',
    text: cap ? String(cap.request.messages.slice(-1)[0]?.content ?? '').slice(0, 60) : (t.canned ? `canned ${t.canned}` : '-'),
    intent: t.intent, clarify: t.clarify ? `${t.clarify.actionable ? 'act' : 'ASK'}/${t.clarify.domain ?? '-'}/${t.clarify.scope}` : '-',
    provider: t.provider ?? '-', tools: t.tools.join('; ') || '-', toolCalls: t.usage?.toolCalls ?? (t.canned ? 0 : '-'),
    card1: t.cards?.card1 ?? '-', modelPick: t.cards?.model_pick ?? '-', enginePick: t.cards?.engine_pick ?? '-',
    pickUnmatched: t.cards ? t.cards.pick_unmatched : '-', emphasis: t.cards?.emphasis ?? '-', errors: t.errors.join(',') || '-',
    hard: t.hard ? `hard ${JSON.stringify(t.hard.hard)} gaps ${JSON.stringify(t.hard.gaps)} contrary ${JSON.stringify(t.hard.contrary)}${t.hard.budget_gap ? ' budget_gap' : ''}` : (t.frame ? `frame hard ${JSON.stringify(t.frame.hard)}` : '-'),
    guards: t.guards.join(' · ') || '-', cuts: s?.cuts?.length ? s.cuts.map(c => `cut ${JSON.stringify(c.suppressed)}`).join(' ') : '-',
    credits: s?.credits ?? '-', cost: s ? '$' + cost(s).toFixed(4) : '-', cache: s && !s.canned ? `${Math.round(100 * (s.cacheRead ?? 0) / Math.max(1, (s.cacheRead ?? 0) + (s.cacheWrite ?? 0) + (s.prompt ?? 0)))}%` : '-',
  }
}).filter(r => only === null || r.n === only)

if (md) {
  console.log('| # | giờ | surface | GPS | user text | intent | clarify | provider | toolCalls | card #1 | model pick | engine pick | unmatched | Vì sao | lỗi | hard | guards | grounding cut | credits | $ | cache |')
  console.log('|' + '---|'.repeat(21))
  for (const r of rows) console.log(`| ${r.n} | ${r.at} | ${r.surface} | ${r.gps} | ${r.text} | ${r.intent} | ${r.clarify} | ${r.provider} | ${r.toolCalls} | ${r.card1} | ${r.modelPick} | ${r.enginePick} | ${r.pickUnmatched} | ${r.emphasis} | ${r.errors} | ${r.hard} | ${r.guards} | ${r.cuts} | ${r.credits} | ${r.cost} | ${r.cache} |`)
  if (only !== null) { const s = sinkTurns[only - 1]; for (const c of s?.cuts ?? []) console.log('\npreGate:\n' + c.preGate) }
} else console.log(JSON.stringify(rows, null, 1))
