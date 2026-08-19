// P3-S1 (input trust boundary) — mutation gate.
//
// One mutation per security invariant the Owner listed. Each is a plausible
// edit: an extra role in an allowlist, a loosened bound, a validation call that
// moves. If any of these survives, the invariant is decoration.
//
// Deliberately ABSENT: a mutation of the `totalChars > maxTotalClientTextChars`
// branch. Under the current sub-limits that branch is unreachable by
// construction, so a mutation of it could not fail a test — adding one would be
// a knowingly-vacuous entry. The invariant it protects is enforced instead by
// mutating the CONSTANT (MS12), which the sum-assertion test kills. See the S1
// report for the reasoning.
//
// Single-line anchors only (CRLF tree). Anchor count asserted before trusting.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const CI = ROOT + '/src/lib/ai/security/clientInput.ts'
const RT = ROOT + '/src/app/api/chat/route.ts'

const SPEC = 'src/lib/ai/security'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [CI, RT]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── role allowlist ────────────────────────────────────────────────────────
  { f: CI, n: 'MS01 role allowlist removed entirely',
    from: "    if (typeof role !== 'string' || !(ALLOWED_ROLES as readonly string[]).includes(role)) {",
    to: '    if (false) {' },
  { f: CI, n: 'MS02 system role admitted',
    from: "const ALLOWED_ROLES = ['user', 'assistant'] as const",
    to: "const ALLOWED_ROLES = ['user', 'assistant', 'system'] as const" },
  { f: CI, n: 'MS03 tool role admitted',
    from: "const ALLOWED_ROLES = ['user', 'assistant'] as const",
    to: "const ALLOWED_ROLES = ['user', 'assistant', 'tool'] as const" },
  { f: CI, n: 'MS04 developer role admitted',
    from: "const ALLOWED_ROLES = ['user', 'assistant'] as const",
    to: "const ALLOWED_ROLES = ['user', 'assistant', 'developer'] as const" },

  // ── forged structures ─────────────────────────────────────────────────────
  { f: CI, n: 'MS05 unknown content parts pass through as text (tool-call/tool-result accepted)',
    from: "  return 'invalid_content'\n}",
    to: "  return { type: 'text', text: JSON.stringify(part) }\n}" },
  { f: CI, n: 'MS06 provider-specific message keys allowed',
    from: '    for (const key of FORBIDDEN_MESSAGE_KEYS) {',
    to: '    for (const key of ([] as readonly string[])) {' },
  { f: CI, n: 'MS07 caller message object forwarded instead of rebuilt',
    from: "      messages.push(isUser ? { role: 'user', content } : { role: 'assistant', content })",
    to: '      messages.push(raw as unknown as ValidatedMessage)' },

  // ── bounds ────────────────────────────────────────────────────────────────
  { f: CI, n: 'MS08 message text budget removed',
    from: '  if (messageChars > L.maxMessageTextChars) {', to: '  if (false) {' },
  { f: CI, n: 'MS09 per-preference length limit removed',
    from: '      if (item.length > L.maxPreferenceItemChars) {', to: '      if (false) {' },
  { f: CI, n: 'MS10 preference count limit removed',
    from: '    if (rawPrefs.length > L.maxPreferenceItems) {', to: '    if (false) {' },
  { f: CI, n: 'MS11 preference aggregate budget removed',
    from: '    if (prefChars > L.maxPreferenceTotalChars) {', to: '    if (false) {' },
  { f: CI, n: 'MS12 total budget no longer equals the sum of its parts',
    from: '  maxTotalClientTextChars: 28_000,', to: '  maxTotalClientTextChars: 280_000,' },
  { f: CI, n: 'MS13 message count limit removed',
    from: '  if (rawMessages.length > L.maxMessages) {', to: '  if (false) {' },

  // ── the F1 fix: preferences must stay single-line DATA ────────────────────
  { f: CI, n: 'MS14 preference normalisation skipped (line breaks survive)',
    from: '      const normalized = toSingleLine(item)', to: '      const normalized = item' },
  { f: CI, n: 'MS15 structural code points no longer stripped',
    from: '  for (let c = 0x00; c <= 0x1f; c++) s.add(c)', to: '' },

  // ── the boundary must run, and run first ──────────────────────────────────
  { f: RT, n: 'MS16 rejected input proceeds anyway',
    from: '  if (!validated.ok) {', to: '  if (false) {' },
  { f: RT, n: 'MS17 raw client messages used instead of the validated ones',
    from: '  const messages = validated.messages',
    to: '  const messages = (rawBody as { messages: never[] }).messages' },
  { f: RT, n: 'MS18 raw client preferences used instead of the validated ones',
    from: '  const rawPrefsArr = validated.preferences',
    to: '  const rawPrefsArr = ((rawBody as { userPreferences?: string[] }).userPreferences ?? [])' },
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
    console.log(`restored ${f.split('/').pop().padEnd(16)} ${same ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${survived} survived, ${skipped} skipped`)
