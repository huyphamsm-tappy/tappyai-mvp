// Wave 2B · proof that ext25-questions-v2.txt is ext25-questions.txt with ONLY the two trailing judge notes moved onto @note lines.
// Usage: node scripts/uat/consultUat/compareQuestionFiles.mjs <v1 path> <v2 path> <id,id> (the ids whose note moved, e.g. X1-2,X1-3)
// Reads both files (read-only), prints every check and its result, exits 1 if any check fails. Independent of parseDevQuestions on purpose: it splits lines itself.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [p1, p2, idsArg] = process.argv.slice(2)
if (!p1 || !p2 || !idsArg) { console.log('usage: compareQuestionFiles.mjs <v1> <v2> <id,id,...>'); process.exit(2) }
const moved = new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean))
const raw1 = readFileSync(p1), raw2 = readFileSync(p2)
const sha = b => createHash('sha256').update(b).digest('hex')
let failed = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); if (!ok) failed++ }

console.log(`v1 ${p1} bytes=${raw1.length} sha256=${sha(raw1)}`)
console.log(`v2 ${p2} bytes=${raw2.length} sha256=${sha(raw2)}`)

const lines = b => b.toString('utf8').split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '')
const l1 = lines(raw1), l2 = lines(raw2)
const dir2 = l2.filter(l => l.startsWith('@'))
const q2 = l2.filter(l => !l.startsWith('@'))
check('v1 has 30 turns', l1.length === 30, String(l1.length))
check('v2 has 30 question lines', q2.length === 30, String(q2.length))
check('v2 first line is @format|2', l2[0] === '@format|2')
check('v2 directive lines are only @format, @doc and @note', dir2.every(l => /^@(format|doc|note)\|/.test(l)))
const notes = new Map()
l2.forEach((l, i) => { if (l.startsWith('@note|')) { const p = l.split('|'); notes.set(`${p[1]}#${p[2]}`, { text: p.slice(3).join('|'), above: l2[i - 1] }) } })
check('v2 carries exactly the moved notes', notes.size === moved.size, `${notes.size} notes`)

let same = 0, movedOk = 0
for (let i = 0; i < l1.length; i++) {
  const a = l1[i], b = q2[i]
  const [id1, conv1, turn1, ...rest1] = a.split('|'), [id2, conv2, turn2, ...rest2] = b.split('|')
  const body1 = rest1.join('|'), body2 = rest2.join('|')
  check(`line ${i + 1} ${id1}: id, conversation, turn and order unchanged`, id1 === id2 && conv1 === conv2 && turn1 === turn2)
  if (!moved.has(id1)) { check(`line ${i + 1} ${id1}: identical byte for byte`, a === b); if (a === b) same++; continue }
  const n = notes.get(`${conv1}#${turn1}`)
  check(`${id1}: has a note line directly below it`, !!n && n.above === b)
  if (!n) continue
  const gap = body1.slice(body2.length, body1.length - n.text.length)
  const ok = body1 === body2 + gap + n.text && /^ +$/.test(gap) && n.text.startsWith('(') && n.text.endsWith(')') && body2 === body2.trimEnd() && body2.length > 0
  check(`${id1}: v1 text == v2 user words + spaces + note, and the note is exactly the removed bracket`, ok, `user words=${JSON.stringify(body2)} gap=${gap.length} spaces note=${JSON.stringify(n.text)}`)
  if (ok) movedOk++
}
check(`${l1.length - moved.size} unchanged lines identical, ${moved.size} moved lines verified`, same === l1.length - moved.size && movedOk === moved.size, `${same} identical, ${movedOk} moved`)
console.log(failed === 0 ? 'RESULT: ALL CHECKS PASSED' : `RESULT: ${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
