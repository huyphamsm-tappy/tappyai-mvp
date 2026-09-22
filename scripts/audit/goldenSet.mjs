/**
 * Phase 7 Session C — AI golden-set runner.
 *
 * Replays every case in docs/uat/ai-golden-set.jsonl against a running server
 * exactly as the WEB client does (POST /api/chat, `x-tappy-surface: web`, bearer of
 * a dedicated non-prod test user, `userLocation` when the case carries one), turn by
 * turn with the accumulated history, and records per turn:
 *   - the reply text (all `0:` frames concatenated — what the client renders/persists)
 *   - tool calls (`9:`) and tool-result names (`a:`)
 *   - annotations (`8:`): the places card (`items`), progress, followups
 *   - duplication: the longest repeated span of the reply text
 *   - elapsed ms, HTTP status
 * Output: docs/uat/evidence/golden/<label>/<case>.json + <label>/summary.json.
 *
 * Every POST is one real LLM-reaching request and is counted; the run refuses to
 * exceed GOLDEN_MAX_CALLS (default 40). Nothing is retried.
 *
 * Env: GOLDEN_BASE_URL (default http://localhost:3000), GOLDEN_BEARER (required),
 *      GOLDEN_LABEL (default 'run'), GOLDEN_CASES=T1,T2 (optional filter),
 *      GOLDEN_MAX_CALLS (default 40).
 * Non-prod gate: .env.local must name the audit ref zdaprdfgpbpnxyofagmc and must
 * not name the production ref.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PRODUCTION_REF = 'fwznnobrdctuskgrvuik'
const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'
const envLocal = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
if (envLocal.includes(PRODUCTION_REF)) { console.error('REFUSING: .env.local references the production Supabase ref'); process.exit(2) }
if (!envLocal.includes(AUDIT_REF)) { console.error('REFUSING: .env.local does not reference the audit ref'); process.exit(2) }

const BASE = process.env.GOLDEN_BASE_URL || 'http://localhost:3000'
const BEARER = process.env.GOLDEN_BEARER
const LABEL = process.env.GOLDEN_LABEL || 'run'
const MAX_CALLS = Number(process.env.GOLDEN_MAX_CALLS || 40)
const FILTER = process.env.GOLDEN_CASES ? process.env.GOLDEN_CASES.split(',') : null
if (!BEARER) { console.error('GOLDEN_BEARER required'); process.exit(2) }

const D1 = { lat: 10.7769, lng: 106.7009, address: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam' }
const cases = readFileSync('docs/uat/ai-golden-set.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(c => !FILTER || FILTER.includes(c.id))
const planned = cases.reduce((n, c) => n + c.turns.length, 0)
if (planned > MAX_CALLS) { console.error(`REFUSING: ${planned} calls planned > cap ${MAX_CALLS}`); process.exit(2) }

function parseFrames(raw) {
  const text = []; const tools = []; const toolResults = []; const annotations = []; const other = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':'); if (i < 1) continue
    const prefix = line.slice(0, i); let payload
    try { payload = JSON.parse(line.slice(i + 1)) } catch { continue }
    if (prefix === '0') text.push(payload)
    else if (prefix === '9') tools.push({ name: payload.toolName, args: payload.args })
    else if (prefix === 'a') toolResults.push({ name: payload.toolName ?? null, keys: payload.result && typeof payload.result === 'object' ? Object.keys(payload.result).slice(0, 12) : typeof payload.result })
    else if (prefix === '8') for (const a of (Array.isArray(payload) ? payload : [payload])) annotations.push(summariseAnnotation(a))
    else other[prefix] = (other[prefix] || 0) + 1
  }
  return { text: text.join(''), textFrames: text.length, tools, toolResults, annotations, other }
}

function summariseAnnotation(a) {
  if (!a || typeof a !== 'object') return { raw: String(a).slice(0, 80) }
  const out = { type: a.type ?? a.kind ?? Object.keys(a).slice(0, 4).join(',') }
  // `tappy.places.v1` item keys (liveView.ts `LivePlace`): name, rating, ratingCount, priceRangeText,
  // priceLevel, categories, openingHours, openNow, distanceKm, recommended, reasons. The baseline
  // summariser read `priceRange`/`category`/`picked` and so recorded null for all of them.
  if (Array.isArray(a.items)) out.items = a.items.map(it => ({ name: it.name ?? it.title ?? null, rating: it.rating ?? null, ratingCount: it.ratingCount ?? null, price: it.priceRangeText ?? it.priceSignal ?? (typeof it.priceLevel === 'number' ? '₫'.repeat(it.priceLevel) : null), categories: it.categories ?? null, hours: it.openingHours ?? null, open: it.openNow ?? null, distanceKm: it.distanceKm ?? null, recommended: it.recommended ?? null, reasons: Array.isArray(it.reasons) ? it.reasons.map(r => r.evidence) : null }))
  if (Array.isArray(a.items)) out.raw = a
  if (a.preliminary !== undefined) out.preliminary = a.preliminary
  if (a.picked !== undefined) out.picked = a.picked
  if (a.stage !== undefined) out.stage = a.stage
  if (a.domain !== undefined) out.domain = a.domain
  if (Array.isArray(a.followups)) out.followups = a.followups
  return out
}

/** Longest span (≥ 120 chars) that appears twice in the reply — the duplication signal. */
function longestRepeat(s) {
  const n = s.length; if (n < 240) return null
  for (let len = Math.min(2000, Math.floor(n / 2)); len >= 120; len -= 10) {
    for (let i = 0; i + 2 * len <= n; i += 20) {
      const chunk = s.slice(i, i + len)
      const j = s.indexOf(chunk, i + len)
      if (j !== -1) return { len, at: [i, j], sample: chunk.slice(0, 80) }
    }
  }
  return null
}

function stripMarkers(t) {
  // A CLOSED block is removed up to its closer (the baseline stripped to end-of-text on a
  // [TAPPY_SHOPPING]…[/TAPPY_SHOPPING] whose closer sat mid-line, which is why G5a read as
  // "never answered"); an unclosed one to the next marker or the end.
  return t
    .replace(/\n*\[(TAPPY_PLACES|TAPPY_SHOPPING|CTA_BUTTONS|FOLLOWUPS|TAPPY_PLAN)\][\s\S]*?\[\/\1\]/g, '')
    .replace(/\n*\[(TAPPY_PLACES|TAPPY_SHOPPING|CTA_BUTTONS|FOLLOWUPS|TAPPY_PLAN)\][\s\S]*?(?=\n\[[A-Z_]+\]|$)/g, '')
    .trim()
}

async function chat(messages, location) {
  const headers = { 'Content-Type': 'application/json', 'x-tappy-surface': 'web', Authorization: `Bearer ${BEARER}` }
  const body = { messages, ...(location ? { userLocation: location } : {}) }
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers, body: JSON.stringify(body) })
  const raw = await res.text()
  return { status: res.status, elapsedMs: Date.now() - t0, raw, ...parseFrames(raw) }
}

const outDir = join('docs/uat/evidence/golden', LABEL)
mkdirSync(outDir, { recursive: true })
let calls = 0
const summary = []
for (const c of cases) {
  const messages = []
  const turns = []
  const location = c.location === 'D1' ? D1 : c.location ?? null
  for (const user of c.turns) {
    messages.push({ role: 'user', content: user })
    calls++
    const r = await chat(messages, location)
    const visible = stripMarkers(r.text)
    const turn = {
      user, status: r.status, elapsedMs: r.elapsedMs, textFrames: r.textFrames,
      tools: r.tools, toolResults: r.toolResults.map(t => t.name), annotations: r.annotations,
      cardItems: r.annotations.filter(a => a.items).map(a => a.items.map(i => i.name)),
      duplicate: longestRepeat(visible), text: r.text, visible,
    }
    turns.push(turn)
    messages.push({ role: 'assistant', content: r.text })
    console.log(`[${c.id}] turn ${turns.length}/${c.turns.length} ${r.status} ${r.elapsedMs}ms tools=${r.tools.map(t => t.name).join(',') || '-'} cards=${turn.cardItems.map(x => x.length).join('/') || '-'} dup=${turn.duplicate ? turn.duplicate.len : 0}`)
  }
  const rec = { id: c.id, group: c.group, criteria: c.criteria, turns }
  writeFileSync(join(outDir, `${c.id}.json`), JSON.stringify(rec, null, 2))
  summary.push({ id: c.id, group: c.group, turns: turns.map(t => ({ status: t.status, ms: t.elapsedMs, tools: t.tools.map(x => x.name), cards: t.cardItems, dup: !!t.duplicate, chars: t.visible.length })) })
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ label: LABEL, base: BASE, calls, at: new Date().toISOString(), cases: summary }, null, 2))
console.log(`done: ${calls} LLM-reaching calls → ${outDir}`)
