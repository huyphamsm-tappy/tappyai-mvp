// STEP 9 strict grounding audit. Captures the FULL tool payload alongside the
// reply, then checks every named product and every quoted price against the
// actual returned evidence. No production code touched.
import { writeFileSync } from 'node:fs'
const BASE = 'http://localhost:3000'

const CASES = [
  { id: 'cmp-vi-model', text: 'Nên chọn iPhone 15 hay Galaxy S24?' },
  { id: 'cmp-en-compare', text: 'Compare iPhone and Samsung' },
  { id: '12-vi-where', text: 'Mua tai nghe bluetooth ở đâu' },
]

const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0]
const norm = (s) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()

async function ask(text) {
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) })
  const body = await res.text()
  let out = ''; const tools = []; const results = []
  for (const line of body.split('\n')) {
    if (line.startsWith('0:')) { try { out += JSON.parse(line.slice(2)) } catch { /* */ } }
    else if (line.startsWith('9:')) { try { tools.push(JSON.parse(line.slice(2))) } catch { /* */ } }
    else if (line.startsWith('a:')) { try { results.push(JSON.parse(line.slice(2))) } catch { /* */ } }
  }
  return { text: out, tools, results }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dump = []
for (const c of CASES) {
  await sleep(1500)
  const r = await ask(c.text)
  const evidence = []
  for (const tr of r.results) {
    const res = tr.result ?? {}
    for (const k of ['search_results', 'shop_info_results', 'hotel_list', 'results']) {
      if (Array.isArray(res[k])) for (const it of res[k]) evidence.push(`${it.title ?? it.name ?? ''} || ${it.snippet ?? ''}`)
    }
  }
  const blob = norm(evidence.join(' ~~ '))
  const p = prose(r.text)

  // every bolded span that heads a line = a named candidate
  const named = []
  for (const line of p.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])?\s*\*\*([^*]{2,60})\*\*/)
    if (m) { const s = m[1].trim(); if (!/[?:]$/.test(s)) named.push(s) }
  }
  const PRICE = /(\d[\d.,]{2,})\s*(₫|đ\b|vnd|vnđ|triệu|tr\b|k\b)/gi
  const prices = [...new Set([...p.matchAll(PRICE)].map(m => m[0].trim()))]

  console.log(`\n=================== ${c.id} ===================`)
  console.log(`tool calls: ${r.tools.map(t => t.toolName).join(', ') || 'none'}   evidence items: ${evidence.length}`)
  console.log(`\n-- queries the model actually sent --`)
  r.tools.forEach(t => console.log(`   ${t.toolName}(${JSON.stringify(t.args)})`))
  console.log(`\n-- named candidates in the reply, checked against evidence --`)
  for (const n of named) {
    const hit = blob.includes(norm(n))
    console.log(`   ${hit ? 'GROUNDED  ' : 'NOT FOUND '} "${n}"`)
  }
  console.log(`\n-- prices quoted, checked against evidence --`)
  if (!prices.length) console.log('   (none quoted)')
  for (const pr of prices) {
    const digits = pr.replace(/[^\d]/g, '')
    const hit = blob.replace(/[^\d]/g, ' ').includes(digits)
    console.log(`   ${hit ? 'GROUNDED  ' : 'NOT FOUND '} "${pr}"`)
  }
  console.log(`\n-- first 6 evidence titles --`)
  evidence.slice(0, 6).forEach((e, i) => console.log(`   [${i + 1}] ${e.split(' || ')[0].slice(0, 85)}`))
  dump.push({ id: c.id, request: c.text, tools: r.tools, evidence, named, prices, text: r.text })
}
writeFileSync('grounding-strict.json', JSON.stringify(dump, null, 2))
console.log('\nwrote grounding-strict.json')
