// C3-B.6 STEP 4 — is an EXPLICIT absence signal in the tool payload even
// effective? Temporarily patches shopping.ts to add one field, unconditionally,
// then measures whether the model stops quoting unverified prices.
//
// Unconditional ON PURPOSE: this tests the SIGNAL'S EFFICACY, not its
// computation. Whether it can be computed correctly is a separate question the
// payload analysis answers. Nothing is committed; the file is hash-restored.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const SHOP = ROOT + '/src/lib/ai/tools/shopping.ts'
const BASE = 'http://localhost:3000'
const REPS = Number(process.env.REPS ?? 3)

const original = readFileSync(SHOP, 'utf8')
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIG = hash(original)

// Single-line anchor (tree is CRLF).
const ANCHOR = "        search_results: searchResults,"
const PATCH = "        price_evidence: 'NOT_VERIFIED: khong co gia san pham nao duoc xac minh trong ket qua nay. Cac con so xuat hien co the la gia PHU KIEN. KHONG duoc dan gia san pham tu ket qua nay.',\r\n        search_results: searchResults,"

const REQ = 'Nên mua tai nghe Sony WH-1000XM5 hay Bose QuietComfort Ultra?'
const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0].replace(/!\[[^\]]*\]\([^)]*\)/g, '')
const MONEY = /(\d[\d.,]*)\s*(triệu|tr\b|million|₫|đ\b|vnd|vnđ|k\b)/gi
const NOTFOUND = /chưa tìm thấy|không tìm thấy|chưa có giá|không có giá|couldn'?t find|not found|no (listed )?price|chưa xác minh/i
const PICK = /nghiêng về|i'?d (lean|go with|recommend|pick|choose)|mình chọn|lựa chọn tốt nhất/i
const TRADEOFF = /\b(nhưng|tuy nhiên|đổi lại|however|but |downside|trade-?off)\b/i

function cands(numStr, unit) {
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
    writeFileSync(SHOP, variant === 'A' ? original : original.replace(ANCHOR, PATCH))
    await sleep(3000)
    for (let rep = 1; rep <= REPS; rep++) {
      await sleep(1300)
      let r; try { r = await ask(REQ) } catch (e) { console.log(`${variant}#${rep} ERROR`); continue }
      const ev = []
      for (const tr of r.results) { const res = tr.result ?? {}; for (const k of ['search_results', 'shop_info_results']) if (Array.isArray(res[k])) ev.push(...res[k]) }
      const evDigits = ev.map(e => `${e.title ?? ''} ${e.snippet ?? ''}`).join(' ').replace(/\D/g, '')
      const p = prose(r.text)
      let ok = 0, bad = 0
      for (const m of new Set([...p.matchAll(MONEY)].map(x => JSON.stringify([x[1], x[2]])))) {
        const [n, u] = JSON.parse(m); const cs = cands(n, u); if (!cs.length) continue
        cs.some(x => evDigits.includes(x)) ? ok++ : bad++
      }
      const row = { variant, rep, sp: r.tools.filter(t => t.toolName === 'search_products').length, cand: ev.length,
        moneyGrounded: ok, moneyNotInEvidence: bad, saysNotFound: NOTFOUND.test(p),
        pick: PICK.test(p), tradeoff: TRADEOFF.test(p), cta: r.text.includes('[CTA_BUTTONS]'),
        clar: (p.replace(/\([^)]*\)/g, ' ').match(/\?/g) || []).length,
        outTok: r.usage.completionTokens ?? 0, promptTokens: r.usage.promptTokens ?? 0, text: r.text }
      rows.push(row)
      console.log(`${variant}#${rep} sp=${row.sp} cand=${row.cand} money[ok=${ok} NOT-IN-EV=${bad}] saysNotFound=${row.saysNotFound ? 'YES' : '. '} pick=${row.pick ? 'Y' : '.'} trade=${row.tradeoff ? 'Y' : '.'} cta=${row.cta ? 'Y' : '.'} clar=${row.clar} out=${row.outTok} promptTok=${row.promptTokens}`)
    }
  }
} finally {
  writeFileSync(SHOP, original)
  console.log(`\nrestored shopping.ts ${hash(readFileSync(SHOP, 'utf8')) === ORIG ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  writeFileSync('c3b6-ab-signal.json', JSON.stringify(rows, null, 2))
}
const sum = (v, f) => rows.filter(r => r.variant === v).reduce((s, r) => s + f(r), 0)
for (const v of ['A', 'B']) {
  const n = rows.filter(r => r.variant === v).length || 1
  console.log(`${v}: money-not-in-evidence ${sum(v, r => r.moneyNotInEvidence)} · saysNotFound ${rows.filter(r => r.variant === v && r.saysNotFound).length}/${n} · pick ${rows.filter(r => r.variant === v && r.pick).length}/${n} · avg promptTok ${Math.round(sum(v, r => r.promptTokens) / n)}`)
}
