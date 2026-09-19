// DIFFERENTIATION METRIC (owner FINAL JOB 2.2) — from an eval run dir, 0 extra runs.
// usage: node diffmetric.mjs <runDir> [ids...] [--md]
// Per answer: venues named in the prose that exist in the fetched rows (grounded) and any that do
// not (fabrication — must be zero); verifiable realtime facts used (price band, distance/area,
// opening hours, booking/CTA link, review evidence, photo on the card); ADVISES (a stated pick +
// a fit-to-constraint or a trade-off) vs LISTS. Names are matched the way the grounding gate does
// (folded, substring both ways, venue-type prefix stripped).
import { readFileSync, readdirSync } from 'node:fs'
const args = process.argv.slice(2)
const md = args.includes('--md')
const [dir, ...ids] = args.filter(a => !a.startsWith('--'))
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const TYPE_PREFIX = /^(?:nha hang|quan an|quan|tiem|cafe|ca phe|coffee|restaurant|bar|pub|club|spa|salon|khach san|hotel|resort|homestay|the)\s+/
const strip = n => { const s = n.replace(TYPE_PREFIX, '').trim(); return s.length >= 3 ? s : n }
const grounded = (h, known) => { const hh = strip(h); return known.some(k => { const kk = strip(k); return k.includes(h) || h.includes(k) || kk.includes(hh) || hh.includes(kk) }) }
const ORDER = ['F1','F2','F3','F4','F5','F6','F7','F7b','F8','S1','S2','S3','S4','S5','S5b','S6','S6b','S7','S8','T1','T2','T3','T4','T5','T5b','T6','T7','T8','P1','P2','P3','P4','P5','P5b','P6','P7','P7b','P8','E1','E2','E2b','E3','E4','E5','E5b','E6','E7','E8']
const files = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).filter(id => ids.length === 0 || ids.includes(id))
const out = []
for (const id of ORDER.filter(i => files.includes(i))) {
  const r = JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'))
  const prose = r.prose.replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, ' ').replace(/\[TAPPY_SHOPPING\][\s\S]*?\[\/TAPPY_SHOPPING\]/g, ' ').replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/g, ' ').replace(/\[FOLLOWUPS\][^\n]*/g, ' ')
  const rowNames = []
  const collect = (rec) => { for (const t of rec?.toolResults ?? []) for (const key of ['results', 'hotel_list', 'shopping_results', 'search_results']) for (const x of (t?.[key] ?? [])) { const n = x?.name ?? x?.title; if (n) rowNames.push(n) } }
  collect(r)
  // A follow-up ("quán này mở mấy giờ?") is grounded in the PARENT turn's rows.
  if (r.parent) { try { collect(JSON.parse(readFileSync(`${dir}/${r.parent}.json`, 'utf8'))) } catch { /* parent not in this dir */ } }
  const known = [...new Set(rowNames.map(n => fold(n).trim()))].filter(Boolean)
  const canned = (r.toolCalls?.length ?? 0) === 0 && /Để chọn đúng|mình cần biết/.test(r.prose) && r.ms < 2000
  // A bold span is a NAME candidate when it reads like one: no label colon, no rating / phone /
  // amount, at most 7 words, and not a clause (function words such as "bạn nên", "về", "trong").
  const nameLike = h => h.split(/\s+/).length <= 7 && !/\d{3,}|⭐|đánh giá|reviews?|^\d|₫|VND|\bk\b/i.test(h) && !/\b(?:bạn|nên|về|trong|các|những|hầu hết|thực sự|để|là|có|không)\b/i.test(h)
  const bold = [...prose.matchAll(/\*\*([^*\n]{3,80})\*\*/g)].map(m => m[1]).filter(raw => !/[:：]\s*$/.test(raw.trim())).map(h => h.replace(/^\s*\d+[.)]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/[:：,;.!?\-–—\s]+$/, '').trim()).filter(h => h && nameLike(h))
  const namedGrounded = new Set(), namedUngrounded = new Set()
  for (const h of bold) (grounded(fold(h), known) ? namedGrounded : namedUngrounded).add(h)
  // plain (un-bolded) mentions of a row name count as grounded too
  const f = fold(prose)
  for (const n of known) if (n.length >= 6 && f.includes(n)) namedGrounded.add(n)
  const facts = {
    price: /\d[\d.,]*\s*(?:k|₫|đ|vnd|nghìn|triệu|tr)\b|\d+\s*-\s*\d+\s*(?:k|N ₫)/i.test(prose) || /mức giá|tầm giá|giá khoảng/i.test(prose),
    distance: /\d+(?:[.,]\d+)?\s*(?:km|m)\b/i.test(prose) || /cách bạn|gần bạn|Quận \d|Q\.?\d/i.test(prose),
    hours: /\d{1,2}[:h]\d{2}|\d{1,2}h\b|mở (?:đến|từ|cửa)|đóng cửa/i.test(prose),
    link: /\[CTA_BUTTONS\]|\]\(https?:\/\//.test(r.prose),
    reviews: /\d[\d.,]*\s*đánh giá|\d(?:[.,]\d)?⭐/i.test(prose),
    photo: (r.frames8Raw ?? []).some(fr => (Array.isArray(fr) ? fr : [fr]).some(x => (x?.places ?? x?.view?.places ?? x?.items ?? []).some?.(p => p?.image))),
  }
  const factCount = Object.values(facts).filter(Boolean).length
  const pick = /(?:mình chọn|mình gợi ý|nghiêng về|i'd go with|mình khuyên|lựa chọn (?:mình )?(?:nghiêng về|chính)|chọn \*\*)/i.test(prose)
  const tradeoff = /(?:nhưng|tuy|mặc dù|đánh đổi|xa hơn|rẻ hơn|đắt hơn|gần hơn|ít đánh giá|nhiều đánh giá hơn|đóng sớm|mở muộn hơn|linh hoạt hơn|but|though|trade-?off)/i.test(prose)
  const fit = /(?:vì bạn|cho \d+ người|cho nhóm|cho tiệc|cho kỷ niệm|cho gia đình|hợp (?:với )?(?:2|hai|nhóm|gia đình|cặp)|phù hợp (?:với )?(?:ngân sách|nhóm|yêu cầu|dịp)|đúng (?:ý|yêu cầu|ngân sách)|vừa (?:vặn|với) ngân sách|cho bữa|phù hợp cho|hoàn hảo cho|tiện cho)/i.test(prose)
  const hedge = /(?:chưa (?:thấy|xác nhận|có)|mình chưa|không (?:tìm )?thấy|no evidence)/i.test(prose)
  const mode = canned ? 'CLARIFY' : (namedGrounded.size === 0 ? 'NO_VENUE' : pick && (tradeoff || fit) ? 'ADVISES' : pick ? 'PICKS' : 'LISTS')
  out.push({ id, canned, tools: r.toolCalls?.map(c => c.tool) ?? [], rows: known.length, grounded: [...namedGrounded].length, ungrounded: [...namedUngrounded], facts, factCount, pick, tradeoff, fit, hedge, mode })
}
if (md) {
  console.log('| id | rows | venues named (grounded) | ungrounded | price | dist | hours | link | reviews | photo | facts | mode |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const o of out) console.log(`| ${o.id} | ${o.rows} | ${o.grounded} | ${o.ungrounded.length ? o.ungrounded.join('; ') : '0'} | ${o.facts.price ? '✓' : ''} | ${o.facts.distance ? '✓' : ''} | ${o.facts.hours ? '✓' : ''} | ${o.facts.link ? '✓' : ''} | ${o.facts.reviews ? '✓' : ''} | ${o.facts.photo ? '✓' : ''} | ${o.factCount} | ${o.mode} |`)
}
const answers = out.filter(o => !o.canned)
const dist = {}
for (const o of answers) dist[o.mode] = (dist[o.mode] ?? 0) + 1
const factHist = {}
for (const o of answers) factHist[o.factCount] = (factHist[o.factCount] ?? 0) + 1
console.log(JSON.stringify({
  dir, answers: answers.length, clarifyTurns: out.length - answers.length,
  fabricationsTotal: answers.reduce((a, o) => a + o.ungrounded.length, 0),
  answersWithFabrication: answers.filter(o => o.ungrounded.length > 0).map(o => o.id),
  groundedVenuesAvg: +(answers.reduce((a, o) => a + o.grounded, 0) / Math.max(1, answers.length)).toFixed(2),
  factsAvg: +(answers.reduce((a, o) => a + o.factCount, 0) / Math.max(1, answers.length)).toFixed(2),
  factHistogram: factHist, modeDistribution: dist,
  factShare: Object.fromEntries(['price', 'distance', 'hours', 'link', 'reviews', 'photo'].map(k => [k, +(answers.filter(o => o.facts[k]).length / Math.max(1, answers.length)).toFixed(2)])),
}, null, 1))
