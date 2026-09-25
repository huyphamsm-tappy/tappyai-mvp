// Shared helpers for the merge-loss guards (merge-guard.mjs, branch-containment.mjs).
// Zero dependencies: only `git` and Node built-ins, so CI runs them without `npm ci`.
//
// Background — docs/uat/MERGE-LOSS-AUDIT.md (2026-09-25). Code reached the shipping branch
// minus pieces in three ways: a branch that was never merged (F-065: the 09-03 group RLS fix),
// a merge resolution that dropped lines git had merged cleanly (a6ca9f0: Android share wiring),
// and a merge that "parked" a feature set together with the security fix inside it (1e7b77e:
// review_likes privacy). Every test passed each time, because the tests went with the code.
import { execFileSync } from 'node:child_process'

export function makeGit(repo) {
  const run = (args, opts = {}) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, ...opts })
  const ok = (args) => { try { return run(args, { stdio: ['ignore', 'pipe', 'ignore'] }) } catch (e) { return e.stdout ?? null } }
  const strict = (args) => { try { return run(args, { stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
  return { repo, run, ok, strict }
}

/**
 * Paths whose loss is never routine: schema + RLS, the DB boundary tests, security / auth /
 * quota / payment code and the deterministic guards. Kept deliberately explicit — a change to
 * this list is itself a reviewable diff.
 */
export const PROTECTED = [
  /^supabase\/migrations\//,
  /^supabase\/tests\//,
  /(^|\/)security\//,
  /(^|\/)auth\//,
  /(^|[/_.-])rls([/_.-]|$)|polic(y|ies)|boundary/i,
  /rateLimit|quota|chatCaps/i,
  /(Guard|guard)\.(ts|tsx|mjs)$/,
  /streamEnrichment\.ts$/,
  /stripe|subscription|billing|payment|checkout/i,
  /(^|\/)ccp\//,
  /^scripts\/architecture\//,
  /^scripts\/merge-guard\//,
]
export const isProtected = (path) => PROTECTED.some(re => re.test(path))

/** Paths whose content is generated or prose — never a code loss. */
export const IGNORED = [/^docs\//, /\.md$/i, /(^|\/)package-lock\.json$/, /(^|\/)vitest-report\.json$/]
export const isIgnored = (path) => IGNORED.some(re => re.test(path))

const MARKER = /^(<<<<<<<|=======|>>>>>>>|\|\|\|\|\|\|\|)( |$)/
/** A line too generic to identify a change (braces, blank comment leaders, very short). */
export const trivialLine = (s) => s.length < 6 || /^[\s{}()[\];,]*$/.test(s) || /^(\/\/|\*|#|--)\s*$/.test(s)

export function linesSet(text) {
  return text === null || text === undefined ? null : new Set(text.split('\n').map(s => s.trim()))
}

/**
 * Parse a unified diff FROM the automatic merge TO the actual result into per-file removals,
 * each tagged with its region: 'conflict' (between the auto-merge's conflict markers) or 'clean'
 * (text git had merged without conflict).
 */
export function parseAutoToResultDiff(diffText) {
  const files = []
  for (const sec of diffText.split(/^diff --git /m).slice(1)) {
    const m = sec.match(/^a\/(.+?) b\/(.+?)\n/)
    if (!m) continue
    const path = m[1]
    const deleted = /^deleted file mode/m.test(sec) || /^\+\+\+ \/dev\/null/m.test(sec)
    const removed = new Map() // trimmed line → region
    let inConflict = false
    let sawMarker = false
    for (const l of sec.split('\n')) {
      if (!l) continue
      const body = l.slice(1)
      if (/^<<<<<<< /.test(body)) { inConflict = true; sawMarker = true; continue }
      if (/^>>>>>>> /.test(body)) { inConflict = false; continue }
      if (l[0] !== '-' || l.startsWith('---') || MARKER.test(body)) continue
      const t = body.trim()
      if (trivialLine(t)) continue
      const prev = removed.get(t)
      removed.set(t, prev === 'clean' || !inConflict ? 'clean' : 'conflict')
    }
    files.push({ path, deleted, conflicted: sawMarker, removed })
  }
  return files
}

/** `Merge-Drop: <path-or-glob> — <reason>` trailers in a merge message. */
export function parseDropTrailers(message) {
  const out = []
  for (const line of (message || '').split('\n')) {
    const m = line.match(/^\s*Merge-Drop:\s*(\S+)\s*(?:—|–|-{1,2}|:)\s*(.+?)\s*$/i)
    if (m) out.push({ glob: m[1], reason: m[2], re: globToRegExp(m[1]) })
  }
  return out
}

export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') { if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++ } else re += '[^/]*' }
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}

export function parseArgs(argv, spec) {
  const out = { ...spec }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    if (typeof spec[key] === 'boolean') out[key] = true
    else out[key] = argv[++i]
  }
  return out
}
