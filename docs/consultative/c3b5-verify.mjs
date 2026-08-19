// C3-B.5 STEP 6 — behavioural verification of the grounding contract, real data.
import { writeFileSync } from 'node:fs'
const BASE = 'http://localhost:3000'
const REPS = Number(process.env.REPS ?? 3)

const CASES = [
  { id: 'S1-vi-model', lang: 'vi', text: 'Nên chọn iPhone 15 hay Galaxy S24?', note: 'numeric fabrication case (5/5 before)' },
  { id: 'S2-en-brand', lang: 'en', text: 'Compare iPhone and Samsung', note: 'broad/qualitative case' },
  { id: 'S3-vi-audio', lang: 'vi', text: 'Nên mua tai nghe Sony WH-1000XM5 hay Bose QuietComfort Ultra?', note: 'qualitative stress: listings exist, quality claims tempting' },
]

const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0].replace(/!\[[^\]]*\]\([^)]*\)/g, '')
const MONEY = /(\d[\d.,]*)\s*(triệu|tr\b|million|₫|đ\b|vnd|vnđ|k\b)/gi
const ATTRIB = /based on (the )?(search|these|current)[^.,]{0,28}|theo kết quả tìm kiếm|dựa (trên|vào) kết quả[^.,]{0,20}|search results show/gi
// Qualitative dimensions a marketplace listing cannot establish.
const QUAL = /\b(camera|chụp ảnh|ecosystem|hệ sinh thái|độ bền|do ben|durability|resale|giữ giá|bảo hành|warranty|service cent|reliab|tốt hơn nói chung|better overall)\b/gi
// Markers that flag a statement as the assistant's own general view.
const OPINION = /ý kiến chung|nói chung|mình nghĩ|mình thấy|theo mình|general(ly| view| knowledge)|in general|typically|thường thì|my (own )?take|nhìn chung/i
// Explicitly naming a side as having no price found.
const NOTFOUND = /chưa tìm thấy|không tìm thấy|couldn'?t find|not found|no (listed )?price|chưa có giá/i
const PICK = /nghiêng về|i'?d (lean|go with|recommend|pick|choose)|my take|lựa chọn tốt nhất|mình chọn/i
const TRADEOFF = /\b(nhưng|tuy nhiên|đổi lại|bù lại|however|but |downside|trade-?off|although)\b/i

function candidates(numStr, unit) {
  const u = unit.toLowerCase()
  const a = parseFloat(numStr.replace(/,/g, '')), b = parseFloat(numStr.replace(/[.,]/g, ''))
  const mult = /triệu|tr|million/.test(u) ? 1e6 : /k$/.test(u) ? 1e3 : 1
  const out = new Set()
  for (const base of [a, b]) if (!isNaN(base)) out.add(String(Math.round(base * mult)))
  if (mult === 1) out.add(numStr.replace(/\D/g, ''))
  return [...out].filter(s => s.length >= 6)
}

async function ask(text) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) })
  const body = await res.text()
  let out = ''; const tools = []; const results = []; let steps = 0; let usage = {}
  for (const l of body.split('\n')) {
    if (l.startsWith('0:')) { try { out += JSON.parse(l.slice(2)) } catch { /* */ } }
    else if (l.startsWith('9:')) { try { tools.push(JSON.parse(l.slice(2))) } catch { /* */ } }
    else if (l.startsWith('e:')) steps++
    else if (l.startsWith('d:')) { try { usage = JSON.parse(l.slice(2)).usage ?? {} } catch { /* */ } }
    else if (l.startsWith('a:')) { try { results.push(JSON.parse(l.slice(2))) } catch { /* */ } }
  }
  return { text: out, tools, results, steps, usage, ms: Date.now() - t0 }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = []
for (const c of CASES) for (let rep = 1; rep <= REPS; rep++) {
  await sleep(1300)
  let r; try { r = await ask(c.text) } catch (e) { console.log(`${c.id}#${rep} ERROR ${e}`); continue }
  const ev = []
  for (const tr of r.results) { const res = tr.result ?? {}; for (const k of ['search_results', 'shop_info_results']) if (Array.isArray(res[k])) ev.push(...res[k]) }
  const evDigits = ev.map(e => `${e.title ?? ''} ${e.snippet ?? ''}`).join(' ').replace(/\D/g, '')
  const p = prose(r.text)
  let ok = 0, bad = 0
  for (const m of new Set([...p.matchAll(MONEY)].map(x => JSON.stringify([x[1], x[2]])))) {
    const [num, unit] = JSON.parse(m); const cs = candidates(num, unit); if (!cs.length) continue
    cs.some(x => evDigits.includes(x)) ? ok++ : bad++
  }
  const attribution = [...new Set((p.match(ATTRIB) || []).map(s => s.trim()))]
  const qual = [...new Set((p.match(QUAL) || []).map(s => s.toLowerCase()))]
  const row = {
    id: c.id, lang: c.lang, rep, note: c.note, request: c.text,
    sp: r.tools.filter(t => t.toolName === 'search_products').length,
    toolCalls: r.tools.length, candidates: ev.length,
    moneyGrounded: ok, moneyNotInEvidence: bad,
    attribution, qualitativeDims: qual,
    flagsOpinion: OPINION.test(p), saysNotFound: NOTFOUND.test(p),
    // A false attribution = it credits the search AND asserts qualitative
    // dimensions a listing cannot support, without flagging them as opinion.
    falseAttribution: attribution.length > 0 && qual.length > 0 && !OPINION.test(p),
    pick: PICK.test(p), tradeoff: TRADEOFF.test(p),
    cta: r.text.includes('[CTA_BUTTONS]'),
    clarifications: (p.replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\([^)]*\)/g, ' ').match(/\?/g) || []).length,
    llm: r.steps, promptTokens: r.usage.promptTokens ?? 0, outTok: r.usage.completionTokens ?? 0, ms: r.ms,
    text: r.text,
  }
  rows.push(row)
  console.log(
    `${row.id}#${rep} sp=${row.sp} cand=${String(row.candidates).padStart(2)} ` +
    `money[ok=${ok} BAD=${bad}] attrib=${attribution.length ? 'Y' : '.'} qual=${qual.length} opinion=${row.flagsOpinion ? 'Y' : '.'} ` +
    `notfound=${row.saysNotFound ? 'Y' : '.'} FALSE-ATTR=${row.falseAttribution ? 'YES' : '. '} ` +
    `pick=${row.pick ? 'Y' : '.'} trade=${row.tradeoff ? 'Y' : '.'} cta=${row.cta ? 'Y' : '.'} clar=${row.clarifications} out=${row.outTok} ${row.ms}ms`)
}
writeFileSync('c3b5-verify.json', JSON.stringify(rows, null, 2))
const n = rows.length
console.log(`\n== totals over ${n} turns ==`)
console.log(`  money NOT in evidence   ${rows.reduce((s, r) => s + r.moneyNotInEvidence, 0)}`)
console.log(`  money grounded          ${rows.reduce((s, r) => s + r.moneyGrounded, 0)}`)
console.log(`  FALSE attribution       ${rows.filter(r => r.falseAttribution).length}/${n}`)
console.log(`  says "not found"        ${rows.filter(r => r.saysNotFound).length}/${n}`)
console.log(`  flags own opinion       ${rows.filter(r => r.flagsOpinion).length}/${n}`)
console.log(`  pick / tradeoff / cta   ${rows.filter(r => r.pick).length} / ${rows.filter(r => r.tradeoff).length} / ${rows.filter(r => r.cta).length}`)
console.log(`  clarifications >1       ${rows.filter(r => r.clarifications > 1).length}/${n}`)
console.log(`  LLM calls / out tokens  ${rows.reduce((s, r) => s + r.llm, 0)} / ${rows.reduce((s, r) => s + r.outTok, 0)}`)
