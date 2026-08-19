// C3-B.2 PHASE 7 — FEASIBILITY MEASUREMENT ONLY. This is NOT a parser for
// production. It is the simplest honest splitter one would write first, so the
// measured precision/recall is an UPPER-BOUND-shaped estimate of "how far does
// deterministic extraction get before it needs judgement".

const normalizeVN = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

// ── the candidate splitter under measurement ────────────────────────────────
// 1. drop a leading decision frame ("Nên mua", "Which should I buy,", ...)
// 2. drop a trailing adjunct ("cho bữa tối", "for dinner")
// 3. split on a comparison connective
// 4. trim each side
const LEAD = /^(nen (mua|chon|lay|dat|o|di)|minh nen (mua|chon)|so sanh|compare|which (one )?(should i (buy|choose|pick|get)|is better)|should i (buy|choose|pick|get)|what about)\b[,:]?\s*/i
// NOTE: the trailing-particle branch MUST require a preceding space, or it eats
// the last letter of a real name ("Ultra" → "Ultr"). Found by this probe itself.
const TRAIL = /(\s+(?:cho (?:bua|buoi|dip|chuyen)\b.*|de (?:di lam|dung|choi)\b.*|for (?:dinner|lunch|work|travel|commuting)\b.*|nhi|the|vay|a))?\s*[?.!]*$/i
const SPLIT = /\s+(?:hay|hoac|voi|va|or|vs\.?|versus|and)\s+/gi

function extract(text) {
  let t = normalizeVN(text).trim()
  t = t.replace(LEAD, '')
  t = t.replace(TRAIL, '')
  const parts = t.split(SPLIT).map(s => s.trim()).filter(Boolean)
  return parts.length >= 2 ? parts : []
}

const eq = (a, b) => normalizeVN(a).toLowerCase().trim() === normalizeVN(b).toLowerCase().trim()

// ── corpus with GOLD labels ─────────────────────────────────────────────────
// kind: 'product'  → search_products is the right grounding tool
//       'place'    → search_places / get_hotel_prices — NOT search_products
//       'dish'     → a dish, not a purchasable product
const C = [
  // ── Phase 7 required — Vietnamese
  { t: 'Nên mua iPhone hay Samsung?',              gold: ['iPhone', 'Samsung'],                 kind: 'product', tag: 'VI required' },
  { t: 'So sánh iPhone với Samsung',               gold: ['iPhone', 'Samsung'],                 kind: 'product', tag: 'VI required' },
  { t: 'iPhone vs Samsung',                        gold: ['iPhone', 'Samsung'],                 kind: 'product', tag: 'VI required' },
  { t: 'Nên chọn iPhone 15 hay Galaxy S24?',       gold: ['iPhone 15', 'Galaxy S24'],           kind: 'product', tag: 'VI required' },
  // ── Phase 7 required — English
  { t: 'Which should I buy, iPhone or Samsung?',   gold: ['iPhone', 'Samsung'],                 kind: 'product', tag: 'EN required' },
  { t: 'Compare iPhone and Samsung',               gold: ['iPhone', 'Samsung'],                 kind: 'product', tag: 'EN required' },
  { t: 'Should I choose iPhone 15 or Galaxy S24?', gold: ['iPhone 15', 'Galaxy S24'],           kind: 'product', tag: 'EN required' },

  // ── multi-word product names
  { t: 'Sony WH-1000XM5 hay Bose QuietComfort Ultra?', gold: ['Sony WH-1000XM5', 'Bose QuietComfort Ultra'], kind: 'product', tag: 'multi-word' },
  { t: 'Nên mua MacBook Air M3 hay Dell XPS 13?',      gold: ['MacBook Air M3', 'Dell XPS 13'],              kind: 'product', tag: 'multi-word' },
  // brand containing the separator word itself
  { t: 'Black and Decker hay Bosch?',                  gold: ['Black and Decker', 'Bosch'],                  kind: 'product', tag: 'separator-in-name' },
  { t: 'Nên mua tai nghe chống ồn hay tai nghe thể thao?', gold: ['tai nghe chong on', 'tai nghe the thao'], kind: 'product', tag: 'category-not-brand' },

  // ── three-way
  { t: 'iPhone hay Samsung hay Xiaomi?',           gold: ['iPhone', 'Samsung', 'Xiaomi'],       kind: 'product', tag: 'three-way' },
  { t: 'iPhone, Samsung or Xiaomi?',               gold: ['iPhone', 'Samsung', 'Xiaomi'],       kind: 'product', tag: 'three-way' },

  // ── no explicit comparison keyword
  { t: 'iPhone 15 Pro hay Galaxy S24 Ultra?',      gold: ['iPhone 15 Pro', 'Galaxy S24 Ultra'], kind: 'product', tag: 'no-keyword' },

  // ── NOT products — the extractor must not hand these to search_products
  { t: 'Nên chọn quán phở hay quán bún bò cho bữa tối?',   gold: ['quan pho', 'quan bun bo'],   kind: 'dish',  tag: 'benchmark 05-vi' },
  { t: 'Pho or bun bo for dinner, which should I pick?',   gold: ['Pho', 'bun bo'],             kind: 'dish',  tag: 'benchmark 05-en' },
  { t: 'Nên ở gần biển Mỹ Khê hay gần trung tâm Đà Nẵng?', gold: ['gan bien My Khe', 'gan trung tam Da Nang'], kind: 'place', tag: 'benchmark 09-vi' },
  { t: 'Should I stay near My Khe beach or Da Nang city centre?', gold: ['near My Khe beach', 'Da Nang city centre'], kind: 'place', tag: 'benchmark 09-en' },

  // ── ambiguity traps
  { t: 'Quán này hay không?',                      gold: [],  kind: 'none', tag: 'trap: "hay"=good' },
  { t: 'Có quán nào hay ho gần đây không?',        gold: [],  kind: 'none', tag: 'trap: "hay"=fun' },
  { t: 'Mua iPhone ở Shopee hay Tiki rẻ hơn?',     gold: ['Shopee', 'Tiki'], kind: 'channel', tag: 'trap: entities are STORES' },
  { t: 'Nên mua iPhone 15 hay đợi iPhone 16?',     gold: ['iPhone 15', 'doi iPhone 16'], kind: 'product', tag: 'trap: one side is an action' },
]

let exact = 0, partial = 0, wrong = 0, productExact = 0, productTotal = 0
const rows = []
for (const c of C) {
  const got = extract(c.t)
  const goldN = c.gold.map(normalizeVN)
  const gotN = got.map(normalizeVN)
  const isExact = goldN.length === gotN.length && goldN.every((g, i) => eq(g, gotN[i]))
  const hits = goldN.filter(g => gotN.some(x => eq(x, g))).length
  const verdict = isExact ? 'EXACT' : hits > 0 ? 'PARTIAL' : (goldN.length === 0 && gotN.length === 0) ? 'EXACT' : 'WRONG'
  if (verdict === 'EXACT') exact++; else if (verdict === 'PARTIAL') partial++; else wrong++
  if (c.kind === 'product') { productTotal++; if (verdict === 'EXACT') productExact++ }
  rows.push({ verdict, kind: c.kind, tag: c.tag, t: c.t, got, gold: c.gold })
}

for (const r of rows) {
  console.log(`${r.verdict.padEnd(8)} ${r.kind.padEnd(8)} ${r.tag.padEnd(24)} ${r.t}`)
  if (r.verdict !== 'EXACT') console.log(`${''.padEnd(9)}gold=${JSON.stringify(r.gold)}\n${''.padEnd(9)} got=${JSON.stringify(r.got)}`)
}
console.log(`\nEXACT ${exact}/${C.length} · PARTIAL ${partial} · WRONG ${wrong}`)
console.log(`product-kind exact: ${productExact}/${productTotal}`)
console.log(`\nNON-PRODUCT entities that a naive bridge would send to search_products:`)
for (const r of rows) if (r.kind !== 'product' && r.got.length >= 2) console.log(`  [${r.kind}] ${r.t}  →  ${JSON.stringify(r.got)}`)
