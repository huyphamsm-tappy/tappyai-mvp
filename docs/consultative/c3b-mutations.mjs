// C3-B mutation harness. Each entry breaks ONE clause of the contract in the real
// source, runs the contract suite, and restores the file byte-for-byte. A mutation
// that SURVIVES means the test asserting that clause is decorative.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Run from the repo root:  node docs/consultative/c3b-mutations.mjs
const ROOT = process.cwd()
const PB = `${ROOT}/src/lib/ai/promptBuilder.ts`
const TRAVEL = `${ROOT}/src/lib/ai/tools/travel.ts`

const MUTATIONS = [
  ['M1 option narrowing removed', PB,
    'dua 2-4 lua chon phu hop nhat', 'dua cac lua chon phu hop'],
  ['M2 grounded reasoning removed', PB,
    '(c) LY DO:', '(c) GHI CHU:'],
  ['M3 trade-off removed', PB,
    '(d) DANH DOI:', '(d) THEM:'],
  ['M4 calibrated pick removed', PB,
    '(e) NGHIENG VE:', '(e) KET:'],
  ['M5 differentiation removed', PB,
    '(b) KHAC BIET:', '(b) LUA CHON:'],
  ['M6 lookup exemption removed', PB,
    '(g) KHONG ap dung', '(g) Luu y'],
  ['M7 anti-fabrication removed', PB,
    'TUYET DOI KHONG bia diem tru chi de cho du form', 'neu can thi neu mot diem tru'],
  ['M8 symmetric comparison removed', PB,
    'CAN XUNG: danh luong noi dung tuong duong', 'GHI CHU: danh luong noi dung tuong duong'],
  ['M9 comparison trade-off removed', PB,
    'DANH DOI: neu ro moi ben manh gi', 'LUU Y: neu ro moi ben manh gi'],
  ['M10 comparison pick removed', PB,
    'NGHIENG VE: ket lai bang mot cau', 'KET LUAN: ket lai bang mot cau'],
  ['M11 general tech advice re-allowed', PB,
    'tu van cong nghe chung hoac giai thich cong nghe', 'giai thich cong nghe'],
  ['M12 product comparison dropped from scope', PB,
    'so sanh san pham, va chon giua cac san pham', 'va tim san pham'],
  ['M13 weather re-added as out of scope', PB,
    '(vi du: toan hoc, lap trinh', '(vi du: thoi tiet, toan hoc, lap trinh'],
  ['M14 R8 re-appended instead of consolidated', PB,
    '\nNGUYEN TAC BAT BUOC:',
    '\nR8: GIAI THICH LY DO GOI Y - moi option kem mot ly do ngan.\nNGUYEN TAC BAT BUOC:'],
  ['M15 stage block moved into the cached segment', PB,
    'const shared = `${SYSTEM_BASE}', 'const shared = `${stageBlock}${SYSTEM_BASE}'],
  ['M16 _debug_budget restored to the hotel payload', TRAVEL,
    '        search_results: searchResults,', "        _debug_budget: 'detected',\n        search_results: searchResults,"],
  ['M17 tech-advice bound dropped from the shopping expansion', PB,
    'khong phai tu van cong nghe chung', 'day la ho tro quyet dinh mua'],
]

const originals = new Map()
for (const [, file] of MUTATIONS) if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'))

let survived = 0
for (const [name, file, from, to] of MUTATIONS) {
  const src = originals.get(file)
  if (!src.includes(from)) { console.log(`SKIP  ${name} — anchor not found: ${from.slice(0, 40)}`); survived++; continue }
  writeFileSync(file, src.replace(from, to))
  let red = false
  try {
    execSync('npx vitest run src/lib/ai/recommendationContract.test.ts --reporter=dot', { cwd: ROOT, stdio: 'pipe' })
  } catch { red = true }
  writeFileSync(file, src)
  if (!red) survived++
  console.log(`${red ? 'RED   ' : 'SURVIVED '}${name}`)
}

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations killed`)
process.exit(survived === 0 ? 0 : 1)
