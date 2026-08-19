// P3-S3 (memory write security) — mutation gate.
//
// One mutation per authority invariant. The two that matter most are MW01
// (ownership spread before the patch) and MW02 (sanitiser bypassed): together
// they are the difference between "memory is a controlled store" and "memory is
// whatever an LLM last emitted, attributed to whoever it claims".
//
// Single-line anchors only (CRLF tree); anchor count asserted before trusting.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const MC = ROOT + '/src/lib/memory/memoryContract.ts'
const MS = ROOT + '/src/lib/memory/memoryService.ts'

const SPEC = 'src/lib/memory'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [MC, MS]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── ownership ─────────────────────────────────────────────────────────────
  { f: MS, n: 'MW01 ownership spread BEFORE the patch (candidate can override user_id)',
    from: '      { ...patch, user_id: userId, updated_at: new Date().toISOString() },',
    to: '      { user_id: userId, ...patch, updated_at: new Date().toISOString() },' },
  { f: MS, n: 'MW02 sanitiser bypassed — raw candidate persisted',
    from: '    const patch = sanitizeMemoryPatch(newData)',
    to: '    const patch = newData as Record<string, unknown>' },
  { f: MS, n: 'MW03 write proceeds without a server identity',
    from: "    if (typeof userId !== 'string' || userId.length === 0) return", to: '' },
  { f: MS, n: 'MW04 empty candidate still writes a row',
    from: '    if (Object.keys(patch).length === 0) return', to: '' },

  // ── schema / unknown fields ───────────────────────────────────────────────
  { f: MC, n: 'MW05 non-object candidates pass through instead of being rejected',
    from: '  if (!isRecord(candidate)) return {}',
    to: '  if (!isRecord(candidate)) return candidate as ValidatedMemoryPatch' },
  { f: MC, n: 'MW06 unknown fields copied through alongside the canonical ones',
    from: "  if ('location_base' in candidate) out.location_base = textField(candidate.location_base, L.maxTextChars)",
    to: "  Object.assign(out, candidate)\n  if ('location_base' in candidate) out.location_base = textField(candidate.location_base, L.maxTextChars)" },

  // ── bounds ────────────────────────────────────────────────────────────────
  { f: MC, n: 'MW07 text length bound removed',
    from: "  return out.replace(/\\s+/g, ' ').trim().slice(0, max)",
    to: "  return out.replace(/\\s+/g, ' ').trim()" },
  { f: MC, n: 'MW08 collection item cap removed',
    from: '    if (out.length >= maxItems) break', to: '' },
  { f: MC, n: 'MW09 preference key cap removed',
    from: '      if (Object.keys(prefs).length >= L.maxPreferenceKeys) break', to: '' },
  { f: MC, n: 'MW10 budget key cap removed',
    from: '      if (Object.keys(budget).length >= L.maxBudgetKeys) break', to: '' },
  { f: MC, n: 'MW11 non-finite / negative budget values accepted',
    from: '      if (!Number.isFinite(max) || max < 0) continue', to: '' },

  // ── the single-line invariant that keeps a fact from forging structure ────
  { f: MC, n: 'MW12 control characters no longer stripped from facts',
    from: '  for (const ch of value) out += CONTROL.has(ch.codePointAt(0) ?? 0) ? \' \' : ch',
    to: '  out = value' },
  { f: MC, n: 'MW13 empty-after-cleaning values persisted as empty strings',
    from: '  return clean.length > 0 ? clean : null', to: '  return clean' },
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
    console.log(`restored ${f.split('/').pop().padEnd(20)} ${same ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${survived} survived, ${skipped} skipped`)
