// ─────────────────────────────────────────────────────────────────────────────
// Control-byte guard (no shebang: a test imports this file — C02) — src/ and scripts/ must contain no control byte other than
// \t \n \r in any text file.
//
// Why: control bytes entered the repo twice and survived for weeks — 28e1d7d
// (a heredoc turned "\b" into 0x08: a street-number regex in tiktokEnrichment.ts
// silently never matched) and a7ec93a (literal 0x00 / 0x01 sentinels in
// contentClassification.ts made grep report "Binary file matches"). Source
// with a raw control byte is ambiguous to grep, diff and reviewers; the escape
// (\b, \u0000) says the same thing and is visible.
//
// Zero-dependency. Runs as `pretest` (so `npm test` locally and in CI fails
// first) and directly: `node scripts/controlBytes.mjs [dir ...]`. Exit 1 lists
// every offending file:line:column with the byte and the surrounding text.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, extname } from 'node:path'

const TEXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx', '.css', '.scss', '.html', '.svg', '.sql', '.yml', '.yaml', '.txt', '.py', '.sh', '.ps1', '.kt', '.swift', '.xml', '.env', '.csv'])
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])
// Everything below 0x20 except \t (09) \n (0A) \r (0D); DEL (7F) is a control byte too.
const BAD = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

export function scanFile(path) {
  const buf = readFileSync(path)
  const text = buf.toString('latin1') // byte-for-byte, so offsets are byte offsets
  const hits = []
  for (const m of text.matchAll(BAD)) {
    const off = m.index
    const line = text.slice(0, off).split('\n').length
    const col = off - text.lastIndexOf('\n', off - 1)
    const around = text.slice(Math.max(0, off - 30), off + 20).replace(BAD, b => `<0x${b.charCodeAt(0).toString(16).padStart(2, '0')}>`).replace(/\r?\n/g, '⏎')
    hits.push({ line, col, byte: `0x${text.charCodeAt(off).toString(16).padStart(2, '0')}`, around })
  }
  return hits
}

export function scanDir(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (TEXT.has(extname(name).toLowerCase())) {
        const hits = scanFile(p)
        if (hits.length) out.push({ file: p, hits })
      }
    }
  }
  walk(root)
  return out
}

// Runs the scan only when invoked directly (`node scripts/controlBytes.mjs`), not when imported.
if (process.argv[1] && /controlBytes\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'scripts']
  const cwd = process.cwd()
  let total = 0
  for (const r of roots) {
    for (const { file, hits } of scanDir(resolve(cwd, r))) {
      for (const h of hits) {
        total++
        console.error(`${relative(cwd, file).replace(/\\/g, '/')}:${h.line}:${h.col}  ${h.byte}  …${h.around}…`)
      }
    }
  }
  if (total > 0) {
    console.error(`\ncontrol-byte guard: ${total} control byte(s) in ${roots.join(', ')} — write the escape (\\b, \\u0000) instead of the raw byte.`)
    process.exit(1)
  }
  console.log(`control-byte guard: ${roots.join(', ')} clean`)
}
