// Decision Quality — every rule added for the four production gaps on 4c47753
// must have a mutation that DIES.
//
// Single-line anchors only: this tree's line endings are not uniform, and a
// multi-line "\n" anchor silently matches nothing and reports a false pass.
// Every anchor is uniqueness-checked before it is applied — an anchor found 0x
// or 2x is SKIPPED loudly rather than counted, because "SURVIVED" from a bad
// anchor is the failure mode that makes a whole mutation run meaningless.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/wtdq'
const PICK = ROOT + '/src/lib/ai/consultative/pick.ts'
const CLAIM = ROOT + '/src/lib/ai/consultative/claimScope.ts'
const SPEC = 'src/lib/ai/consultative/decisionQuality.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = { [PICK]: readFileSync(PICK, 'utf8'), [CLAIM]: readFileSync(CLAIM, 'utf8') }

const M = [
  // ── 1. market-scope rule ──────────────────────────────────────────────────
  { f: PICK, n: 'M01 delete the market-scope rule heading from the rulebook',
    from: 'PHAM VI CUA MOI SO SANH — TUYET DOI KHONG NOI "NHAT THI TRUONG":', to: '' },
  { f: PICK, n: 'M02 delete the forbidden market-wide examples',
    from: '- CAM: "re nhat tren thi truong", "gia tot nhat thi truong", "re nhat hien nay", "khong dau re hon",', to: '' },
  { f: CLAIM, n: 'M03 stop treating an explicit market mention as unscoped',
    from: '    if (MARKET.test(s)) return true', to: '' },
  { f: CLAIM, n: 'M04 let an unqualified superlative pass (a bare "Giá tốt nhất" heading)',
    from: '    if (!SCOPED.test(s)) return true', to: '' },
  { f: CLAIM, n: 'M05 judge the whole reply instead of per sentence (laundering)',
    from: '  for (const s of sentences(normalizeVN(text.toLowerCase()))) {',
    to: '  for (const s of [normalizeVN(text.toLowerCase())]) {' },

  // ── 2. recommendation requirement (B-2) ───────────────────────────────────
  { f: PICK, n: 'M06 revert B-2: a request to choose no longer counts as a decidable need',
    from: "    || signals?.explicitChoiceRequest === true", to: '' },
  { f: PICK, n: 'M07 delete the "choose on the first turn" rule from the rulebook',
    from: 'KHI USER DA NHO BAN CHON, PHAI CHON NGAY O CAU TRA LOI DAU TIEN:', to: '' },
  { f: PICK, n: 'M08 make the choice detector match nothing',
    from: '  return CHOICE_REQUEST.test(normalizeVN(text.toLowerCase()))', to: '  return false' },
  { f: PICK, n: 'M09 make the choice detector match everything (fires on "mình đã chọn xong rồi")',
    from: '  if (!text) return false', to: '  if (!text) return false\n  if (text) return true' },

  // ── 3. rejected-option requirement ────────────────────────────────────────
  { f: PICK, n: 'M10 delete the rejected-alternatives rule',
    from: '- CAC LUA CHON KHONG CHON: neu trong danh sach con phuong an DANG KE khac (gia thap hon ro ret,', to: '' },
  { f: PICK, n: 'M11 delete the reason-and-trade-off requirement',
    from: 'DE XUAT PHAI KEM LY DO VA DANH DOI:', to: '' },
  { f: PICK, n: 'M12 stop carrying the runner-up in the Pick payload',
    from: '      not_chosen: pick.runnerUp.candidate.name,', to: '' },

  // ── 4. configuration-equivalence safeguard ────────────────────────────────
  { f: PICK, n: 'M13 delete the configuration-equivalence rule',
    from: 'KHONG KHANG DINH HAI TIN DANG CUNG CAU HINH NEU BANG CHUNG KHONG NOI THE:', to: '' },
  { f: CLAIM, n: 'M14 treat M1 and M1 Pro as the same chip',
    from: '  const m = title.match(/\\bm(\\d)\\s*(pro max|max|pro|ultra)\\b/) || title.match(/\\bm(\\d)\\b/)',
    to: '  const m = title.match(/\\bm(\\d)\\b/)' },
  { f: CLAIM, n: 'M15 let an unstated condition count as a match',
    from: '  if (!dx || !dy || dx !== dy) return false', to: '  if (dx && dy && dx !== dy) return false' },
  { f: CLAIM, n: 'M16 stop detecting the equivalence claim at all',
    from: '  return EQUIVALENCE.test(normalizeVN(text.toLowerCase()))', to: '  return false' },
  { f: CLAIM, n: 'M17 ignore capacity when comparing configurations',
    from: "  if (kx.length === 0 || kx.join(',') !== ky.join(',')) return false", to: '' },
]

let killed = 0, skipped = 0
try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`); continue }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, o)
    if (failed) killed++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) {
    console.log(`restored ${f.split('/').pop().padEnd(16)} ${hash(readFileSync(f, 'utf8')) === hash(s) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
