// Do the four C3-B.3 architecture guards actually bite? Each mutation performs
// exactly the forbidden act; each must be KILLED.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const ROUTE = ROOT + '/src/app/api/chat/route.ts'
const TYPES = ROOT + '/src/lib/ai/llm/types.ts'
const SPEC = 'src/lib/ai/recommendationContract.test.ts'
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = { [ROUTE]: readFileSync(ROUTE, 'utf8'), [TYPES]: readFileSync(TYPES, 'utf8') }

const M = [
  { f: ROUTE, n: 'G1  force a tool on AI.stream', from: '    maxSteps: noToolTurn ? 1 :', to: "    toolChoice: { type: 'tool', toolName: 'search_products' },\n    maxSteps: noToolTurn ? 1 :" },
  { f: ROUTE, n: 'G2  hand forcedTool to AI.stream', from: '    systemShared,', to: '    forcedTool,\n    systemShared,' },
  { f: TYPES, n: 'G3  reintroduce prepareStep on the options type', from: '  maxSteps?: number', to: '  maxSteps?: number\n  prepareStep?: unknown' },
  // single-line anchor: the tree is CRLF, so a "\n" multi-line anchor matches nothing
  { f: ROUTE, n: 'G4  prefetch a tool before generation',
    from: '  const enrichment = createEnrichmentCollector()',
    to: '  const enrichment = createEnrichmentCollector()\r\n  const pre = await searchProducts(lastText, lang); void pre' },
]

let killed = 0
try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) { console.log(`SKIP      ${m.n} — anchor ${n}x`); continue }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, o)
    if (failed) killed++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) console.log(`restored ${f.split('/').pop().padEnd(12)} ${hash(readFileSync(f, 'utf8')) === hash(s) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
console.log(`\n${killed}/${M.length} killed`)
