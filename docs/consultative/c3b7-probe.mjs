// C3-B.7 STEP 10 — 6-request feasibility probe.
// Temporarily swaps searchProducts' retrieval for the /shopping endpoint by
// replacing a precisely delimited region of shopping.ts, then restores the file
// and verifies the hash. NOT an implementation; nothing is committed.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const SHOP = ROOT + '/src/lib/ai/tools/shopping.ts'
const BASE = 'http://localhost:3000'

const original = readFileSync(SHOP, 'utf8')
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIG = hash(original)

// Replace everything from the parallel organic searches to the end of the
// success-branch assignment with a single /shopping call + deterministic filter.
const START = '    const [searchResultsRaw, directResults, shopInfoResults] = await Promise.all(['
const END = '    if (searchResults && searchResults.length > 0) {'

const REPLACEMENT = `    const shopResp = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 20 }),
    })
    const shopData: { shopping?: Array<{ title?: string; price?: string; source?: string; link?: string }> } =
      shopResp.ok ? await shopResp.json() : {}
    const strip = (s: string) => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\u0111/g, 'd').toLowerCase()
    const ACC = /\\b(op lung|op |dem tai|dem |cap |hop dung|tui |bao da|mieng dan|kinh cuong luc|gia do|ban le|dau tai|foam|case|cover|pad|cushion|cable|charger|protector|phu kien|thay the|replacement)\\b/
    const need = strip(query).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !['tai','nghe','dien','thoai'].includes(w))
    const verified = (shopData.shopping ?? []).filter(it => {
      const t = strip(it.title ?? '')
      return it.price && need.every(w => t.includes(w)) && !ACC.test(t)
    }).slice(0, 6)
    const shopInfoResults: Array<{ title: string; link: string; snippet: string }> = []
    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined =
      verified.length > 0
        ? verified.map(it => ({ title: it.title ?? '', link: it.link ?? '', snippet: 'GIA XAC MINH: ' + (it.price ?? '') + ' — ban tai: ' + (it.source ?? '') }))
        : undefined
`

const idxA = original.indexOf(START)
const idxB = original.indexOf(END)
if (idxA < 0 || idxB < 0 || idxB <= idxA) { console.log('markers not found — refusing to run'); process.exit(1) }
const patched = original.slice(0, idxA) + REPLACEMENT + original.slice(idxB)

const CASES = [
  { id: 'P1 S3 Sony vs Bose (total-fail case)', text: 'Nên mua tai nghe Sony WH-1000XM5 hay Bose QuietComfort Ultra?' },
  { id: 'P2 S1 iPhone 15 vs Galaxy S24 (VI)', text: 'Nên chọn iPhone 15 hay Galaxy S24?' },
  { id: 'P3 EN exact model', text: 'Which should I choose, iPhone 15 or Galaxy S24?' },
]
const REPS = 2

const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0].replace(/!\[[^\]]*\]\([^)]*\)/g, '')
const MONEY = /(\d[\d.,]*)\s*(triệu|tr\b|million|₫|đ\b|vnd|vnđ|k\b)/gi
const NOTFOUND = /chưa tìm thấy|không tìm thấy|chưa có giá|couldn'?t find|no (listed )?price/i
function cands(n, u) {
  const uu = u.toLowerCase(); const a = parseFloat(n.replace(/,/g, '')), b = parseFloat(n.replace(/[.,]/g, ''))
  const m = /triệu|tr|million/.test(uu) ? 1e6 : /k$/.test(uu) ? 1e3 : 1
  const o = new Set(); for (const x of [a, b]) if (!isNaN(x)) o.add(String(Math.round(x * m)))
  if (m === 1) o.add(n.replace(/\D/g, '')); return [...o].filter(s => s.length >= 6)
}
async function ask(text) {
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) })
  const body = await res.text()
  let out = ''; const tools = []; const results = []; let usage = {}; let steps = 0
  for (const l of body.split('\n')) {
    if (l.startsWith('0:')) { try { out += JSON.parse(l.slice(2)) } catch { /* */ } }
    else if (l.startsWith('9:')) { try { tools.push(JSON.parse(l.slice(2))) } catch { /* */ } }
    else if (l.startsWith('e:')) steps++
    else if (l.startsWith('d:')) { try { usage = JSON.parse(l.slice(2)).usage ?? {} } catch { /* */ } }
    else if (l.startsWith('a:')) { try { results.push(JSON.parse(l.slice(2))) } catch { /* */ } }
  }
  return { text: out, tools, results, usage, steps }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = []
try {
  writeFileSync(SHOP, patched)
  await sleep(3500)
  for (const c of CASES) for (let rep = 1; rep <= REPS; rep++) {
    await sleep(1300)
    let r; try { r = await ask(c.text) } catch (e) { console.log(`${c.id}#${rep} ERROR ${e}`); continue }
    const ev = []
    for (const tr of r.results) { const res = tr.result ?? {}; if (Array.isArray(res.search_results)) ev.push(...res.search_results) }
    const evDigits = ev.map(e => `${e.title ?? ''} ${e.snippet ?? ''}`).join(' ').replace(/\D/g, '')
    const p = prose(r.text)
    let ok = 0, bad = 0
    for (const m of new Set([...p.matchAll(MONEY)].map(x => JSON.stringify([x[1], x[2]])))) {
      const [n, u] = JSON.parse(m); const cs = cands(n, u); if (!cs.length) continue
      cs.some(x => evDigits.includes(x)) ? ok++ : bad++
    }
    const row = { id: c.id, rep, verifiedRecords: ev.length, moneyGrounded: ok, moneyNotInEvidence: bad,
      saysNotFound: NOTFOUND.test(p), promptTokens: r.usage.promptTokens ?? 0, outTok: r.usage.completionTokens ?? 0, steps: r.steps,
      sampleEvidence: ev.slice(0, 3).map(e => `${(e.title ?? '').slice(0, 44)} | ${e.snippet ?? ''}`), text: r.text }
    rows.push(row)
    console.log(`${c.id}#${rep}  verifiedRecords=${ev.length}  money[GROUNDED=${ok} NOT-IN-EV=${bad}]  notFound=${row.saysNotFound ? 'Y' : '.'}  promptTok=${row.promptTokens} out=${row.outTok}`)
    if (rep === 1 && ev.length) row.sampleEvidence.forEach(s => console.log(`      ${s}`))
  }
} finally {
  writeFileSync(SHOP, original)
  console.log(`\nrestored shopping.ts ${hash(readFileSync(SHOP, 'utf8')) === ORIG ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  writeFileSync('c3b7-probe.json', JSON.stringify(rows, null, 2))
}
console.log(`\nTOTAL money NOT in evidence: ${rows.reduce((s, r) => s + r.moneyNotInEvidence, 0)} · grounded: ${rows.reduce((s, r) => s + r.moneyGrounded, 0)} · avg promptTok ${Math.round(rows.reduce((s, r) => s + r.promptTokens, 0) / (rows.length || 1))}`)
