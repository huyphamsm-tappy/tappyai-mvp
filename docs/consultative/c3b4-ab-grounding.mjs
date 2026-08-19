// C3-B.4 STEP 3 — diagnostic A/B for the grounding-honesty failure.
// Variant B adds ONE sentence to the comparison stageBlock, which lives in
// `dynamic` — so the B1 cached `shared` prefix is untouched by construction.
// The file is restored and hash-verified. NOT a production change.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const PB = ROOT + '/src/lib/ai/promptBuilder.ts'
const BASE = 'http://localhost:3000'
const REPS = Number(process.env.REPS ?? 3)

const original = readFileSync(PB, 'utf8')
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIG = hash(original)

// Anchor: the last line of the comparison stage block (single line — the tree is CRLF).
const ANCHOR = 'NGHIENG VE: ket lai bang mot cau noi ro ban nghieng ve phuong an nao va VOI DIEU KIEN nao'
const ADDED = 'CHI dan gia/thong so CO trong ket qua tool. Ben nao khong co du lieu thi NOI RO la chua tim thay gia cho ben do - KHONG uoc luong, KHONG suy ra tu kien thuc san co, va KHONG noi hay ham y rang con so do den tu ket qua tim kiem.\r\n'

const CASES = [
  { id: 'A3', text: 'Nên chọn iPhone 15 hay Galaxy S24?' },
  { id: 'A4', text: 'Compare iPhone and Samsung' },
]

const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0].replace(/!\[[^\]]*\]\([^)]*\)/g, '')
const MONEY = /(\d[\d.,]*)\s*(triệu|tr\b|million|₫|đ\b|vnd|vnđ|k\b)/gi
const ATTRIB = /based on (the )?(search|these|current)[^.,]{0,25}|theo kết quả tìm kiếm|dựa (trên|vào) kết quả|search results show/gi
const HEDGE = /(chưa|không) (tìm|thấy|có)[^.]{0,40}(giá|dữ liệu|thông tin)|(couldn'?t|could not|didn'?t) find|no (price|data|listing)|not (found|available) (in|from)|chưa tìm thấy/gi
const PICK = /nghiêng về|i'?d (lean|go with|recommend|pick)|my take|lựa chọn tốt nhất/i
const TRADEOFF = /\b(nhưng|tuy nhiên|đổi lại|however|but |downside|trade-?off|although)\b/i

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
  return { text: out, tools, results, steps, usage }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = []
try {
  if (original.split(ANCHOR).length - 1 !== 1) throw new Error('anchor not unique — refusing to run')
  for (const variant of ['A', 'B']) {
    const patched = variant === 'A' ? original : original.replace(ANCHOR, ADDED + ANCHOR)
    writeFileSync(PB, patched)
    await sleep(3000)
    for (const c of CASES) for (let rep = 1; rep <= REPS; rep++) {
      await sleep(1300)
      let r; try { r = await ask(c.text) } catch (e) { console.log(`${variant} ${c.id}#${rep} ERROR`); continue }
      const ev = []
      for (const tr of r.results) { const res = tr.result ?? {}; for (const k of ['search_results', 'shop_info_results']) if (Array.isArray(res[k])) ev.push(...res[k]) }
      const evDigits = ev.map(e => `${e.title ?? ''} ${e.snippet ?? ''}`).join(' ').replace(/\D/g, '')
      const p = prose(r.text)
      let ground = 0, fab = 0
      for (const m of new Set([...p.matchAll(MONEY)].map(m => JSON.stringify([m[1], m[2]])))) {
        const [num, unit] = JSON.parse(m)
        const cs = candidates(num, unit); if (!cs.length) continue
        cs.some(x => evDigits.includes(x)) ? ground++ : fab++
      }
      const row = {
        variant, id: c.id, rep,
        sp: r.tools.filter(t => t.toolName === 'search_products').length,
        candidates: ev.length,
        moneyGrounded: ground, moneyNotInEvidence: fab,
        attribution: [...new Set((p.match(ATTRIB) || []).map(s => s.trim()))],
        hedgesMissingPrice: (p.match(HEDGE) || []).length,
        pick: PICK.test(p), tradeoff: TRADEOFF.test(p),
        clarifications: (p.replace(/\([^)]*\)/g, ' ').match(/\?/g) || []).length,
        outTok: r.usage.completionTokens ?? 0, llm: r.steps, text: r.text,
      }
      rows.push(row)
      console.log(`${variant} ${c.id}#${rep} sp=${row.sp} cand=${String(row.candidates).padStart(2)} money[ok=${ground} NOT-IN-EV=${fab}] attrib=${row.attribution.length ? 'Y' : '.'} hedge=${row.hedgesMissingPrice} pick=${row.pick ? 'Y' : '.'} trade=${row.tradeoff ? 'Y' : '.'} clar=${row.clarifications} out=${row.outTok}`)
    }
  }
} finally {
  writeFileSync(PB, original)
  console.log(`\nrestored promptBuilder.ts ${hash(readFileSync(PB, 'utf8')) === ORIG ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  writeFileSync('c3b4-ab-grounding.json', JSON.stringify(rows, null, 2))
}
const agg = (v, f) => rows.filter(r => r.variant === v).reduce((s, r) => s + f(r), 0)
console.log(`\nA: money-not-in-evidence ${agg('A', r => r.moneyNotInEvidence)} · attribution ${rows.filter(r => r.variant === 'A' && r.attribution.length).length}/${rows.filter(r => r.variant === 'A').length} · hedges ${agg('A', r => r.hedgesMissingPrice)}`)
console.log(`B: money-not-in-evidence ${agg('B', r => r.moneyNotInEvidence)} · attribution ${rows.filter(r => r.variant === 'B' && r.attribution.length).length}/${rows.filter(r => r.variant === 'B').length} · hedges ${agg('B', r => r.hedgesMissingPrice)}`)
