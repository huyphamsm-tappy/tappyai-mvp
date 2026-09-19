// P1 diagnosis (A.1) — diff two captured model requests (AUDIT_MODEL_REQUEST_FILE) field by field.
// usage: node capdiff.mjs <capture.jsonl> [--md]   (compares the first two JSON records)
import { readFileSync } from 'node:fs'
const [file, ...rest] = process.argv.slice(2)
const recs = readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.startsWith('{')).map(l => JSON.parse(l))
const [a, b] = recs
const md = rest.includes('--md')
const out = []
const show = v => typeof v === 'string' ? JSON.stringify(v.length > 160 ? v.slice(0, 160) + `…(${v.length})` : v) : JSON.stringify(v)
function cmp(path, x, y) {
  if (typeof x === 'object' && x && typeof y === 'object' && y && !Array.isArray(x) && !Array.isArray(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) cmp(path + '.' + k, x[k], y[k])
    return
  }
  const same = JSON.stringify(x) === JSON.stringify(y)
  out.push({ path, same, a: x, b: y })
}
cmp('request', a.request, b.request)
cmp('gate', a.gate, b.gate)
cmp('model.systemSharedChars', a.model.systemSharedChars, b.model.systemSharedChars)
cmp('model.systemSharedSha', a.model.systemSharedSha, b.model.systemSharedSha)
cmp('model.tools', a.model.tools, b.model.tools)
cmp('model.memoryChars', a.model.memoryChars, b.model.memoryChars)
cmp('model.v1Chars', a.model.v1Chars, b.model.v1Chars)
cmp('model.consultativeChars', a.model.consultativeChars, b.model.consultativeChars)
cmp('model.messages.length', a.model.messages.length, b.model.messages.length)
for (let i = 0; i < Math.max(a.model.messages.length, b.model.messages.length); i++) {
  cmp(`model.messages[${i}].role`, a.model.messages[i]?.role, b.model.messages[i]?.role)
  cmp(`model.messages[${i}].content`, a.model.messages[i]?.content, b.model.messages[i]?.content)
}
// System prompt: line-level diff (lines present in one and not the other).
const la = a.model.system.split('\n'), lb = b.model.system.split('\n')
const sa = new Set(la), sb = new Set(lb)
const onlyA = la.filter(l => !sb.has(l)), onlyB = lb.filter(l => !sa.has(l))
if (md) {
  console.log('| field | same | A (' + (a.request.surface ?? '-') + ') | B (' + (b.request.surface ?? '-') + ') |')
  console.log('|---|---|---|---|')
  for (const r of out) console.log(`| ${r.path} | ${r.same ? '=' : '**≠**'} | ${show(r.a)} | ${show(r.b)} |`)
  console.log(`\nSystem prompt: A ${a.model.system.length} chars / ${la.length} lines · B ${b.model.system.length} chars / ${lb.length} lines · lines only in A: ${onlyA.length} · only in B: ${onlyB.length}`)
  for (const l of onlyA) console.log('- A only: ' + show(l))
  for (const l of onlyB) console.log('- B only: ' + show(l))
} else {
  console.log(JSON.stringify({ diffs: out.filter(r => !r.same), systemOnlyA: onlyA, systemOnlyB: onlyB }, null, 1))
}
