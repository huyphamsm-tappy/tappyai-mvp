// C3-B.9 STEP 3–10 — score the deterministic validator against same-turn
// structured evidence. Measurement only; no production code involved.
import { readFileSync } from 'node:fs'
import { extractMoneyClaims } from './c3b8-money.mjs'

const turns = JSON.parse(readFileSync('c3b9-turns.json', 'utf8'))
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

// ── STEP 4: structured price is AUTHORITATIVE. Parse only the `price` FIELD.
// Never title, never snippet.
function structuredPrice(rec) {
  if (!rec.price) return null
  const digits = String(rec.price).replace(/[^\d]/g, '')
  if (digits.length < 4) return null
  return parseInt(digits, 10)
}

const ACCESSORY = /\b(op lung|op |dem tai|dem |mieng dem|cap |day |hop dung|tui |bao da|mieng dan|kinh cuong luc|gia do|ban le|dau tai|nut tai|foam|case|cover|pouch|pad|cushion|cable|charger|adapter|protector|skin|strap|stand|holder|phu kien|thay the|replacement|phim bao ve)\b/
// Suffixes that make a record a DIFFERENT product from the bare model.
const VARIANT_MARK = /\b(ultra|plus|pro|max|fe|mini|se|earbuds|headphones?|gen ?2|2nd|\d+tb|\+)\b/g

function entityTokens(entity) {
  return strip(entity).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !['tai', 'nghe', 'dien', 'thoai'].includes(w))
}
/** Variant words that are part of the REQUESTED entity (so they aren't "extra"). */
function requestedVariants(entity) {
  return new Set((strip(entity).match(VARIANT_MARK) || []))
}

// ── STEP 5: deterministic identity. No price magnitude. No model knowledge.
function identity(entity, rec) {
  const t = strip(rec.title)
  if (!t) return 'AMBIGUOUS'
  if (ACCESSORY.test(t)) return 'ACCESSORY'
  const need = entityTokens(entity)
  const present = need.filter(w => t.includes(w))
  const reqVar = requestedVariants(entity)
  const extraVariant = (t.match(VARIANT_MARK) || []).filter(v => !reqVar.has(v))
  if (present.length === need.length) return extraVariant.length ? 'VARIANT' : 'EXACT_PRODUCT'
  // family match: the most specific model token present but some token missing
  const specific = need[need.length - 1]
  if (specific && t.includes(specific)) return 'VARIANT'
  return 'UNRELATED'
}

// ── attribute each money claim to a requested entity, by sentence.
function attribute(sentence, entities) {
  // A single-product turn has only one thing a price can refer to. The first
  // version returned AMBIGUOUS whenever the sentence didn't repeat the model
  // name ("Giá dao động 6.49–8.09 triệu"), which turned grounded claims into
  // false rejects on T3/T5. Measurement-artifact fix, reported separately.
  if (entities.length === 1) return entities[0]
  const s = strip(sentence)
  const named = entities.filter(e => entityTokens(e).every(w => s.includes(w)))
  if (named.length === 1) return named[0]
  if (named.length > 1) return null            // two products in one sentence
  const loose = entities.filter(e => s.includes(entityTokens(e).slice(-1)[0]))
  return loose.length === 1 ? loose[0] : null
}

const rows = []
for (const turn of turns) {
  const priced = turn.records.map(r => ({ ...r, vnd: structuredPrice(r) })).filter(r => r.vnd)
  const prose = turn.reply.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0].replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  const sentences = prose.split(/(?<=[.!?\n])\s+/).filter(Boolean)
  for (const sent of sentences) {
    for (const claim of extractMoneyClaims(sent)) {
      const ent = attribute(sent, turn.entities)
      let verdict, note = ''
      if (!ent) { verdict = 'AMBIGUOUS'; note = 'attribution: 0 or >1 entity in sentence' }
      else {
        const byId = priced.map(r => ({ r, id: identity(ent, r) }))
        const vals = claim.kind === 'range' ? [claim.lo, claim.hi] : [claim.lo]
        const exactHits = byId.filter(x => x.id === 'EXACT_PRODUCT' && vals.includes(x.r.vnd))
        const variantHits = byId.filter(x => x.id === 'VARIANT' && vals.includes(x.r.vnd))
        const accHits = byId.filter(x => x.id === 'ACCESSORY' && vals.includes(x.r.vnd))
        // STEP 7 — a range needs BOTH endpoints exactly present on EXACT_PRODUCT records.
        const rangeOk = claim.kind !== 'range' || (
          byId.some(x => x.id === 'EXACT_PRODUCT' && x.r.vnd === claim.lo) &&
          byId.some(x => x.id === 'EXACT_PRODUCT' && x.r.vnd === claim.hi))
        if (exactHits.length && rangeOk) verdict = 'VERIFIED'
        else if (accHits.length && !exactHits.length) { verdict = 'ACCESSORY'; note = accHits[0].r.title.slice(0, 44) }
        else if (variantHits.length && !exactHits.length) { verdict = 'AMBIGUOUS'; note = 'variant-only match: ' + variantHits[0].r.title.slice(0, 40) }
        else if (exactHits.length && !rangeOk) { verdict = 'UNVERIFIED'; note = 'range endpoints not both in evidence' }
        else verdict = 'UNVERIFIED'
        // annotation only — NEVER upgrades a verdict
        if (verdict === 'UNVERIFIED') {
          const near = priced.find(r => vals.some(v => { const mag = 10 ** Math.max(0, String(r.vnd).length - 3); return Math.round(r.vnd / mag) === Math.round(v / mag) }))
          if (near) note = `rounded-near ${near.vnd.toLocaleString('vi-VN')} (${identity(ent, near)})`
        }
      }
      rows.push({ turn: turn.id, lang: turn.lang, entity: ent, raw: claim.raw, kind: claim.kind, lo: claim.lo, hi: claim.hi, verdict, note, sentence: sent.trim().slice(0, 110) })
    }
  }
}

const V = ['VERIFIED', 'UNVERIFIED', 'ACCESSORY', 'AMBIGUOUS']
console.log(`money claims detected across 6 turns: ${rows.length}\n`)
for (const r of rows) console.log(`${r.verdict.padEnd(11)} ${String(r.turn).slice(0, 22).padEnd(23)} ${String(r.entity ?? '—').padEnd(24)} ${r.raw.padEnd(22)} ${r.note}`)

console.log('\n=== per-turn identity census (deterministic) ===')
for (const t of turns) {
  const priced = t.records.map(r => ({ ...r, vnd: structuredPrice(r) })).filter(r => r.vnd)
  for (const e of t.entities) {
    const c = { EXACT_PRODUCT: 0, VARIANT: 0, ACCESSORY: 0, UNRELATED: 0, AMBIGUOUS: 0 }
    for (const r of priced) c[identity(e, r)]++
    console.log(`  ${String(t.id).slice(0, 22).padEnd(23)} ${e.padEnd(24)} exact=${c.EXACT_PRODUCT} variant=${c.VARIANT} accessory=${c.ACCESSORY} unrelated=${c.UNRELATED}`)
  }
}

console.log('\n=== matrix ===')
const bucket = (r) => r.kind === 'range' ? 'range' : 'single'
const groups = { 'range': [], 'single': [], vi: [], en: [] }
for (const r of rows) { groups[bucket(r)].push(r); groups[r.lang].push(r) }
for (const [k, g] of Object.entries(groups)) {
  if (!g.length) continue
  const c = Object.fromEntries(V.map(v => [v, g.filter(x => x.verdict === v).length]))
  console.log(`  ${k.padEnd(8)} n=${String(g.length).padStart(2)}  ` + V.map(v => `${v}=${c[v]}`).join('  '))
}
const tot = Object.fromEntries(V.map(v => [v, rows.filter(x => x.verdict === v).length]))
console.log(`  ${'TOTAL'.padEnd(8)} n=${String(rows.length).padStart(2)}  ` + V.map(v => `${v}=${tot[v]}`).join('  '))
