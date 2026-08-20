/**
 * A cheap structural sanity check for the iOS sources.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * There is no Swift compiler on the machine this repository is usually worked on, so a syntax
 * error in `ios/` can sit in the tree indefinitely without anything noticing. One did:
 * `PriceWatchesView.swift` contained
 *
 *     Text("Nhắn Tappy: "Tappy theo dõi AirPods Pro, báo mình khi dưới 2 triệu"")
 *
 * with the inner quotes unescaped, so Swift closed the string early and read the remainder as
 * identifiers. It was found by hand while converting strings for B03 — which is not a process.
 *
 * This does NOT replace a compiler. It catches the specific, mechanical classes that a text-level
 * check can catch honestly:
 *   • an odd number of unescaped `"` on a line (outside multi-line `"""` blocks and comments)
 *   • unbalanced braces/parens/brackets across a file
 *
 * Anything it reports is a real problem. Anything it stays silent about is merely un-refuted.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const IOS = 'ios/TappyAI'

function swiftFiles(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...swiftFiles(p))
    else if (e.endsWith('.swift')) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const problems = []

for (const file of swiftFiles(IOS)) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split(/\r?\n/)

  let inMultiline = false
  let inBlockComment = false
  let depth = { '{': 0, '(': 0, '[': 0 }

  lines.forEach((raw, i) => {
    let line = raw

    // Multi-line string literals: everything inside is data.
    const tripleCount = (line.match(/"""/g) || []).length
    if (inMultiline) {
      if (tripleCount % 2 === 1) inMultiline = false
      return
    }
    if (tripleCount % 2 === 1) { inMultiline = true; return }
    if (tripleCount > 0) return // opened and closed on one line

    if (inBlockComment) {
      if (line.includes('*/')) { inBlockComment = false; line = line.slice(line.indexOf('*/') + 2) }
      else return
    }
    if (line.includes('/*') && !line.includes('*/')) { inBlockComment = true; line = line.slice(0, line.indexOf('/*')) }

    // 🚨 A real left-to-right scan, not regex stripping. `//` inside `"https://…"` is NOT a
    // comment, and a first version that removed `/\/\/.*$/` first reported 36 URL lines as
    // broken — a checker that cries wolf on every https:// is worse than none, because the one
    // true positive is invisible in the noise.
    // A stack, because Swift nests: a string can contain `\(expr)`, and that expr can contain
    // another string, which can contain another interpolation. `"\(locale == "en" ? a : b)"` is
    // perfectly legal and a flat scanner reports its inner `"en"` as an adjacency error — four
    // such false positives appeared before this was modelled properly.
    // Frames, not bare tags: an interpolation carries its OWN paren depth, because `\(foo(bar))`
    // contains a `)` that closes `foo(` and not the interpolation. Treating the first `)` as the
    // end of the interpolation put the scanner back into string mode one paren early and made 23
    // files look unbalanced.
    const stack = [] // { k: 'string' | 'rawstring' | 'interp', d?: number }
    const top = () => stack[stack.length - 1]
    let code = ''
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      const k = top()?.k
      const inString = k === 'string' || k === 'rawstring'
      const raw_ = k === 'rawstring'

      if (!inString) {
        if (ch === '/' && line[c + 1] === '/') break // genuine line comment
        if (ch === '#' && line[c + 1] === '"') { stack.push({ k: 'rawstring' }); c++; continue }
        if (ch === '"') { stack.push({ k: 'string' }); continue }
        if (k === 'interp') {
          if (ch === '(') { top().d++; code += ch; continue }
          if (ch === ')') {
            if (top().d > 0) { top().d--; code += ch } else stack.pop() // back into the string
            continue
          }
        }
        code += ch
      } else {
        if (!raw_ && ch === '\\' && line[c + 1] === '(') { stack.push({ k: 'interp', d: 0 }); c++; continue }
        if (!raw_ && ch === '\\') { c++; continue }        // escaped char inside a normal string
        if (raw_ && ch === '"' && line[c + 1] === '#') { stack.pop(); c++; continue }
        if (!raw_ && ch === '"') {
          stack.pop()
          // 🚨 THE CHECK THAT ACTUALLY CATCHES THE BUG THIS FILE EXISTS FOR.
          //
          // `Text("Nhắn Tappy: "Tappy theo dõi …"")` has an EVEN number of quotes — four — so a
          // parity test calls it fine. What is wrong with it is that a string literal ends and an
          // IDENTIFIER begins with nothing between them, which Swift cannot parse. Nothing valid
          // looks like that: an operator, a comma, a paren or whitespace always follows a string.
          const next = line[c + 1]
          if (next && /[\p{L}\p{N}_]/u.test(next)) {
            problems.push(`${file}:${i + 1}  string literal followed directly by an identifier (unescaped inner quote?) — ${raw.trim().slice(0, 90)}`)
          }
          continue
        }
      }
    }

    if (stack.length) {
      problems.push(`${file}:${i + 1}  unterminated string literal — ${raw.trim().slice(0, 90)}`)
    }

    for (const ch of code) {
      if (ch === '{' || ch === '(' || ch === '[') depth[ch]++
      else if (ch === '}') depth['{']--
      else if (ch === ')') depth['(']--
      else if (ch === ']') depth['[']--
    }
  })

  for (const [open, n] of Object.entries(depth)) {
    if (n !== 0) problems.push(`${file}  unbalanced '${open}' by ${n}`)
  }
}

if (problems.length) {
  console.log(`STRUCTURAL PROBLEMS: ${problems.length}`)
  for (const p of problems) console.log('  ' + p)
  process.exitCode = 1
} else {
  console.log(`OK — ${swiftFiles(IOS).length} Swift files, no odd-quote or unbalanced-bracket problems found.`)
}
