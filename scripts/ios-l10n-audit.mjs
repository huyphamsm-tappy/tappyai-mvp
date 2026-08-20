/**
 * B03 — iOS localization audit.
 *
 * Enumerates every Vietnamese literal still sitting in shipped iOS UI code, with the file, line
 * and enough surrounding syntax to classify it: is it a user-facing label, an accessibility
 * string, an error message — or a log line, a dictionary key, or product CONTENT that happens to
 * be Vietnamese by design?
 *
 * Read-only. Prints a report; changes nothing.
 *
 *   node scripts/ios-l10n-audit.mjs            # summary
 *   node scripts/ios-l10n-audit.mjs --list     # every literal
 *   node scripts/ios-l10n-audit.mjs --file X   # one file
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const IOS = 'ios/TappyAI'
const DEV_ONLY = /\/(Preview|Debug|Mock|Fixtures?)\//i
const CONTENT_NOT_CHROME = /\/Model\//
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

function swiftFiles(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...swiftFiles(p))
    else if (e.endsWith('.swift')) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

/**
 * Classify by the SYNTAX the literal sits in, not by guessing at meaning.
 *
 * The distinction that matters: a string handed to SwiftUI's `Text`, a button label, an
 * accessibility modifier or an alert is read by a user and must be localized. A string used as a
 * dictionary key, a log message, an analytics event name or a comparison operand is not — and
 * "translating" it would change program behaviour rather than the interface.
 */
/**
 * Is this literal the Vietnamese half of a pair that ALREADY has an English half?
 *
 * 🚨 This is the distinction the 487-literal ratchet cannot make, and without it the number is
 * misleading in the direction that matters. `ChatEmptyState.swift` carries 38 Vietnamese literals
 * and is fully bilingual — `labelVi`/`labelEn`, `vi:`/`en:` prompt banks, `locale == "en" ? …`.
 * An English user sees English there today. Counting those 38 alongside a genuinely untranslated
 * label treats "wrong architecture" and "wrong language on screen" as the same defect; only the
 * second one is what B03 reported.
 *
 * Detected structurally, per line and per enclosing declaration:
 *   • a ternary on the locale/language
 *   • an `…En`/`…Vi` field pair on the same line
 *   • membership of a `vi:` collection whose declaration has an `en:` sibling
 */
function bilingualKind(line, fileSrc, lineIdx) {
  const l = line
  const whole = fileSrc.join('\n')

  // 1. A ternary that switches on the locale, on this line or the two above it — SwiftUI wraps
  //    these across lines constantly, so a single-line test misses most of them.
  // Four lines, because SwiftUI call sites routinely put the condition, the `?` branch and the
  // `:` branch on separate lines inside a multi-line argument list — `ChatView`'s quick prompts
  // sit three lines below their `language.rawValue == "en"` test.
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 4); i--) {
    if (/locale\s*==\s*"en"|language(\.rawValue)?\s*==\s*("en"|\.(en|english))|isEnglish|lang\s*==\s*"en"/.test(fileSrc[i])) {
      return 'inline_ternary'
    }
  }

  // 2. An `…En` twin named on the same line.
  if (/\b\w*En\b\s*:|\btextEn\b|\blabelEn\b|\bpromptEn\b/.test(l)) return 'paired_field'

  // 3. Membership of a declaration that is itself paired. Two shapes:
  //      let thinkHintsVi = [...]        with a sibling `thinkHintsEn`
  //      let categories: [(… labelVi: String, labelEn: String)] = [ ("🍜", "food", "Ăn uống", "Food") ]
  //    The second is the one that made the raw 487 misleading: the pairing is POSITIONAL, declared
  //    once in the tuple type, and invisible on the rows themselves.
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 25); i--) {
    const decl = fileSrc[i]
    const named = decl.match(/\blet\s+(\w+)Vi\b/)
    if (named && new RegExp(`\\b${named[1]}En\\b`).test(whole)) return 'paired_named'
    // `\w*Vi\s*:` and not `\bVi\s*:` — the field is written `labelVi:`, and a word boundary
    // cannot occur between "l" and "V", so the \b form silently matched nothing and every
    // positionally-paired tuple counted as untranslated.
    if (/\blet\s+\w+\s*:\s*\[?\(/.test(decl) && /\w*Vi\s*:/.test(decl) && /\w*En\s*:/.test(decl)) {
      return 'paired_tuple'
    }
    if (/\blet\s+vi\s*:/.test(decl)) return /\blet\s+en\s*:/.test(whole) ? 'paired_bank' : null
    if (/\blet\s+en\s*:/.test(decl)) return 'paired_bank'
    if (/^\s*(private\s+)?(let|var|func|struct)\s/.test(decl) && i !== lineIdx) break // left the declaration
  }
  return null
}

function classify(line, literal) {
  const l = line.trim()
  if (/^\s*(print|debugPrint|NSLog|assert|assertionFailure|fatalError)\s*\(/.test(l)) return 'B_developer'
  if (/\b(logger|log)\.(debug|info|warning|error|notice|fault)\s*\(/.test(l)) return 'B_developer'
  if (/\/\/\s*swiftlint/.test(l)) return 'B_developer'
  if (/accessibility(Label|Hint|Value)\s*\(/.test(l)) return 'F_accessibility'
  if (/\.alert\s*\(|Alert\s*\(|\.confirmationDialog\s*\(/.test(l)) return 'J_ui'
  if (/\b(errorMessage|message|errorText|failureReason)\s*[:=]/.test(l)) return 'G_error'
  if (/\bprompt\s*:|placeholder\s*:|\.searchable\s*\(/.test(l)) return 'H_placeholder'
  if (/\bText\s*\(|Label\s*\(|Button\s*\(|\.navigationTitle\s*\(|Toggle\s*\(|Picker\s*\(|Section\s*\(|\.tabItem|TextField\s*\(|SecureField\s*\(/.test(l)) return 'J_ui'
  if (/\bNotification|UNMutableNotificationContent|\.body\s*=|\.title\s*=/.test(l)) return 'I_notification'
  if (/^\s*case\s+|\breturn\s+"/.test(l)) return 'A_userfacing_maybe'
  if (/\[\s*"/.test(l) || /:\s*\[/.test(l)) return 'E_data'
  return 'A_userfacing_maybe'
}

const args = process.argv.slice(2)
const wantList = args.includes('--list')
const onlyFile = args.includes('--file') ? args[args.indexOf('--file') + 1] : null

const rows = []
for (const file of swiftFiles(IOS)) {
  if (DEV_ONLY.test(file) || CONTENT_NOT_CHROME.test(file)) continue
  if (onlyFile && !file.includes(onlyFile)) continue
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    if (/\bvalue:\s*"[^"]*"/.test(line)) return
    // `Text(verbatim:)` is Swift's own way of saying "this is data, not localizable text" — a
    // price like "0đ" reads the same in both languages. Honoured here so the marker means
    // something instead of the count being fudged.
    if (/\bverbatim:/.test(line)) return
    // An explicit, greppable opt-out for the handful of strings that are correct untranslated —
    // language endonyms, mainly. It has to be written on the line, so it shows up in review.
    if (/l10n:exempt/.test(line)) return
    for (const m of line.matchAll(/"([^"\\]{2,})"/g)) {
      if (!VIETNAMESE.test(m[1])) continue
      rows.push({
        file: file.replace(IOS + '/', ''),
        line: i + 1,
        literal: m[1],
        kind: classify(line, m[1]),
        bilingual: bilingualKind(line, lines, i),
        code: line.trim().slice(0, 110),
      })
    }
  })
}

const bilingual = rows.filter(r => r.bilingual)
const untranslated = rows.filter(r => !r.bilingual)

const byKind = {}
for (const r of untranslated) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
const byFile = {}
for (const r of untranslated) byFile[r.file] = (byFile[r.file] ?? 0) + 1

console.log(`TOTAL Vietnamese literals in shipped iOS UI: ${rows.length}`)
console.log(`  already bilingual (VI half of an EN/VI pair): ${bilingual.length}`)
console.log(`  GENUINELY UNTRANSLATED (an EN user sees Vietnamese): ${untranslated.length}`)
console.log(`FILES with untranslated text: ${Object.keys(byFile).length}\n`)
console.log('BY CLASSIFICATION:')
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`)
}
console.log('\nBY FILE (top 25):')
for (const [f, v] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(v).padStart(4)}  ${f}`)
}

if (wantList) {
  console.log('\n--- EVERY LITERAL ---')
  for (const r of untranslated) console.log(`${r.kind}\t${r.file}:${r.line}\t${r.literal}`)
}
