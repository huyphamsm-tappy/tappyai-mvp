// C3-B.7 STEP 2/4 — can the RETRIEVAL LAYER establish that a price belongs to
// the requested product, deterministically and without an LLM?
// 2 credits per query. Key read from .env.local, never printed.
import { readFileSync, writeFileSync } from 'node:fs'
const ENV = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.env.local'
const key = readFileSync(ENV, 'utf8').split(/\r?\n/).find(l => l.startsWith('SERPER_API_KEY='))
  .slice('SERPER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')

const shopping = async (q) => {
  const r = await fetch('https://google.serper.dev/shopping', {
    method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 20 }),
  })
  if (!r.ok) return { ok: false, status: r.status, items: [] }
  const d = await r.json()
  return { ok: true, credits: d.credits, items: d.shopping ?? [] }
}

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()

// ── the deterministic identity rule under test ───────────────────────────────
// (1) every significant token of the requested model must appear in the title
// (2) the title must not be an ACCESSORY — a lexical noun test, NOT a price test.
//     Price thresholds are explicitly forbidden: they would move the guess
//     server-side. This rejects on what the listing SAYS it is.
const ACCESSORY = /\b(op lung|op |dem tai|dem |cap |day sac|hop dung|tui |bao da|mieng dan|kinh cuong luc|gia do|ban le|dau tai|nut tai|foam|case|cover|pouch|pad|cushion|cable|charger|adapter|protector|skin|strap|stand|holder|phu kien|thay the|replacement)\b/
const tokens = (q) => norm(q).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !['tai', 'nghe', 'dien', 'thoai', 'the'].includes(w))

function classify(requested, title) {
  const t = norm(title)
  const need = tokens(requested)
  const allPresent = need.every(w => t.includes(w))
  if (!allPresent) return 'UNRELATED'
  if (ACCESSORY.test(t)) return 'ACCESSORY'
  return 'PRODUCT'
}

const CASES = [
  { id: '1 exact model EN', q: 'Sony WH-1000XM5' },
  { id: '2 exact model (total-fail case)', q: 'Bose QuietComfort Ultra' },
  { id: '3 S1 product A', q: 'iPhone 15' },
  { id: '4 S1 product B', q: 'Samsung Galaxy S24' },
  { id: '5 brand-only (ambiguous)', q: 'iPhone' },
  { id: '6 accessory-heavy VI', q: 'đệm tai Sony WH-1000XM5' },
]

const dump = {}
let credits = 0
for (const c of CASES) {
  const r = await shopping(c.q)
  credits += r.credits ?? 0
  if (!r.ok) { console.log(`\n${c.id}: HTTP ${r.status}`); continue }
  const rows = r.items.map(it => ({ ...it, verdict: classify(c.q, it.title || '') }))
  const n = (v) => rows.filter(x => x.verdict === v).length
  const withPrice = rows.filter(x => x.price).length
  const productWithPrice = rows.filter(x => x.verdict === 'PRODUCT' && x.price)
  console.log(`\n=== ${c.id}  "${c.q}"  (${rows.length} records, ${withPrice} priced, ${r.credits} credits)`)
  console.log(`    PRODUCT ${n('PRODUCT')} · ACCESSORY ${n('ACCESSORY')} · UNRELATED ${n('UNRELATED')}`)
  rows.slice(0, 12).forEach(x => console.log(`      ${x.verdict.padEnd(9)} ${String(x.price ?? '—').padEnd(13)} ${String(x.source ?? '—').slice(0, 16).padEnd(16)} ${String(x.title ?? '').slice(0, 58)}`))
  if (productWithPrice.length) {
    const nums = productWithPrice.map(x => Number(String(x.price).replace(/\D/g, ''))).filter(Boolean).sort((a, b) => a - b)
    console.log(`    → PRODUCT price range: ${nums[0]?.toLocaleString('vi-VN')} – ${nums[nums.length - 1]?.toLocaleString('vi-VN')} (n=${nums.length})`)
  } else console.log('    → NO product-verified price')
  dump[c.id] = { query: c.q, rows }
}
console.log(`\ntotal credits used: ${credits}`)
writeFileSync('c3b7-identity.json', JSON.stringify(dump, null, 2))
