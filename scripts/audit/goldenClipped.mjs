/**
 * F-094 — how many sentences did the server guards CLIP in a golden run?
 *
 * Needs a run recorded with `preGuard` (goldenSet.mjs, 2026-09-25+): the model's raw reply before
 * any guard, next to `text`, what the client received. Every sentence the client received that is
 * not a sentence the model wrote is classified against the raw text:
 *   headless     — continues a raw sentence whose head was cut          ("nếu bạn ưu tiên …")
 *   broken-bold  — an unclosed `**` or a `****` the model did not write  ("**Tổng ước tính, …", "Pro****")
 *   broken-paren — unbalanced ( ) the model did not write               ("…, đánh giá 5⭐ từ 31 người)")
 *   connective   — the raw sentence minus a leading "Hoặc/Và/Nhưng/Còn" (the sentence before it was
 *                  removed) — LISTED, not counted: it starts like a sentence ("**Bún Riêu …** gần nhất …")
 *   middle-cut   — a raw sentence's head + tail, middle removed — LISTED for review, not counted:
 *                  a removed middle clause usually reads whole ("có **4.5⭐**, đang mở cửa")
 *   tail-cut     — a raw sentence's head, end removed — reads whole, not counted
 *   other        — server-written or reformatted text (enrichment, link rewrites) — not a guard cut
 * CLIPPED = headless + broken-bold + broken-paren.
 *
 * 🚨 The raw text has no step-boundary breaks: the server inserts "\n\n" between a tool preamble
 * and the answer, so the raw "…kế hoạch:Tuyệt vời!" is ONE raw sentence while "Tuyệt vời!" is a
 * whole one on the client. A received sentence is headless only when the raw character before it
 * continues a sentence (a letter, digit or comma); after a terminator, colon, bracket, quote,
 * emphasis or emoji it starts a sentence of its own.
 *
 * For runs without preGuard only the older proxy is available: a sentence starting in lower case
 * right after a sentence end.
 *
 * Usage: node scripts/audit/goldenClipped.mjs <label> [<label> …]   (reads docs/uat/evidence/golden/<label>/)
 *        GOLDEN_CLIPPED_JSON=<file> also writes the per-turn detail.
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
const brokenBold = (s) => ((s.match(/\*\*/g) ?? []).length % 2) === 1 || s.includes('****')
const brokenParen = (s) => (s.match(/\(/g) ?? []).length !== (s.match(/\)/g) ?? []).length
const CONNECTIVE_TAIL = /(?:^|[^\p{L}])(?:và|hoặc|nhưng|còn|and|or|but)\s*$/iu
const CONTINUES = /[\p{L}\p{N},]/u
const lowerStarts = (t) => [...prose(t).matchAll(/(?:[.!?]\s+|\n\s*)(\p{Ll}[^\n]{0,60})/gu)]
  .map(m => m[1]).filter(s => !/^(https?|www)/.test(s))

/** How the raw text leads into S: 'whole' | 'connective' | 'continuation' | 'absent'. */
function rawStart(s, raw) {
  const core = s.replace(/[.!?…]+$/, '')
  const seen = new Set()
  for (let i = raw.indexOf(core); i !== -1; i = raw.indexOf(core, i + 1)) {
    const head = raw.slice(0, i).replace(/[ \t]+$/, '')
    const ch = head.slice(-1)
    if (CONNECTIVE_TAIL.test(head)) {
      const beforeWord = head.replace(CONNECTIVE_TAIL, '').replace(/[ \t]+$/, '').slice(-1)
      seen.add(beforeWord && CONTINUES.test(beforeWord) ? 'continuation' : 'connective')
    } else seen.add(ch && CONTINUES.test(ch) ? 'continuation' : 'whole')
  }
  for (const k of ['whole', 'connective', 'continuation']) if (seen.has(k)) return k
  return 'absent'
}

function classify(s, rawSentences, raw) {
  const inRaw = raw.includes(s.replace(/[.!?…]+$/, ''))
  if (brokenBold(s) && !inRaw) return 'broken-bold'
  if (brokenParen(s) && !inRaw) return 'broken-paren'
  if (rawSentences.includes(s)) return 'intact'
  const where = rawStart(s, raw)
  if (where === 'whole') return 'intact'
  if (where === 'connective') return 'connective'
  if (where === 'continuation') return 'headless'
  if (rawSentences.some(p => p.length > s.length && p.startsWith(s.replace(/[.!?…]+$/, '')))) return 'tail-cut'
  const k = Math.min(12, Math.floor(s.length / 3))
  if (k >= 6 && rawSentences.some(p => p.length > s.length && p.startsWith(s.slice(0, k)) && p.endsWith(s.slice(-k)))) return 'middle-cut'
  return 'other'
}

const COUNTED = new Set(['headless', 'broken-bold', 'broken-paren'])
const LISTED = new Set(['connective', 'middle-cut'])

const out = {}
for (const label of process.argv.slice(2)) {
  const dir = join(ROOT, label)
  const rows = []
  const n = { turns: 0, withPre: 0, 'headless': 0, 'broken-bold': 0, 'broken-paren': 0, 'connective': 0, 'middle-cut': 0, 'tail-cut': 0, lower: 0 }
  for (const f of readdirSync(dir).filter(f => /^[A-Z]\d.*\.json$/.test(f)).sort()) {
    const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    rec.turns.forEach((t, i) => {
      n.turns++
      const row = { turn: `${rec.id} t${i + 1}`, lowerCaseStarts: lowerStarts(t.text), clipped: [], review: [] }
      n.lower += row.lowerCaseStarts.length
      if (typeof t.preGuard === 'string') {
        n.withPre++
        const rawSentences = sentences(t.preGuard)
        for (const s of sentences(t.text)) {
          const c = classify(s, rawSentences, t.preGuard)
          if (c in n) n[c]++
          if (COUNTED.has(c)) row.clipped.push(`${c}: ${s.slice(0, 100)}`)
          else if (LISTED.has(c)) row.review.push(`${c}: ${s.slice(0, 110)}`)
        }
      }
      if (row.clipped.length || row.review.length || row.lowerCaseStarts.length) rows.push(row)
    })
  }
  const clipped = n['headless'] + n['broken-bold'] + n['broken-paren']
  out[label] = { ...n, clipped, rows }
  console.log(`${label}: turns=${n.turns} withPreGuard=${n.withPre} CLIPPED=${n.withPre ? clipped : 'n/a'} (headless ${n['headless']}, broken-bold ${n['broken-bold']}, broken-paren ${n['broken-paren']}; listed, not counted: connective ${n['connective']}, middle-cut ${n['middle-cut']}, tail-cut ${n['tail-cut']}) · lower-case-start proxy=${n.lower}`)
  for (const r of rows) {
    for (const c of r.clipped) console.log(`   ${r.turn}  ${c}`)
    for (const c of r.review) console.log(`   ${r.turn}  (review) ${c}`)
    for (const c of r.lowerCaseStarts) console.log(`   ${r.turn}  lower-start: ${c}`)
  }
}
if (process.env.GOLDEN_CLIPPED_JSON) writeFileSync(process.env.GOLDEN_CLIPPED_JSON, JSON.stringify(out, null, 2))
