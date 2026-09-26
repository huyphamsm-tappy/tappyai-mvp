/**
 * Phase 7 Session C — golden-set scorer. Reads two run directories under docs/uat/evidence/golden
 * and prints, per case, the deterministic checks that can be read off the recorded stream:
 * duplication, cards, orphan images, plan block, transport question, constraint honouring,
 * scam-shield pointer, numeric thresholds, refusal. Model-quality judgements the checks cannot
 * make are left to the reviewer (see the report). Usage: node scripts/audit/goldenCompare.mjs baseline final
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [a = 'baseline', b = 'final'] = process.argv.slice(2)
const load = label => Object.fromEntries(readdirSync(join('docs/uat/evidence/golden', label)).filter(f => f.endsWith('.json') && f !== 'summary.json').map(f => [f.replace('.json', ''), JSON.parse(readFileSync(join('docs/uat/evidence/golden', label, f), 'utf8'))]))
const A = load(a), B = load(b)

const plan = t => { const m = t.text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/); if (!m) return null; try { return JSON.parse(m[1]) } catch { return 'invalid' } }
/** Calendar days in a plan: "Ngày 1 - Sáng", "Ngày 1 - Tối", "Ngày 2" are TWO days. */
const planDays = p => p && p !== 'invalid' && Array.isArray(p.days) ? new Set(p.days.map(d => (String(d.label ?? '').match(/ngày\s*(\d+)|day\s*(\d+)/i) ?? [, d.label])[1] ?? d.label)).size : 0
const checks = {
  T1: turns => ({
    'no duplicate': turns.every(t => !t.duplicate),
    'no orphan image (no ![ in prose)': turns.every(t => !/!\[/.test(t.text)),
    'no GrabFood for Đà Nẵng': turns.every(t => !/grab\.com|befood|be\.com/i.test(t.text)),
    'cards every turn': turns.every(t => t.cardItems.length > 0),
    'never asks máy bay hay xe khách': turns.every(t => !/máy bay hay xe/i.test(t.visible)),
    't2 reads 2 ngày 1 đêm': /2 ngày 1 đêm/.test(turns[1]?.visible ?? ''),
    'plan block by t2 and t3': [1, 2].every(i => plan(turns[i]) && plan(turns[i]) !== 'invalid'),
    't2 plan has 2 days': planDays(plan(turns[1])) === 2,
    't2 budget_total = 20 triệu': /20\.000\.000|20 triệu/.test(String(plan(turns[1])?.budget_total ?? '')),
  }),
  T2: turns => ({
    'cards both turns': turns.every(t => t.cardItems.length > 0),
    'no "sàn/sảnh IMAX" wording': turns.every(t => !/s[àả]n(h)?( chiếu)? IMAX/i.test(t.visible)),
    'IMAX honesty line present when IMAX claimed': turns.every(t => !/IMAX/.test(t.visible) || /chưa xác nhận|không có rạp IMAX|xác nhận.{0,60}website|gọi trực tiếp/i.test(t.visible)),
  }),
  T3: turns => ({
    't2 cards drop nhà hàng / over-budget rows': !(turns[1]?.cardItems[0] ?? []).some(n => /nhà hàng|restaurant|Quán Bụi/i.test(n)),
    't2 model pick is in the cards': (() => { const it = turns[1]?.annotations.filter(x => x.items).pop(); return !!it && it.items.some(i => i.recommended) })(),
    't2 prose names the pick': (() => { const it = turns[1]?.annotations.filter(x => x.items).pop(); const rec = it?.items.find(i => i.recommended)?.name ?? ''; const head = rec.split(/[-|(]/)[0].trim().slice(0, 18); return !!rec && turns[1].visible.includes(head) })(),
    'no duplicate': turns.every(t => !t.duplicate),
  }),
  T4: turns => ({
    't2 risk-first (ownership/lock/fraud in first 500 chars)': /rủi ro|lừa đảo|khóa|sở hữu|giấy tờ|chuyển tiền/i.test((turns[1]?.visible ?? '').slice(0, 500)),
    't2 points to Cảnh báo lừa đảo': /Cảnh báo lừa đảo/i.test(turns[1]?.visible ?? ''),
    't2 no invented % / star thresholds': !/[≥>]\s*\d+\s*(%|⭐|sao)|chênh.{0,10}\d+%|trên \d+%|\d+-\d+ tháng/i.test(turns[1]?.visible ?? ''),
    't2 not cosmetic-first': !/^[\s\S]{0,300}(màn hình|vết xước|ngoại hình)/i.test((turns[1]?.visible ?? '').slice(0, 300)),
  }),
  G1a: turns => ({
    'cards': turns[0].cardItems.length > 0,
    'plan block': !!plan(turns[0]) && plan(turns[0]) !== 'invalid',
    'at most one question': ((turns[0].visible.match(/\?/g) ?? []).length) <= 1,
    'no transport/lodging-type question': !/máy bay hay xe|khách sạn hay homestay|1 đêm hay 2 đêm/i.test(turns[0].visible),
  }),
  G1b: turns => ({
    'cards': turns[0].cardItems.length > 0,
    'first card is a cinema (not a mall/karaoke)': /cinema|rạp|cgv|lotte cinema|galaxy|bhd|cinestar/i.test((turns[0].cardItems[0] ?? [])[0] ?? '') && !/mart|co\.op|karaoke|kidzooona/i.test((turns[0].cardItems[0] ?? [])[0] ?? ''),
  }),
  G3a: turns => ({
    'cards': turns[0].cardItems.length > 0,
    // A band whose LOWER bound is above 50k cannot fit; "1-100.000 ₫" (open below) can. Baseline
    // prices were recorded as null (wrong summariser keys), so the baseline column is uninformative.
    'no band starting above 50k in cards': (() => {
      const it = turns[0].annotations.filter(x => x.items).pop()
      const lo = p => { const m = String(p).match(/^(\d[\d.]*)\s*[-–]\s*(\d[\d.]*)\s*(N|Tr)?/i); if (!m) return 0; const n = Number(m[1].replace(/\./g, '')); return n <= 1 ? 0 : n * ((m[3] ?? '').toUpperCase() === 'N' ? 1000 : (m[3] ?? '').toUpperCase() === 'TR' ? 1e6 : 1) }
      return !!it && it.items.every(i => !i.price || lo(i.price) <= 50000)
    })(),
    'closed rows not first': (() => { const it = turns[0].annotations.filter(x => x.items).pop(); return !!it && it.items[0]?.open !== false })(),
    'prose names the pick': (() => { const it = turns[0].annotations.filter(x => x.items).pop(); const rec = it?.items.find(i => i.recommended)?.name ?? ''; const head = rec.split(/[-|(]/)[0].trim().slice(0, 12); return !!rec && turns[0].visible.includes(head) })(),
  }),
  G3b: turns => ({
    'cards both turns': turns.every(t => t.cardItems.length > 0),
    't2 no nhậu/bia/bar rows': !(turns[1]?.cardItems[0] ?? []).some(n => /nhậu|bia|beer|bar|pub|club/i.test(n)),
    't2 acknowledges the change': /gia đình|không nhậu|đổi/i.test(turns[1]?.visible ?? ''),
  }),
  G4a: turns => ({
    'plan block': !!plan(turns[0]) && plan(turns[0]) !== 'invalid',
    'tools ran': turns[0].tools.length > 0,
    'states assumptions (2 người / 2 ngày 1 đêm / xe)': /giả định|theo thói quen|mặc định|mình tính|điều chỉnh nếu/i.test(turns[0].visible),
    'at most one question': ((turns[0].visible.match(/\?/g) ?? []).length) <= 1,
    'plan has 2 days': planDays(plan(turns[0])) === 2,
  }),
}
for (const id of ['G5a', 'G5b', 'G5c', 'G5d']) checks[id] = turns => ({
  'answered (not refused as out of scope)': !/ngoài phạm vi|chỉ hỗ trợ|không hỗ trợ/i.test(turns[0].visible) && turns[0].visible.length > 400,
  'risk-first in the first 500 chars': /rủi ro|lừa đảo|khóa|sở hữu|giấy tờ|chuyển tiền|cọc/i.test(turns[0].visible.slice(0, 500)),
  'points to Cảnh báo lừa đảo': /Cảnh báo lừa đảo|Canh bao lua dao/i.test(turns[0].visible),
  'no invented % / star thresholds': !/[≥>]\s*\d+\s*(%|⭐|sao)|chênh.{0,10}\d+%|trên \d+%|dưới \d+%|\d+-\d+ tháng/i.test(turns[0].visible),
  'list shape kept (no flattened headers)': !/\S \*\*[^*]+:\*\*/.test(turns[0].visible),
})

let totalA = 0, totalB = 0, passA = 0, passB = 0, worse = []
for (const id of Object.keys(checks)) {
  const ra = A[id] ? checks[id](A[id].turns) : {}, rb = B[id] ? checks[id](B[id].turns) : {}
  console.log(`\n${id} — ${A[id]?.turns.length ?? '?'} turn(s)`)
  for (const k of Object.keys(rb)) {
    const va = ra[k], vb = rb[k]
    totalA++; totalB++; if (va) passA++; if (vb) passB++
    if (va && !vb) worse.push(`${id}: ${k}`)
    console.log(`  ${va ? 'PASS' : 'FAIL'} → ${vb ? 'PASS' : 'FAIL'}  ${k}`)
  }
}
console.log(`\nTOTAL ${a}: ${passA}/${totalA}  ${b}: ${passB}/${totalB}`)
console.log(`WORSE: ${worse.length ? worse.join('; ') : 'none'}`)
