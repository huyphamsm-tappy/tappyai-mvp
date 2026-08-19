import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const TARGET = ROOT + '/src/lib/ai/intent.ts'
const SPEC = 'src/lib/ai/locationIntent.test.ts'

const original = readFileSync(TARGET, 'utf8')
// The working tree is CRLF (see project_crlf_sensitive_sql_guard). A multi-line
// anchor written with "\n" silently matches nothing, which turns a mutation
// inert and reports a false pass. Join multi-line anchors with the file's OWN
// line ending instead.
const EOL = original.includes('\r\n') ? '\r\n' : '\n'
const L = (...lines) => lines.join(EOL)
console.log('file line ending =', EOL === '\r\n' ? 'CRLF' : 'LF')
const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIGINAL_HASH = hashOf(original)
console.log('baseline sha256/16 =', ORIGINAL_HASH, '\n')

// Each mutation must be KILLED (the spec must fail). A survivor means the test
// asserts nothing about that behaviour.
const mutations = [
  {
    name: 'M1  drop the purchase exemption (weak "where" always offline again)',
    from: 'if (weakWhereRe.test(t) && !purchaseRe.test(t)) return \'offline\'',
    to: 'if (weakWhereRe.test(t)) return \'offline\'',
  },
  {
    name: 'M2  weak "where" outranks an explicit marketplace',
    from: L("  if (offlineRe.test(t)) return 'offline'", "  if (onlineRe.test(t)) return 'online'"),
    to: L("  if (offlineRe.test(t)) return 'offline'",
          "  if (weakWhereRe.test(t) && !purchaseRe.test(t)) return 'offline'",
          "  if (onlineRe.test(t)) return 'online'"),
  },
  {
    name: 'M3  put "o dau" back into the hard offline set',
    from: '\\bkhu\\s+vuc\\b|\\bcua\\s*hang\\b',
    to: '\\bkhu\\s+vuc\\b|\\bo\\s+dau\\b|\\bcua\\s*hang\\b',
  },
  {
    name: 'M4  delete the weak "where" reading entirely',
    from: L("  if (weakWhereRe.test(t) && !purchaseRe.test(t)) return 'offline'", "  return 'unknown'"),
    to: "  return 'unknown'",
  },
  {
    name: 'M5  drop \\bmua\\b from the purchase markers',
    from: "const purchaseRe = /\\bmua\\b|\\bco ban\\b|san pham",
    to: "const purchaseRe = /\\bco ban\\b|san pham",
  },
  {
    name: 'M6  drop "co ban" from the purchase markers',
    from: "const purchaseRe = /\\bmua\\b|\\bco ban\\b|san pham",
    to: "const purchaseRe = /\\bmua\\b|san pham",
  },
  {
    name: 'M7  drop "cho nao" from the weak "where" markers',
    from: "const weakWhereRe = /\\bo\\s+dau\\b|\\bcho\\s+nao\\b/",
    to: "const weakWhereRe = /\\bo\\s+dau\\b/",
  },
]

let killed = 0
try {
  for (const m of mutations) {
    if (!original.includes(m.from)) {
      console.log(`SKIP  ${m.name}\n      anchor not found — mutation is inert, FIX THE ANCHOR`)
      continue
    }
    if (original.split(m.from).length - 1 !== 1) {
      console.log(`SKIP  ${m.name}\n      anchor appears ${original.split(m.from).length - 1}x — ambiguous`)
      continue
    }
    writeFileSync(TARGET, original.replace(m.from, m.to))
    let failed = false
    try {
      execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' })
    } catch { failed = true }
    if (failed) killed++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.name}`)
  }
} finally {
  writeFileSync(TARGET, original)
  const restored = hashOf(readFileSync(TARGET, 'utf8'))
  console.log(`\nrestored sha256/16 = ${restored}  ${restored === ORIGINAL_HASH ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
console.log(`\n${killed}/${mutations.length} killed`)
