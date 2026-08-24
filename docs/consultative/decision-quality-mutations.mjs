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

  // ── 5. condition / provenance safeguard (follow-up defect, 6b4e9b2) ───────
  { f: PICK, n: 'M18 delete the condition/provenance rule heading',
    from: 'TINH TRANG / NGUON GOC LA THUOC TINH RIENG CUA TUNG TIN DANG:', to: '' },
  { f: PICK, n: 'M19 delete the evidence-boundary wording (shop, domain, price, brand)',
    from: '- KHONG suy ra tinh trang tu: ten shop, ten mien, uy tin nguoi ban, gia, ten chip, thuong hieu, hay ngu canh xung quanh.', to: '' },
  { f: PICK, n: 'M20 delete the no-transfer-between-listings wording',
    from: '- KHONG chuyen tinh trang tu dong nay sang dong khac: mot dong ghi "Chinh Hang" KHONG lam nhung dong con lai chinh hang.', to: '' },
  { f: PICK, n: 'M21 delete the ban on collective phrasing ("cac lua chon chinh hang")',
    from: '- CAM cach noi gop nhu "cac lua chon chinh hang", "ca hai deu chinh hang" khi khong phai MOI dong deu ghi ro.', to: '' },
  { f: CLAIM, n: 'M22 weaken the rule: an unsupported condition no longer violates',
    from: '        if (!rows.some(r => term.re.test(r.title))) return true', to: '' },
  { f: CLAIM, n: 'M23 allow cross-listing transfer (a subject row need not state it)',
    from: '      if (subjects.some(r => !term.re.test(r.title))) return true', to: '' },
  { f: CLAIM, n: 'M24 stop treating collective phrasing as a claim about every row',
    from: '      const subjects = named.length > 0 ? named : COLLECTIVE.test(s) ? rows : null',
    to: '      const subjects = named.length > 0 ? named : null' },
  { f: CLAIM, n: 'M25 stop pinning a claim to the shop it names',
    from: '      const subjects = named.length > 0 ? named : COLLECTIVE.test(s) ? rows : null',
    to: '      const subjects = COLLECTIVE.test(s) ? rows : null' },
  { f: CLAIM, n: 'M26 drop "chinh hang" from the protected vocabulary',
    from: "  { key: 'chinh hang', re: /\\bchinh hang\\b/ },", to: '' },
  { f: CLAIM, n: 'M27 drop "likenew" from the protected vocabulary',
    from: "  { key: 'likenew', re: /\\b(likenew|like new)\\b/ },", to: '' },
  { f: CLAIM, n: 'M28 drop "cu" from the protected vocabulary',
    from: "  { key: 'cu', re: /\\bcu\\b(?!\\s+the\\b)/ },", to: '' },
  { f: CLAIM, n: 'M29 drop "sealed" from the protected vocabulary',
    from: "  { key: 'sealed', re: /\\b(sealed|nguyen seal)\\b/ },", to: '' },
  { f: CLAIM, n: 'M30 drop "refurb" from the protected vocabulary',
    from: "  { key: 'refurb', re: /\\brefurb(ished)?\\b/ },", to: '' },
  { f: CLAIM, n: 'M31 judge the whole reply instead of per sentence (laundering)',
    from: '  const claims = sentences(normalizeVN(text.toLowerCase()))',
    to: '  const claims = [normalizeVN(text.toLowerCase())]' },
  { f: CLAIM, n: 'M32 treat a refusal to claim ("tieu de khong ghi") as a claim',
    from: '    if (NOT_ASSERTED.test(s)) continue', to: '' },
  { f: CLAIM, n: 'M33 let "cu the" (cụ thể) count as a condition claim',
    from: "  { key: 'cu', re: /\\bcu\\b(?!\\s+the\\b)/ },", to: "  { key: 'cu', re: /\\bcu\\b/ }," },
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
