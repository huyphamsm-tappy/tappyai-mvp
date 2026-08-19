// P3-S4 (tool / retrieval trust boundary) — mutation gate.
//
// The invariant under test: a retrieved string can never change the SHAPE of
// what is rendered. Every mutation below re-opens exactly one way for merchant-
// or search-controlled text to become markup instead of content.
//
// MR11..MR14 are the ones that matter most. streamEnrichment is the ONLY path
// where retrieved content becomes user-visible markup without passing through
// the model, so a mutation there is not "an unescaped string" — it is arbitrary
// attacker markup in the assistant's own reply.
//
// Single-line anchors only (CRLF tree); anchor count asserted before trusting.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const CM = ROOT + '/src/lib/ai/tools/common.ts'
const SE = ROOT + '/src/lib/ai/streamEnrichment.ts'

// The whole AI layer, not just the new file: a mutation that breaks legitimate
// retrieval (TR-08/TR-09/TR-12) must be caught by the pre-existing suites too.
const SPEC = 'src/lib/ai'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [CM, SE]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── the URL sanitiser: each character class is load-bearing ───────────────
  { f: CM, n: 'MR01 sanitiser is the identity — no encoding at all',
    from: '  for (const [pattern, replacement] of MARKDOWN_UNSAFE_IN_URL) out = out.replace(pattern, replacement)',
    to: '' },
  { f: CM, n: 'MR02 parentheses no longer encoded (the original hole)',
    from: "  [/\\(/g, '%28'], [/\\)/g, '%29'],", to: '' },
  { f: CM, n: 'MR03 space/tab no longer encoded (markdown link TITLE opens)',
    from: "  [/ /g, '%20'], [/\\t/g, '%09'],", to: '' },
  { f: CM, n: 'MR04 LF/CR no longer encoded (payload escapes onto its own line)',
    from: "  [/\\n/g, '%0A'], [/\\r/g, '%0D'],", to: '' },
  { f: CM, n: 'MR05 angle brackets no longer encoded (autolink delimiters)',
    from: "  [/</g, '%3C'], [/>/g, '%3E'],", to: '' },
  { f: CM, n: 'MR06 square brackets no longer encoded',
    from: "  [/\\[/g, '%5B'], [/\\]/g, '%5D'],", to: '' },
  { f: CM, n: 'MR07 non-global regex — only the FIRST occurrence encoded',
    from: "  [/\\(/g, '%28'], [/\\)/g, '%29'],",
    to: "  [/\\(/, '%28'], [/\\)/, '%29']," },
  { f: CM, n: 'MR08 % also encoded — corrupts already-encoded legitimate URLs',
    from: "  [/\\(/g, '%28'], [/\\)/g, '%29'],",
    to: "  [/%/g, '%25'],\n  [/\\(/g, '%28'], [/\\)/g, '%29']," },

  // ── the label sanitiser ───────────────────────────────────────────────────
  { f: CM, n: 'MR09 label structural characters no longer removed',
    from: "    .replace(/[[\\]()\\\\]/g, '')", to: '' },
  { f: CM, n: 'MR10 label removal narrowed to brackets — parentheses left live',
    from: "    .replace(/[[\\]()\\\\]/g, '')", to: "    .replace(/[[\\]\\\\]/g, '')" },
  { f: CM, n: 'MR11 label line breaks no longer flattened',
    from: "    .replace(/[\\r\\n]+/g, ' ')", to: '' },

  // ── the injection site: the one path that bypasses the model ─────────────
  // NB: mutating `photos = rawPhotos.map(...)` alone is an EQUIVALENT mutant
  // now — the emission site below re-sanitises and the dedup decodes, so the
  // output is byte-identical. The load-bearing call is the line-local one.
  { f: SE, n: 'MR12 photo URLs injected raw into the reply',
    from: '  for (const url of missingPhotos) lines.push(`![Ảnh địa điểm](${sanitizeUrlForMarkdown(url)})`)',
    to: '  for (const url of missingPhotos) lines.push(`![Ảnh địa điểm](${url})`)' },
  { f: SE, n: 'MR13 platform-link URL injected raw',
    from: '        .map(l => `[${escapeMarkdownLabel(l.name)}](${sanitizeUrlForMarkdown(l.url)})`)',
    to: '        .map(l => `[${escapeMarkdownLabel(l.name)}](${l.url})`)' },
  { f: SE, n: 'MR14 platform-link LABEL injected raw',
    from: '        .map(l => `[${escapeMarkdownLabel(l.name)}](${sanitizeUrlForMarkdown(l.url)})`)',
    to: '        .map(l => `[${l.name}](${sanitizeUrlForMarkdown(l.url)})`)' },
  // The dedup compares percent-DECODED forms. That is what lets the URL be
  // hardened without duplicating every parenthesised image, so it is part of
  // this boundary, not incidental.
  { f: SE, n: 'MR15 dedup stops decoding — encoding now costs a duplicate image',
    from: '  if (decodedText.includes(decoded)) return true',
    to: '  if (decodedText.includes(url)) return true' },

  // ── TR-12: the model boundary must keep carrying grounding evidence ──────
  { f: CM, n: 'MR16 serper links dropped from grounding evidence entirely',
    from: '      .map(r => ({ title: r.title as string, link: sanitizeUrlForMarkdown(r.link as string), snippet: r.snippet || \'\' }))',
    to: '      .map(r => ({ title: r.title as string, link: \'\', snippet: r.snippet || \'\' }))' },

  // ── the guard itself must be load-bearing ────────────────────────────────
  // MR17/MR18 are invisible to every payload test: MR17 adds a SECOND, unsafe
  // injection path that the existing tests never exercise, and MR18 re-opens
  // the boundary in a file the boundary tests do not import at all. Only the
  // architecture guard can see them. If either survives, the guard is
  // decoration.
  { f: SE, n: 'MR17 a second, unsanitised markdown site appears next to the safe one',
    from: '  const links = p.order_links || p.platform_links',
    to: '  if (p.photo_url) lines.push(`[Website](${p.photo_url})`)\n  const links = p.order_links || p.platform_links' },
  { f: SE, n: 'MR18 a competing local sanitiser is introduced outside common.ts',
    from: 'function domainOf(url: string): string {',
    to: "export function localEscape(u: string) { return u.replace(/\\(/g, '%28') }\nfunction domainOf(url: string): string {" },
]

let killed = 0, survived = 0, skipped = 0
try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`); continue }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, o)
    if (failed) killed++; else survived++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) {
    const same = hash(readFileSync(f, 'utf8')) === hash(s)
    console.log(`restored ${f.split('/').pop().padEnd(24)} ${same ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${survived} survived, ${skipped} skipped`)
