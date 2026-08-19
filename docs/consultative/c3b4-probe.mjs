// C3-B.4 STEP 1 — isolated reproduction with FULL tool payload capture.
// Analysis only; no production file is touched.
import { writeFileSync } from 'node:fs'
const BASE = 'http://localhost:3000'
const REPS = Number(process.env.REPS ?? 5)
const OUT = process.env.OUT ?? 'c3b4-step1.json'
const ONLY = process.env.ONLY

const CASES = [
  { id: 'A1', text: 'Nên mua iPhone hay Samsung?', kind: 'brand-level VI' },
  { id: 'A2', text: 'Should I buy an iPhone or a Samsung?', kind: 'brand-level EN' },
  { id: 'A3', text: 'Nên chọn iPhone 15 hay Galaxy S24?', kind: 'model-level VI (control)' },
  { id: 'A4', text: 'Compare iPhone and Samsung', kind: 'brand-level EN (grounding fail)' },
  { id: 'A5', text: 'So sánh iPhone với Samsung', kind: 'brand-level VI' },
].filter(c => !ONLY || ONLY.split(',').includes(c.id))

const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0]
const norm = (s) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()

// A candidate is an ACCESSORY (irrelevant to a phone comparison) if it names one.
const ACCESSORY = /ốp lưng|op lung|\bcase\b|kính cường lực|kinh cuong luc|tempered|dán màn|mieng dan|sạc|cáp|cap sac|tai nghe|ốp|bao da|giá đỡ|gia do|screen protector/i
// A candidate is DEVICE evidence if it names a phone model/line with a device word.
const DEVICE = /(iphone|galaxy|samsung)\s*(\d{1,2}|s\d{2}|note|ultra|pro|plus|fe)\b|điện thoại|dien thoai|smartphone/i

const REFUSAL = /(ngoài|nằm ngoài|outside)[^.]{0,50}(chuyên môn|phạm vi|wheelhouse|scope)|specializ\w+ in|chỉ hỗ trợ|only (help|support|assist)|not general tech|không hỗ trợ tư vấn/i
// Does the reply ATTRIBUTE its content to the search results?
const ATTRIBUTION = /based on (the )?(search|these) results?|theo kết quả tìm kiếm|dựa (trên|vào) kết quả tìm kiếm|from the search|search results show|mình (đã )?tìm được|i (found|searched)/i
// Does it flag insufficient evidence?
const HEDGE_INSUFFICIENT = /(chưa|không) (tìm|có) (thấy|đủ)|not enough (data|info)|insufficient|couldn'?t find|dữ liệu (chưa|không) đủ|chưa có giá cụ thể|general(ly| knowledge)|nói chung/i

async function ask(text) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) })
  const body = await res.text()
  let out = ''; const tools = []; const results = []; let steps = 0; let usage = {}
  for (const line of body.split('\n')) {
    if (line.startsWith('0:')) { try { out += JSON.parse(line.slice(2)) } catch { /* */ } }
    else if (line.startsWith('9:')) { try { tools.push(JSON.parse(line.slice(2))) } catch { /* */ } }
    else if (line.startsWith('e:')) steps++
    else if (line.startsWith('d:')) { try { usage = JSON.parse(line.slice(2)).usage ?? {} } catch { /* */ } }
    else if (line.startsWith('a:')) { try { results.push(JSON.parse(line.slice(2))) } catch { /* */ } }
  }
  return { text: out, tools, results, steps, usage, ms: Date.now() - t0 }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = []
for (const c of CASES) for (let rep = 1; rep <= REPS; rep++) {
  await sleep(1300)
  let r
  try { r = await ask(c.text) } catch (e) { console.log(`${c.id}#${rep} ERROR ${e}`); continue }
  const evidence = []
  for (const tr of r.results) {
    const res = tr.result ?? {}
    for (const k of ['search_results', 'shop_info_results']) {
      if (Array.isArray(res[k])) for (const it of res[k]) evidence.push({ title: it.title ?? '', snippet: it.snippet ?? '', link: it.link ?? '' })
    }
  }
  const device = evidence.filter(e => DEVICE.test(e.title + ' ' + e.snippet) && !ACCESSORY.test(e.title))
  const accessory = evidence.filter(e => ACCESSORY.test(e.title))
  const p = prose(r.text)
  const row = {
    id: c.id, rep, kind: c.kind, request: c.text,
    refused: REFUSAL.test(p),
    llmCalls: r.steps, toolCalls: r.tools.length,
    searchProductsCalls: r.tools.filter(t => t.toolName === 'search_products').length,
    queries: r.tools.map(t => t.args?.query ?? null).filter(Boolean),
    candidates: evidence.length,
    deviceEvidence: device.length, accessoryEvidence: accessory.length,
    deviceTitles: device.slice(0, 4).map(e => e.title.slice(0, 80)),
    accessoryTitles: accessory.slice(0, 3).map(e => e.title.slice(0, 60)),
    attributesToSearch: ATTRIBUTION.test(p),
    flagsInsufficient: HEDGE_INSUFFICIENT.test(p),
    clarifications: (p.replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\([^)]*\)/g, ' ').match(/\?/g) || []).length,
    promptTokens: r.usage.promptTokens ?? 0, completionTokens: r.usage.completionTokens ?? 0, ms: r.ms,
    text: r.text, evidence,
  }
  rows.push(row)
  console.log(
    `${c.id}#${rep} ${c.kind.padEnd(28)} refuse=${row.refused ? 'YES' : '. '} sp=${row.searchProductsCalls} ` +
    `cand=${String(row.candidates).padStart(2)} (device=${row.deviceEvidence} accessory=${row.accessoryEvidence}) ` +
    `attrib=${row.attributesToSearch ? 'Y' : '.'} hedge=${row.flagsInsufficient ? 'Y' : '.'} clar=${row.clarifications} llm=${r.steps}`)
}
writeFileSync(OUT, JSON.stringify(rows, null, 2))
console.log(`\nwrote ${OUT} (${rows.length} rows)`)
