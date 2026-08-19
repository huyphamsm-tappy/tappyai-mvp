// C3-B.3 mutation testing. Every mutation must be KILLED. A survivor means the
// contract asserts nothing about that behaviour.
//
// Anchors are single-line substrings on purpose: the working tree is CRLF, and a
// multi-line "\n" anchor silently matches nothing — an inert mutation that
// reports a false pass. Uniqueness is checked before each run.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const PB = ROOT + '/src/lib/ai/promptBuilder.ts'
const IN = ROOT + '/src/lib/ai/intent.ts'
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

const originals = { [PB]: readFileSync(PB, 'utf8'), [IN]: readFileSync(IN, 'utf8') }
const EOL = originals[PB].includes('\r\n') ? '\r\n' : '\n'
const L = (...l) => l.join(EOL)

const M = [
  // ── C3-B.3 scope change ───────────────────────────────────────────────────
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S1  re-add the removed prohibition to the refusal list',
    from: 'tin tuc thoi su quoc te, cach lam gi do', to: 'tin tuc thoi su quoc te, tu van cong nghe chung, cach lam gi do' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S2  drop the purchase-decision bound from the permission',
    from: ' — day la ho tro quyet dinh MUA, khong phai tu van cong nghe chung.', to: '.' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S3  drop "khong phai tu van cong nghe chung" only',
    from: ', khong phai tu van cong nghe chung.', to: '.' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S4  drop product COMPARISON from the shopping permission',
    from: 'so sanh san pham, va chon giua cac san pham', to: 'va chon giua cac san pham' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S5  drop product SELECTION from the shopping permission',
    from: 'so sanh san pham, va chon giua cac san pham', to: 'so sanh san pham' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S6  open the scope: drop "lap trinh" from the refusal list',
    from: 'toan hoc, lap trinh, y te', to: 'toan hoc, y te' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S7  delete the hard refusal line',
    from: 'TUYET DOI KHONG tra loi cac cau hoi ngoai pham vi', to: 'Co the tra loi cac cau hoi ngoai pham vi' },
  { f: PB, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'S8  move the shopping permission into the CACHED segment boundary check',
    from: L('  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}`'),
    to: L('  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}${stageBlock}`') },
  // ── C3-B.2 locationIntent fix (must stay guarded) ─────────────────────────
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L1  drop the purchase exemption',
    from: "if (weakWhereRe.test(t) && !purchaseRe.test(t)) return 'offline'", to: "if (weakWhereRe.test(t)) return 'offline'" },
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L2  weak "where" outranks an explicit marketplace',
    from: L("  if (offlineRe.test(t)) return 'offline'", "  if (onlineRe.test(t)) return 'online'"),
    to: L("  if (offlineRe.test(t)) return 'offline'", "  if (weakWhereRe.test(t) && !purchaseRe.test(t)) return 'offline'", "  if (onlineRe.test(t)) return 'online'") },
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L3  put "o dau" back into the hard offline set',
    from: '\\bkhu\\s+vuc\\b|\\bcua\\s*hang\\b', to: '\\bkhu\\s+vuc\\b|\\bo\\s+dau\\b|\\bcua\\s*hang\\b' },
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L4  delete the weak "where" reading entirely',
    from: L("  if (weakWhereRe.test(t) && !purchaseRe.test(t)) return 'offline'", "  return 'unknown'"), to: "  return 'unknown'" },
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L5  drop \\bmua\\b from the purchase markers',
    from: 'const purchaseRe = /\\bmua\\b|\\bco ban\\b|san pham', to: 'const purchaseRe = /\\bco ban\\b|san pham' },
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L6  drop "co ban" from the purchase markers',
    from: 'const purchaseRe = /\\bmua\\b|\\bco ban\\b|san pham', to: 'const purchaseRe = /\\bmua\\b|san pham' },
  { f: IN, spec: 'src/lib/ai/locationIntent.test.ts', n: 'L7  drop "cho nao" from the weak "where" markers',
    from: 'const weakWhereRe = /\\bo\\s+dau\\b|\\bcho\\s+nao\\b/', to: 'const weakWhereRe = /\\bo\\s+dau\\b/' },
  // ── the "no new model call" guard must itself be guarded ──────────────────
  { f: IN, spec: 'src/lib/ai/recommendationContract.test.ts', n: 'A1  make intent.ts reach for a model',
    from: "export function detectLocationIntent", to: "import '@/lib/ai/llm'\nexport function detectLocationIntent" },
]

let killed = 0, skipped = 0
try {
  for (const m of M) {
    const orig = originals[m.f]
    const n = orig.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}  — anchor found ${n}x, FIX THE ANCHOR`); continue }
    writeFileSync(m.f, orig.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${m.spec}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, orig)
    if (failed) killed++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(originals)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(originals)) {
    const back = hash(readFileSync(f, 'utf8'))
    console.log(`restored ${f.split('/').pop().padEnd(20)} ${back === hash(s) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
