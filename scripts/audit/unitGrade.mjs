// E2/E3 grader — deterministic, 0 model calls. Reads an evalUnits run dir and grades every turn on
// the answer-unit axis: did the reply produce the UNIT the query is tagged with, and is every
// NAME / PRICE / TIME in the prose traced to a fetched row (this turn's or the thread's), the
// user's own words, or an explicit hedge. Names are matched the way the grounding gate does
// (folded, substring both ways, venue-type prefix stripped).
//   usage: node unitGrade.mjs <runDir> [ids...] [--md] [--json]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { QUERIES, ORDER } from './evalUnits.queries.mjs'

const args = process.argv.slice(2)
const md = args.includes('--md')
const asJson = args.includes('--json')
const [dir, ...ids] = args.filter(a => !a.startsWith('--'))
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const TYPE_PREFIX = /^(?:nha hang|quan an|quan|tiem|cafe|ca phe|coffee|restaurant|bar|pub|club|spa|salon|khach san|hotel|resort|homestay|rap|the)\s+/
const strip = n => { const s = n.replace(TYPE_PREFIX, '').trim(); return s.length >= 3 ? s : n }
const grounded = (h, known) => { const hh = strip(h); return known.some(k => { const kk = strip(k); return k.includes(h) || h.includes(k) || kk.includes(hh) || hh.includes(kk) }) }

// ── evidence readers ──
const ROW_KEYS = ['results', 'search_results', 'shopping_results', 'hotel_list', 'bus_search_results', 'train_search_results', 'price_search_results']
function rowsOf(rec) {
  const out = []
  for (const t of rec?.toolResults ?? []) for (const k of ROW_KEYS) for (const x of (t?.[k] ?? [])) if (x && typeof x === 'object') out.push(x)
  return out
}
function threadRows(rec, dir, seen = new Set()) {
  const rows = rowsOf(rec)
  if (rec.parent && !seen.has(rec.parent) && existsSync(`${dir}/${rec.parent}.json`)) {
    seen.add(rec.parent)
    rows.push(...threadRows(JSON.parse(readFileSync(`${dir}/${rec.parent}.json`, 'utf8')), dir, seen))
  }
  return rows
}
/** VND amounts a text states, as numbers. "100-200k" → [100000, 200000]; "1.5 triệu" → 1500000; "250.000đ" → 250000; "100-200 N ₫" → both. */
const UNIT = '(k|nghìn|nghin|ngàn|ngan|triệu|trieu|tr|₫|đ|vnd|vnđ|n ₫)'
const NUM = String.raw`(\d+(?:[.,]\d+)*)`
const RANGE_RE = new RegExp(NUM + String.raw`\s*[-–]\s*` + NUM + String.raw`\s*` + UNIT + String.raw`(?![\p{L}\p{N}])`, 'giu')
const SINGLE_RE = new RegExp(NUM + String.raw`\s*` + UNIT + String.raw`(?![\p{L}\p{N}])`, 'giu')
const toNum = (numStr) => /^\d{1,3}(\.\d{3})+$/.test(numStr) ? Number(numStr.replace(/\./g, '')) : Number(numStr.replace(',', '.'))
function amountsIn(text) {
  const out = []
  let t = text
  for (const m of text.matchAll(RANGE_RE)) {
    const u = m[3].toLowerCase()
    for (const x of [toNum(m[1]), toNum(m[2])]) { const n = scale(x, u); if (Number.isFinite(n) && n >= 1000) out.push(Math.round(n)) }
    t = t.replace(m[0], ' ')
  }
  for (const m of t.matchAll(SINGLE_RE)) { const n = scale(toNum(m[1]), m[2].toLowerCase()); if (Number.isFinite(n) && n >= 1000) out.push(Math.round(n)) }
  return out
}
function scale(n, unit) {
  if (/^(k|nghìn|nghin|ngàn|ngan|n ₫)$/.test(unit)) return n * 1000
  if (/^(triệu|trieu|tr)$/.test(unit)) return n * 1000000
  return n
}
/** Clock times a text states, normalised "H:MM". */
function timesIn(text) {
  const out = new Set()
  const re = /\b(2[0-3]|[01]?\d):([0-5]\d)\b|\b(2[0-3]|[01]?\d)\s*(?:h|giờ|gio)\s*([0-5]\d)?(?:\s*(sáng|chiều|tối|đêm|pm|am))?(?![\p{L}\p{N}])/giu
  for (const m of text.matchAll(re)) {
    let h = Number(m[1] ?? m[3]); const min = m[2] ?? m[4] ?? '00'; const p = (m[5] ?? '').toLowerCase()
    if ((p === 'chiều' || p === 'tối' || p === 'pm') && h < 12) h += 12
    if (p === 'đêm' && h >= 6 && h < 12) h += 12
    out.add(`${h}:${min}`)
  }
  return [...out]
}
const near = (v, set, tol = 0.02) => set.some(e => Math.abs(v - e) <= Math.max(e * tol, 1000))

// ── prose readers ──
const stripMarkers = p => p.replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, ' ').replace(/\[TAPPY_SHOPPING\][\s\S]*?\[\/TAPPY_SHOPPING\]/g, ' ').replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/g, ' ').replace(/\[TAPPY_PLACES\][\s\S]*?\[\/TAPPY_PLACES\]/g, ' ').replace(/\[FOLLOWUPS\][^\n]*/g, ' ').replace(/\]\((https?:[^)]+)\)/g, ']')
const nameLike = h => /^\p{Lu}/u.test(h) && h.split(/\s+/).length <= 7 && !/\d{3,}|⭐|đánh giá|reviews?|^\d|₫|VND|\bk\b|\.(?:com|vn|net)\b/i.test(h) && !/\b(?:bạn|nên|về|trong|các|những|hầu hết|thực sự|để|là|có|không|website|app)\b/i.test(h) && !/^(?:Gợi ý|Phư?ơng án|Lưu ý|Mẹo|Tổng|Tham quan|Thay thế|Kết luận|Lịch trình|Ngày \d|Bữa|Buổi|Sáng|Trưa|Chiều|Tối|Giá vé|Lịch chiếu|Chọn ghế)\b/i.test(h)
const boldNames = prose => [...prose.matchAll(/\*\*([^*\n]{3,80})\*\*/g)].map(m => m[1]).filter(raw => !/[:：]\s*$/.test(raw.trim())).map(h => h.replace(/^\s*\d+[.)]\s*/, '').replace(/^\[([^\]]+)\]$/, '$1').replace(/\s*\([^)]*\)\s*$/, '').replace(/[:：,;.!?\-–—\s]+$/, '').trim()).filter(h => h && nameLike(h))
const HEDGE = /(?:chưa (?:thấy|xác nhận|có|tìm (?:thấy|được))|mình chưa|không (?:tìm )?thấy|không thể (?:cập nhật|xác nhận)|chua (?:co|tim)|no evidence|not confirmed|couldn't find|chưa được xác nhận|kiểm tra (?:trực tiếp|trên trang|trên Maps))/i

function grade(rec, dir) {
  const q = QUERIES[rec.id] ?? { unit: rec.unit, vertical: rec.vertical }
  const prose = stripMarkers(rec.prose)
  const rows = threadRows(rec, dir)
  const rowNames = [...new Set(rows.map(x => x.name ?? x.title).filter(Boolean).map(n => fold(n).trim()))]
  const rowText = rows.map(x => JSON.stringify(x)).join(' ')
  const userText = rec.thread.filter(m => m.role === 'user').map(m => m.content).join(' ')
  const priorAssistant = rec.thread.filter(m => m.role === 'assistant').slice(0, -1).map(m => m.content).join(' ')
  const evAmounts = [...amountsIn(rowText), ...amountsIn(userText), ...amountsIn(priorAssistant)]
  const evTimes = new Set([...timesIn(rowText), ...timesIn(userText), ...timesIn(priorAssistant)])
  const canned = (rec.toolCalls?.length ?? 0) === 0 && /Để chọn đúng|mình cần biết|Bạn muốn làm gì\?|Bạn ở khu nào\?/.test(rec.prose) && rec.ms < 2500
  const hedge = HEDGE.test(prose)

  const bold = boldNames(prose)
  const ungrounded = bold.filter(h => !grounded(fold(h), rowNames))
  const proseAmounts = amountsIn(prose)
  const untracedPrices = proseAmounts.filter(a => !near(a, evAmounts))
  const untracedTimes = timesIn(prose).filter(t => !evTimes.has(t))

  const placesFinal = (rec.frames8 ?? []).flat().filter(a => a?.kind === 'tappy.places.v1' && !a.preliminary)
  const cardItems = placesFinal.length ? (placesFinal[placesFinal.length - 1].items?.length ?? 0) : 0
  const hasPlacesMarker = /\[TAPPY_PLACES\]/.test(rec.prose)
  const hasShoppingMarker = /\[TAPPY_SHOPPING\]/.test(rec.prose)
  const shoppingRows = rows.filter(x => x.title && (x.price !== undefined || x.price_vnd !== undefined || x.link || x.url)).length
  const link = /\]\(https?:\/\/|\[CTA_BUTTONS\]|https?:\/\/\S+/.test(rec.prose)
  const emptyHonest = rows.length === 0 && /không tìm thấy|chưa tìm (?:thấy|được)|chưa có kết quả|không có kết quả/i.test(prose)

  const failures = []
  if (rec.status !== 200) failures.push(`http_${rec.status}`)
  if (ungrounded.length) failures.push(`fabricated_name:${ungrounded.join('|')}`)
  if (untracedPrices.length && !hedge) failures.push(`fabricated_price:${untracedPrices.join('|')}`)
  if (untracedTimes.length && !hedge) failures.push(`fabricated_time:${untracedTimes.join('|')}`)
  let unitOk = true
  if (!canned) {
    if (q.unit === 'VENUE') unitOk = cardItems > 0 || hasPlacesMarker || emptyHonest || (rec.parent && bold.length > 0 && ungrounded.length === 0)
    else if (q.unit === 'PRODUCT') unitOk = hasShoppingMarker || shoppingRows > 0 || emptyHonest
    else if (q.unit === 'SCHEDULE_TICKET') unitOk = link && (untracedPrices.length + untracedTimes.length === 0 || hedge)
    if (!unitOk) failures.push(`unit_missing:${q.unit}`)
  }
  const pick = /(?:mình chọn|mình gợi ý|nghiêng về|i'd go with|mình khuyên|lựa chọn (?:mình )?(?:nghiêng về|chính)|chọn \*\*)/i.test(prose)
  const tradeoff = /(?:nhưng|tuy|mặc dù|đánh đổi|xa hơn|rẻ hơn|đắt hơn|gần hơn|ít đánh giá|nhiều đánh giá hơn|đóng sớm|mở muộn hơn|linh hoạt hơn|but|though|trade-?off)/i.test(prose)
  const fit = /(?:vì bạn|cho \d+ người|cho nhóm|cho tiệc|cho kỷ niệm|cho gia đình|hợp (?:với )?(?:2|hai|nhóm|gia đình|cặp)|phù hợp (?:với )?(?:ngân sách|nhóm|yêu cầu|dịp)|đúng (?:ý|yêu cầu|ngân sách)|vừa (?:vặn|với) ngân sách|cho bữa|phù hợp cho|hoàn hảo cho|tiện cho|gần bạn nhất|gần nhất)/i.test(prose)
  const groundedNames = bold.length - ungrounded.length
  const mode = canned ? 'CLARIFY' : (q.unit !== 'VENUE' && q.unit !== 'SCHEDULE_TICKET') ? (pick ? 'PICKS' : 'LISTS') : (groundedNames === 0 && cardItems === 0 ? 'NO_VENUE' : pick && (tradeoff || fit) ? 'ADVISES' : pick ? 'PICKS' : 'LISTS')
  const facts = {
    price: proseAmounts.length > 0, distance: /\d+(?:[.,]\d+)?\s*(?:km|m)\b/i.test(prose), hours: timesIn(prose).length > 0,
    link, reviews: /\d[\d.,]*\s*đánh giá|\d(?:[.,]\d)?⭐/i.test(prose),
    photo: placesFinal.some(a => (a.items ?? []).some(p => p?.photo || p?.image || p?.photoUrl)),
  }
  return {
    id: rec.id, vertical: q.vertical, unit: q.unit, surface: rec.surface, status: rec.status, ttfb: rec.ttfb, ms: rec.ms,
    tools: rec.toolCalls?.map(c => c.tool) ?? [], rows: rows.length, cardItems, canned, hedge, mode,
    facts, factCount: Object.values(facts).filter(Boolean).length,
    names: { grounded: groundedNames, ungrounded }, untracedPrices, untracedTimes, link,
    pass: failures.length === 0, failures,
  }
}

const files = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
const wanted = ORDER.filter(id => files.includes(id) && (ids.length === 0 || ids.includes(id)))
const out = wanted.map(id => grade(JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8')), dir))
if (md) {
  console.log('| id | vertical | unit | tools | rows | card | mode | facts | hedge | ttfb/total ms | result |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const o of out) console.log(`| ${o.id} | ${o.vertical} | ${o.unit} | ${o.tools.join(',') || '-'} | ${o.rows} | ${o.cardItems} | ${o.mode} | ${o.factCount} | ${o.hedge ? '✓' : ''} | ${o.ttfb}/${o.ms} | ${o.pass ? 'PASS' : 'FAIL ' + o.failures.join('; ')} |`)
}
const answers = out.filter(o => !o.canned)
const by = (key) => { const m = {}; for (const o of out) { const k = o[key]; m[k] ??= { pass: 0, fail: 0 }; m[k][o.pass ? 'pass' : 'fail']++ } return m }
const modes = {}; for (const o of answers) modes[o.mode] = (modes[o.mode] ?? 0) + 1
const summary = {
  dir, turns: out.length, pass: out.filter(o => o.pass).length, fail: out.filter(o => !o.pass).map(o => `${o.id}: ${o.failures.join('; ')}`),
  byVertical: by('vertical'), byUnit: by('unit'), modes, factsAvg: +(answers.reduce((a, o) => a + o.factCount, 0) / Math.max(1, answers.length)).toFixed(2),
  fabricatedNames: out.filter(o => o.names.ungrounded.length).map(o => `${o.id}: ${o.names.ungrounded.join('|')}`),
  fabricatedPrices: out.filter(o => o.failures.some(f => f.startsWith('fabricated_price'))).map(o => o.id),
  fabricatedTimes: out.filter(o => o.failures.some(f => f.startsWith('fabricated_time'))).map(o => o.id),
  latency: { ttfbAvg: Math.round(out.reduce((a, o) => a + (o.ttfb ?? 0), 0) / Math.max(1, out.length)), totalAvg: Math.round(out.reduce((a, o) => a + (o.ms ?? 0), 0) / Math.max(1, out.length)) },
}
console.log(JSON.stringify(summary, null, asJson ? 0 : 1))
