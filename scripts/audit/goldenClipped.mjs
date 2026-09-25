/**
 * F-094 — how many sentences did the server guards CLIP in a golden run?
 *
 * Needs a run recorded with `preGuard` (goldenSet.mjs, 2026-09-25+): the model's raw reply before
 * any guard, next to `text`, what the client received. Every sentence the client received that is
 * not a sentence the model wrote is classified against the raw sentences:
 *   headless    — the tail of a model sentence: its head was cut      ("nếu bạn ưu tiên …")
 *   middle-cut  — a model sentence's head + tail with the middle cut   ("**Tổng ước tính, mua sắm, …")
 *   tail-cut    — a model sentence's head: its end was cut             ("Quán mở đến 22h.") — reads whole, NOT clipped
 *   other       — server-written or reformatted text (enrichment, link rewrites) — not a guard cut
 * CLIPPED = headless + middle-cut, plus any received sentence with an unclosed `**`.
 * For runs without preGuard, the older proxy is also reported: a sentence starting in lower case
 * right after a sentence end.
 *
 * Usage: node scripts/audit/goldenClipped.mjs <label> [<label> …]   (reads docs/uat/evidence/golden/<label>/)
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'docs/uat/evidence/golden'
const BLOCKS = /\[(TAPPY_PLACES|TAPPY_SHOPPING|CTA_BUTTONS|FOLLOWUPS|TAPPY_PLAN)\][\s\S]*?(\[\/\1\]|$)/g
const prose = (t) => (t || '').replace(BLOCKS, '')
const sentences = (t) => prose(t)
  .split(/(?<=[.!?…])\s+|\n+/)
  .map(s => s.trim().replace(/^(?:[-*•]|\d+\.)\s+/, '').trim())
  .filter(s => (s.match(/\p{L}/gu) ?? []).length >= 3)
const unclosedBold = (s) => ((s.match(/\*\*/g) ?? []).length % 2) === 1
const lowerStarts = (t) => [...prose(t).matchAll(/(?:[.!?]\s+|\n\s*)(\p{Ll}[^\n]{0,60})/gu)]
  .map(m => m[1]).filter(s => !/^(https?|www)/.test(s))

function classify(s, pre) {
  if (pre.some(p => p === s)) return 'intact'
  if (pre.some(p => p.length > s.length && p.endsWith(s))) return 'headless'
  if (pre.some(p => p.includes(s) && p.indexOf(s) > 0)) return 'headless'
  if (pre.some(p => p.length > s.length && p.startsWith(s.replace(/[.!?…]+$/, '')))) return 'tail-cut'
  const k = Math.min(12, Math.floor(s.length / 3))
  if (k >= 6 && pre.some(p => p.length > s.length && p.startsWith(s.slice(0, k)) && p.endsWith(s.slice(-k)))) return 'middle-cut'
  return 'other'
}

const out = {}
for (const label of process.argv.slice(2)) {
  const dir = join(ROOT, label)
  const rows = []
  let turns = 0, withPre = 0, clipped = 0, headless = 0, middle = 0, bold = 0, tail = 0, lower = 0
  for (const f of readdirSync(dir).filter(f => /^[A-Z]\d.*\.json$/.test(f)).sort()) {
    const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    rec.turns.forEach((t, i) => {
      turns++
      const lows = lowerStarts(t.text)
      lower += lows.length
      const row = { turn: `${rec.id} t${i + 1}`, lowerCaseStarts: lows }
      if (typeof t.preGuard === 'string') {
        withPre++
        const pre = sentences(t.preGuard)
        const got = sentences(t.text)
        const cls = got.map(s => ({ s, c: unclosedBold(s) && !pre.includes(s) ? 'unclosed-bold' : classify(s, pre) }))
        const bad = cls.filter(x => x.c === 'headless' || x.c === 'middle-cut' || x.c === 'unclosed-bold')
        headless += cls.filter(x => x.c === 'headless').length
        middle += cls.filter(x => x.c === 'middle-cut').length
        bold += cls.filter(x => x.c === 'unclosed-bold').length
        tail += cls.filter(x => x.c === 'tail-cut').length
        clipped += bad.length
        row.clipped = bad.map(x => `${x.c}: ${x.s.slice(0, 90)}`)
        row.tailCut = cls.filter(x => x.c === 'tail-cut').map(x => x.s.slice(0, 90))
      }
      if (row.clipped?.length || row.lowerCaseStarts.length || row.tailCut?.length) rows.push(row)
    })
  }
  out[label] = { turns, turnsWithPreGuard: withPre, clipped, headless, middleCut: middle, unclosedBold: bold, tailCutNotCounted: tail, lowerCaseStartProxy: lower, rows }
  console.log(`${label}: turns=${turns} withPreGuard=${withPre} CLIPPED=${withPre ? clipped : 'n/a'} (headless ${headless}, middle-cut ${middle}, unclosed-bold ${bold}; tail-cut ${tail} not counted) · lower-case-start proxy=${lower}`)
  for (const r of rows) for (const c of [...(r.clipped ?? []), ...r.lowerCaseStarts.map(s => 'lower-start: ' + s)]) console.log(`   ${r.turn}  ${c}`)
}
if (process.env.GOLDEN_CLIPPED_JSON) writeFileSync(process.env.GOLDEN_CLIPPED_JSON, JSON.stringify(out, null, 2))
