import { readFileSync } from 'node:fs'
const rows = JSON.parse(readFileSync('c3b4-step1.json', 'utf8'))
const prose = (s) => s.split('[CTA_BUTTONS]')[0].split('[FOLLOWUPS]')[0].replace(/!\[[^\]]*\]\([^)]*\)/g, '')

// "22.99 million" is ambiguous: "." may be a decimal point (22.99 → 22,990,000)
// or a thousands separator (2299 → 2,299,000,000). Test BOTH readings and accept
// if either appears in the evidence. Earlier passes got this wrong twice.
function candidates(numStr, unit) {
  const u = unit.toLowerCase()
  const asDecimal = parseFloat(numStr.replace(/,/g, ''))                 // 22.99
  const asThousands = parseFloat(numStr.replace(/[.,]/g, ''))            // 2299
  const mult = /triệu|tr|million/.test(u) ? 1e6 : /k$/.test(u) ? 1e3 : 1
  const out = new Set()
  for (const base of [asDecimal, asThousands]) {
    if (!isNaN(base)) out.add(String(Math.round(base * mult)))
  }
  if (mult === 1) out.add(numStr.replace(/\D/g, ''))
  return [...out].filter(s => s.length >= 6)     // ignore figures too short to be distinctive
}

const MONEY = /(\d[\d.,]*)\s*(triệu|tr\b|million|₫|đ\b|vnd|vnđ|k\b)/gi
let grounded = 0, fabricated = 0
for (const r of rows.filter(x => x.searchProductsCalls > 0)) {
  const evDigits = r.evidence.map(e => `${e.title} ${e.snippet}`).join(' ').replace(/\D/g, '')
  const claims = [...new Set([...prose(r.text).matchAll(MONEY)].map(m => JSON.stringify([m[0].trim(), m[1], m[2]])))].map(JSON.parse)
  if (!claims.length) continue
  console.log(`--- ${r.id}#${r.rep}`)
  for (const [claim, num, unit] of claims) {
    const cands = candidates(num, unit)
    if (!cands.length) { console.log(`    (skipped, not distinctive) "${claim}"`); continue }
    const ok = cands.some(c => evDigits.includes(c))
    ok ? grounded++ : fabricated++
    console.log(`    ${ok ? 'GROUNDED     ' : '⚠ NOT IN EVIDENCE'}  "${claim}"   tried ${JSON.stringify(cands)}`)
  }
}
console.log(`\ndistinctive money claims: ${grounded} grounded, ${fabricated} NOT in evidence`)
