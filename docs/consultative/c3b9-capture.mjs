// C3-B.9 STEP 1/2 — capture reply AND structured /shopping records from the SAME turn.
// Temporary patch to shopping.ts ONLY (route/promptBuilder/streamEnrichment untouched),
// hash-verified restore. No filtering in the tool: every structured record is returned
// verbatim so the OFFLINE validator does the identity work (STEP 5).
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const SHOP = ROOT + '/src/lib/ai/tools/shopping.ts'
const BASE = 'http://localhost:3000'

const original = readFileSync(SHOP, 'utf8')
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIG = hash(original)

const START = '    const [searchResultsRaw, directResults, shopInfoResults] = await Promise.all(['
const END = '    if (searchResults && searchResults.length > 0) {'

// photo_url is set from /shopping's own imageUrl so the B7-A pass finds every
// record already enriched and spends ZERO extra Serper credits.
const REPLACEMENT = `    const shopResp = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 20 }),
    })
    const shopData: { shopping?: Array<Record<string, unknown>> } = shopResp.ok ? await shopResp.json() : {}
    const shopInfoResults: Array<{ title: string; link: string; snippet: string }> = []
    const recs = (shopData.shopping ?? []).slice(0, 12)
    let searchResults: Array<Record<string, unknown>> | undefined = recs.length > 0
      ? recs.map(it => ({
          title: String(it.title ?? ''),
          link: String(it.link ?? ''),
          snippet: '',
          price: String(it.price ?? ''),
          source: String(it.source ?? ''),
          productId: String(it.productId ?? ''),
          photo_url: String(it.imageUrl ?? ''),
          photo_urls: it.imageUrl ? [String(it.imageUrl)] : [],
        }))
      : undefined
`

const idxA = original.indexOf(START), idxB = original.indexOf(END)
if (idxA < 0 || idxB < 0) { console.log('markers not found'); process.exit(1) }
const patched = original.slice(0, idxA) + REPLACEMENT + original.slice(idxB)

const TURNS = [
  { id: 'T1 VI comparison variant-heavy', text: 'Nên chọn iPhone 15 hay Galaxy S24?', entities: ['iPhone 15', 'Galaxy S24'], lang: 'vi' },
  { id: 'T2 VI comparison (total-fail case)', text: 'Nên chọn Sony WH-1000XM5 hay Bose QuietComfort Ultra?', entities: ['Sony WH-1000XM5', 'Bose QuietComfort Ultra'], lang: 'vi' },
  { id: 'T3 exact-model VI', text: 'Mua tai nghe Sony WH-1000XM5 ở đâu?', entities: ['Sony WH-1000XM5'], lang: 'vi' },
  { id: 'T4 exact-model EN', text: 'Where can I buy a Bose QuietComfort Ultra?', entities: ['Bose QuietComfort Ultra'], lang: 'en' },
  { id: 'T5 accessory-heavy', text: 'Mua đệm tai cho Sony WH-1000XM5 ở đâu?', entities: ['Sony WH-1000XM5'], lang: 'vi' },
  { id: 'T6 variant-heavy ambiguous', text: 'Nên mua Galaxy S24 hay Galaxy S24 Ultra?', entities: ['Galaxy S24', 'Galaxy S24 Ultra'], lang: 'vi' },
]

async function ask(text) {
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) })
  const body = await res.text()
  let out = ''; const calls = []; const results = []; let usage = {}; let steps = 0
  for (const l of body.split('\n')) {
    if (l.startsWith('0:')) { try { out += JSON.parse(l.slice(2)) } catch { /* */ } }
    else if (l.startsWith('9:')) { try { calls.push(JSON.parse(l.slice(2))) } catch { /* */ } }
    else if (l.startsWith('e:')) steps++
    else if (l.startsWith('d:')) { try { usage = JSON.parse(l.slice(2)).usage ?? {} } catch { /* */ } }
    else if (l.startsWith('a:')) { try { results.push(JSON.parse(l.slice(2))) } catch { /* */ } }
  }
  return { text: out, calls, results, usage, steps }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const turns = []
try {
  writeFileSync(SHOP, patched)
  await sleep(3500)
  for (const t of TURNS) {
    await sleep(1300)
    let r
    try { r = await ask(t.text) } catch (e) { console.log(`${t.id} ERROR ${e}`); continue }
    const records = []
    for (const tr of r.results) {
      const sr = tr.result?.search_results
      if (Array.isArray(sr)) records.push(...sr)
    }
    const turn = {
      id: t.id, lang: t.lang, request: t.text, entities: t.entities,
      shoppingQueries: r.calls.filter(c => c.toolName === 'search_products').map(c => c.args?.query ?? null),
      toolCalls: r.calls.map(c => c.toolName),
      records, reply: r.text, steps: r.steps,
      promptTokens: r.usage.promptTokens ?? 0, outTok: r.usage.completionTokens ?? 0,
    }
    turns.push(turn)
    console.log(`${t.id.padEnd(36)} sp=${turn.shoppingQueries.length} records=${records.length} withPrice=${records.filter(x => x.price).length} steps=${r.steps} out=${turn.outTok}`)
    console.log(`    queries: ${JSON.stringify(turn.shoppingQueries)}`)
  }
} finally {
  writeFileSync(SHOP, original)
  console.log(`\nrestored shopping.ts ${hash(readFileSync(SHOP, 'utf8')) === ORIG ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  writeFileSync('c3b9-turns.json', JSON.stringify(turns, null, 2))
  console.log(`wrote c3b9-turns.json (${turns.length} turns)`)
  const shoppingCalls = turns.reduce((s, t) => s + t.shoppingQueries.length, 0)
  console.log(`/shopping calls: ${shoppingCalls} → ${shoppingCalls * 2} Serper credits (image lookups avoided: records carry imageUrl)`)
}
