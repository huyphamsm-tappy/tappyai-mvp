// C3-B.6 STEP 2 — reproduce EXACTLY what searchProducts() sends and receives,
// without the LLM and without the image lookups. Mirrors src/lib/ai/tools/shopping.ts.
// 3 Serper credits per product. The key is read from .env.local, never printed.
import { readFileSync, writeFileSync } from 'node:fs'

const ENV = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.env.local'
const key = readFileSync(ENV, 'utf8').split(/\r?\n/).find(l => l.startsWith('SERPER_API_KEY='))
  .slice('SERPER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')

async function serperSearch(q) {
  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 8 }),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return (data?.organic || []).filter(r => r.title && r.link).slice(0, 6)
    .map(r => ({ title: r.title, link: r.link, snippet: r.snippet || '' }))
}

// shopping.ts: three parallel queries, then a direct-product-link filter.
async function searchProducts(query) {
  const [raw, direct, shop] = await Promise.all([
    serperSearch(query + ' gia Shopee Tiki Lazada'),
    serperSearch(query + ' (site:shopee.vn OR site:tiki.vn OR site:lazada.vn)'),
    serperSearch(query + ' shop website địa chỉ facebook'),
  ])
  const directProductLinks = (direct || []).filter(r => {
    try {
      const u = new URL(r.link); const host = u.hostname.replace(/^www\./, ''); const path = u.pathname.toLowerCase()
      if (host.includes('shopee.vn')) return /-i\.\d+\.\d+/.test(path)
      if (host.includes('tiki.vn')) return /-p\d+\.html/.test(path)
      if (host.includes('lazada.vn')) return path.startsWith('/products/')
      return false
    } catch { return false }
  })
  let search_results = raw || undefined
  if (directProductLinks.length > 0) {
    const seen = new Set()
    search_results = [...directProductLinks, ...(raw || [])].filter(r => { if (seen.has(r.link)) return false; seen.add(r.link); return true }).slice(0, 8)
  }
  return { search_results: search_results ?? [], shop_info_results: shop || [] }
}

// Does this text carry a VND price figure?
const PRICE_RE = /(\d[\d.,]{2,})\s*(₫|đ\b|vnd|vnđ|triệu|tr\b|k\b)/gi
const bigEnough = (s) => { const d = s.replace(/\D/g, ''); return d.length >= 5 }

const TARGETS = process.env.TARGETS
  ? JSON.parse(process.env.TARGETS)
  : ['Sony WH-1000XM5', 'Bose QuietComfort Ultra']

const dump = {}
for (const t of TARGETS) {
  const r = await searchProducts(t)
  const all = [...r.search_results, ...r.shop_info_results]
  console.log(`\n${'='.repeat(76)}\nquery: "${t}"   search_results=${r.search_results.length}  shop_info_results=${r.shop_info_results.length}`)
  let withPrice = 0, targetPrice = 0
  const tokens = t.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  all.forEach((c, i) => {
    const text = `${c.title} ${c.snippet}`
    const prices = [...new Set([...text.matchAll(PRICE_RE)].map(m => m[0].trim()))].filter(bigEnough)
    const namesTarget = tokens.every(w => text.toLowerCase().includes(w))
    if (prices.length) withPrice++
    if (prices.length && namesTarget) targetPrice++
    console.log(`  [${String(i + 1).padStart(2)}] price=${prices.length ? JSON.stringify(prices) : 'NONE'}  namesTarget=${namesTarget ? 'yes' : 'no '}  ${c.title.slice(0, 62)}`)
  })
  console.log(`  → candidates with ANY price figure: ${withPrice}/${all.length}`)
  console.log(`  → candidates with a price AND naming the target product: ${targetPrice}/${all.length}`)
  dump[t] = { search_results: r.search_results, shop_info_results: r.shop_info_results, withPrice, targetPrice, total: all.length }
}
writeFileSync('c3b6-payload.json', JSON.stringify(dump, null, 2))
console.log('\nwrote c3b6-payload.json')
