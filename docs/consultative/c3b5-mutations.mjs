// C3-B.5 mutation testing of the grounding contract. Every mutation must KILL.
// Single-line anchors only: the tree is CRLF, so a multi-line "\n" anchor
// silently matches nothing and reports a false pass.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const PB = ROOT + '/src/lib/ai/promptBuilder.ts'
const SPEC = 'src/lib/ai/recommendationContract.test.ts'
const original = readFileSync(PB, 'utf8')
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIG = hash(original)
const EOL = original.includes('\r\n') ? '\r\n' : '\n'

const M = [
  { n: 'GR1  delete the "listing cannot prove quality" list',
    from: ' No KHONG chung minh duoc chat luong camera, hieu nang, do ben, he sinh thai, gia tri ban lai, hay "tot hon noi chung".', to: '' },
  { n: 'GR2  allow estimating a missing price',
    from: ' — KHONG uoc luong, KHONG suy ra tu kien thuc san co.', to: '.' },
  { n: 'GR3  drop the ENGLISH attribution ban (leave the Vietnamese one)',
    from: ' hay "based on the search results"', to: '' },
  { n: 'GR4  drop the VIETNAMESE attribution ban (leave the English one)',
    from: '"theo ket qua tim kiem" hay ', to: '' },
  { n: 'GR5  stack instead of replace — restore the licensing line',
    from: 'NGUON CUA TUNG CAU:',
    to: 'So sanh theo cac tieu chi CO DU LIEU that (gia, chat luong/danh gia, vi tri, tinh nang, tien loi, do hop nhu cau). Tieu chi nao khong co du lieu thi khong dua vao.' + EOL + 'NGUON CUA TUNG CAU:' },
  { n: 'GR6  remove the "general opinion is still allowed" escape hatch',
    from: 'noi ro do la Y KIEN CHUNG cua ban — ', to: '' },
  { n: 'GR7  drop "say it was not found" for the missing side',
    from: 'Ben nao khong co thi noi ro la chua tim thay gia cho ben do', to: 'Ben nao khong co thi bo qua' },
  { n: 'GR8  drop the priority-lean carve-out (pick regression guard)',
    from: ' Nghieng ve theo UU TIEN cua user KHONG phai la mot khang dinh du lieu — luat nguon o tren khong cam ban ket luan.', to: '' },
  { n: 'GR9  move the grounding rule into the CACHED shared segment',
    from: '  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}`',
    to: '  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}${stageBlock}`' },
  { n: 'GR10 leak the rule onto non-comparison turns',
    from: "    : decisionStage === 'comparison'", to: "    : decisionStage !== 'zzz'" },
]

let killed = 0
try {
  for (const m of M) {
    const n = original.split(m.from).length - 1
    if (n !== 1) { console.log(`SKIP      ${m.n} — anchor ${n}x, FIX THE ANCHOR`); continue }
    writeFileSync(PB, original.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(PB, original)
    if (failed) killed++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  writeFileSync(PB, original)
  console.log(`\nrestored promptBuilder.ts ${hash(readFileSync(PB, 'utf8')) === ORIG ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
console.log(`\n${killed}/${M.length} killed`)
