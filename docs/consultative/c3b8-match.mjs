// C3-B.8 STEP 4/5/6 — can a deterministic validator classify every money claim
// in already-captured replies against the evidence that produced them?
// Measurement only. Reuses captured C3-B.5 / C3-B.7 outputs — 0 Serper credits.
import { readFileSync } from 'node:fs'
import { extractMoneyClaims } from './c3b8-money.mjs'

const D = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/docs/consultative/'
const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
const ACCESSORY = /\b(op lung|op |dem tai|dem |cap |hop dung|tui |bao da|mieng dan|kinh cuong luc|gia do|ban le|dau tai|foam|case|cover|pad|cushion|cable|charger|protector|phu kien|thay the|replacement)\b/

/** Money figures present in one evidence record, as VND integers. */
function evidencePrices(rec) {
  const text = `${rec.title ?? ''} ${rec.snippet ?? ''} ${rec.price ?? ''}`
  return extractMoneyClaims(text).flatMap(c => c.kind === 'range' ? [c.lo, c.hi] : [c.lo])
}

/** VERIFIED | ACCESSORY | AMBIGUOUS | UNVERIFIED — deterministic, no fuzzy proximity. */
function classify(claim, records) {
  const vals = claim.kind === 'range' ? [claim.lo, claim.hi] : [claim.lo]
  const hits = []
  for (const r of records) {
    const prices = evidencePrices(r)
    for (const p of prices) {
      // exact, or the model's rounding of a grounded figure to 3 significant
      // figures (13.299.000 -> "13.3M"). NOT proximity: the rounded value must
      // reproduce the evidence figure exactly at that precision.
      const exact = vals.some(v => v === p)
      const rounded = vals.some(v => {
        const mag = Math.pow(10, Math.max(0, String(Math.round(p)).length - 3))
        return Math.round(p / mag) * mag === Math.round(v / mag) * mag
      })
      if (exact || rounded) hits.push({ record: r, price: p, accessory: ACCESSORY.test(strip(r.title ?? '')) })
    }
  }
  if (!hits.length) return { verdict: 'UNVERIFIED', hits }
  if (hits.every(h => h.accessory)) return { verdict: 'ACCESSORY', hits }
  const distinctProducts = new Set(hits.filter(h => !h.accessory).map(h => strip(h.record.title ?? '').slice(0, 40)))
  if (distinctProducts.size > 1) return { verdict: 'AMBIGUOUS', hits }
  return { verdict: 'VERIFIED', hits }
}

// ── corpus: every captured reply that had tool evidence ─────────────────────
// ONLY c3b4-step1.json stored full evidence OBJECTS (title/snippet/link).
// c3b3/c3b5/c3b7 stored candidate NAMES or a 3-item sample, so scoring their
// claims would report "no evidence" for a capture artifact, not for a real
// absence. Measuring them here would manufacture an UNVERIFIED rate.
const corpus = []
for (const r of JSON.parse(readFileSync(D + 'c3b4-step1.json', 'utf8'))) {
  corpus.push({ label: 'C3-B.4 organic', id: `${r.id}#${r.rep}`, text: r.text ?? '', records: r.evidence ?? [], toolCalls: r.searchProductsCalls ?? 0 })
}

const tally = { VERIFIED: 0, UNVERIFIED: 0, ACCESSORY: 0, AMBIGUOUS: 0 }
let claims = 0, repliesWithEvidence = 0, repliesNoEvidence = 0
const examples = { VERIFIED: [], UNVERIFIED: [], ACCESSORY: [], AMBIGUOUS: [] }
for (const c of corpus) {
  const found = extractMoneyClaims(c.text)
  if (!found.length) continue
  c.records.length ? repliesWithEvidence++ : repliesNoEvidence++
  for (const cl of found) {
    claims++
    const { verdict, hits } = classify(cl, c.records)
    tally[verdict]++
    if (examples[verdict].length < 4) examples[verdict].push({ id: c.id, label: c.label, raw: cl.raw, records: c.records.length, hit: hits[0]?.record?.title?.slice(0, 46) ?? null })
  }
}
console.log(`corpus: ${corpus.length} captured replies · ${claims} money claims detected`)
console.log(`replies with money claims:  ${repliesWithEvidence} had evidence records, ${repliesNoEvidence} had NONE\n`)
for (const k of Object.keys(tally)) console.log(`  ${k.padEnd(11)} ${String(tally[k]).padStart(3)}`)
console.log()
for (const k of Object.keys(examples)) {
  if (!examples[k].length) continue
  console.log(`--- ${k} examples`)
  for (const e of examples[k]) console.log(`    ${e.id.padEnd(22)} "${e.raw}"  records=${e.records}  ${e.hit ? '← ' + e.hit : ''}`)
}
