// PHIÊN LUNA — intent check for the everyday-typing suite (owner 30/09).
// For each conversation of a realTyping replay out dir, reads the turn-2 decision the route logged
// (tappyai_consult_decision, CONSULT_DECISION_LOG=1) and compares it with the facts of the ORIGINAL sentences
// (hand-written below from docs/uat/luna-real-typing.txt, left column). Turn 1: the area (domain) and the turn type.
//   node scripts/consult/luna/intentCheck.mjs <outDir> [<outDir> …]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// area: regex on the folded known area/destination; party: number; budget: max in đồng; time: regex on folded time/date.
const EXPECT = {
  'FOOD-1': { domain: 'food', t1: 'ask', area: /\b(quan 1|q\.? ?1)\b/, party: 2, budget: 300_000, time: /toi nay/ },
  'FOOD-2': { domain: 'food', t1: 'ask', area: /\b(quan 7|q\.? ?7)\b/, party: 1, budget: 100_000 },
  'FOOD-3': { domain: 'food', t1: 'ask', area: /binh thanh/, party: 6, budget: 200_000, time: /(thu 7|thu bay|t7)/ },
  'SHOP-1': { domain: 'shopping', t1: 'ask', budget: 1_000_000 },
  'SHOP-2': { domain: 'shopping', t1: 'ask', budget: 2_000_000 },
  'SHOP-3': { domain: 'shopping', t1: 'ask', budget: 20_000_000 },
  'TRAVEL-1': { domain: 'travel', t1: 'ask', area: /da nang/, party: 2, budget: 8_000_000, time: /10\/10/ },
  'TRAVEL-2': { domain: 'travel', t1: 'ask', party: 4, budget: 5_000_000 },
  'TRAVEL-3': { domain: 'travel', t1: 'ask', area: /ha noi|hn/, party: 1, time: /15\/10/ },
  'ENT-1': { domain: 'entertainment', t1: 'ask', area: /\b(quan 1|q\.? ?1)\b/, party: 8, budget: 150_000, time: /(9h|21h|9 gio|toi nay)/ },
  'ENT-2': { domain: 'entertainment', t1: 'ask', area: /\b(quan 3|q\.? ?3)\b/, party: 2, budget: 500_000, time: /toi nay/ },
  'ENT-3': { domain: 'entertainment', t1: 'ask', area: /thu duc/, budget: 500_000, time: /(chu nhat|cn)/ },
  'SPA-1': { domain: 'spa', t1: 'ask', area: /\b(quan 1|q\.? ?1)\b/, budget: 500_000, time: /toi nay/ },
  'SPA-2': { domain: 'spa', t1: 'ask', area: /\b(quan 3|q\.? ?3)\b/, budget: 200_000, time: /chieu mai/ },
  'SPA-3': { domain: 'spa', t1: 'ask', area: /\b(quan 10|q\.? ?10)\b/, budget: 300_000, time: /(thu 7|thu bay|t7)/ },
}

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
function money(s) {
  const f = fold(s), out = []
  for (const m of f.matchAll(/(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu|cu|m)\s*(\d)?(?![a-z])/g)) {
    const mult = /^(k|nghin|ngan)$/.test(m[2]) ? 1e3 : 1e6
    out.push(Math.round((Number(m[1].replace(',', '.')) + (m[3] && mult === 1e6 ? Number(m[3]) / 10 : 0)) * mult))
  }
  for (const m of f.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{5,})/g)) out.push(Number(m[1].replace(/[.,]/g, '')))
  return out
}
const decisionOf = file => {
  if (!existsSync(file)) return null
  const j = JSON.parse(readFileSync(file, 'utf8'))
  return (j.logEvents ?? []).filter(e => e.type === 'tappyai_consult_decision').at(-1) ?? null
}

for (const dir of process.argv.slice(2)) {
  const raw = join(dir, 'raw')
  const convs = [...new Set(readdirSync(raw).map(f => f.replace(/-t\d+\.json$/, '')))].filter(c => EXPECT[c])
  let facts = 0, ok = 0, convOk = 0
  const lines = []
  for (const c of convs.sort()) {
    const e = EXPECT[c]
    const d1 = decisionOf(join(raw, `${c}-t1.json`)), d2 = decisionOf(join(raw, `${c}-t2.json`))
    const k = d2?.known ?? {}
    const areaTxt = fold([k.khu_vuc, k.diem_den, d2?.area].filter(Boolean).join(' | '))
    const timeTxt = fold([k.thoi_gian, k.ngay, k.gio, k.ngay_ve].filter(Boolean).join(' | '))
    const checks = [
      ['domain t1', d1?.domains?.includes(e.domain)],
      ['domain t2', d2?.domains?.includes(e.domain)],
      ['turn t2=pick', d2?.turn === 'pick'],
      ...(e.area ? [['area', e.area.test(areaTxt)]] : []),
      ...(e.party ? [['party', new RegExp(`\\b${e.party}\\b`).test(fold(k.so_nguoi))]] : []),
      ...(e.budget ? [['budget', money(k.ngan_sach).some(a => Math.abs(a - e.budget) <= e.budget * 0.05)]] : []),
      ...(e.time ? [['time', e.time.test(timeTxt)]] : []),
    ]
    const bad = checks.filter(([, v]) => !v).map(([n]) => n)
    facts += checks.length; ok += checks.length - bad.length; if (!bad.length) convOk++
    lines.push(`${c.padEnd(9)} ${bad.length ? 'MISS ' + bad.join(', ') : 'ok'}   [by ${d2?.by ?? '-'}; known ${JSON.stringify(k)}${d2?.area ? `; area ${d2.area}` : ''}]`)
  }
  console.log(`\n## ${dir}\nfacts ${ok}/${facts} (${(100 * ok / (facts || 1)).toFixed(0)}%) · conversations fully right ${convOk}/${convs.length}`)
  console.log(lines.join('\n'))
}
