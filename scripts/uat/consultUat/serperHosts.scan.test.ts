// @vitest-environment node
// Round 2d · STATIC SCAN: no route to Serper around `serperPost`. MOCK-ONLY (reads source text, opens no socket).
//
// What it proves: in the NON-TEST source of src/ and scripts/ (ts, tsx, mjs, js, cjs), the Serper hostname, Serper's auth header and the Serper API key
// appear only where this file's list says they may, each with a reason. A new file that names the host, sets the header, or reads the key FAILS the test.
//
// What it does NOT prove (stated, not hidden): a URL assembled from pieces ('google.' + 'serper' + '.dev'), a call through an external library or
// service that holds the key elsewhere, a key obtained by another name, anything outside src/ and scripts/ (nothing else in the repository was found to name
// Serper in code: see the round 2d report), or what happens at run time. It is a tripwire for the normal ways of going around the door, not a proof that
// no way exists.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface SourceFile { path: string; text: string }
export interface Exception { path: string; rules: Array<'host' | 'header' | 'key' | 'direct'>; reason: string }

/** The one door. */
const DOOR = 'src/lib/ai/tools/serperClient.ts'

/** Every non-test file allowed to deviate, with the PATH and the REASON. A stale entry (file gone) or a missing reason fails the test. */
export const EXCEPTIONS: Exception[] = [
  { path: DOOR, rules: ['host', 'header', 'direct'], reason: 'THE one door: serperPost builds the only Serper URL (`https://google.serper.dev/${endpoint}`), sets the only X-API-KEY header and makes the only fetch; the spend gate, the daily ceiling and the web ticket are all inside it. It receives the key as a parameter (it does not read SERPER_API_KEY itself).' },
  { path: 'scripts/consult/replay/lib/serperReplay.ts', rules: ['host'], reason: 'Offline replay tool (opt-in: REPLAY=1, also imported by scripts/agent-eval under AGENT_EVAL=1; scripts/ only, never loaded by the app or by the benchmark runner). It stubs globalThis.fetch and matches the host google.serper.dev to record/replay answers; on a recording MISS it makes ONE real Serper call (through `realFetch`) outside the spend gate. It is not on the path of the 13 benchmark questions.' },
  { path: 'src/lib/ai/tools/common.ts', rules: ['key'], reason: 'Reads SERPER_API_KEY and hands it ONLY to serperPost (images, search, shopping); it sets no header and opens no connection of its own.' },
  { path: 'src/lib/ai/tools/serperPlaces.ts', rules: ['key'], reason: 'Reads SERPER_API_KEY and hands it ONLY to serperPost (maps); no header, no connection of its own.' },
  { path: 'src/app/api/cron/price-check/route.ts', rules: ['key'], reason: 'Cron route (not on the chat path): reads SERPER_API_KEY and hands it ONLY to serperPost (search, num 5).' },
  { path: 'scripts/consult/replay/lib/env.ts', rules: ['key'], reason: 'Replay tool (opt-in): copies SERPER_API_KEY from the audit env file into process.env for the replay run; it makes no request.' },
  { path: 'scripts/uat/consultUat/liveRunner.testkit.ts', rules: ['key'], reason: 'Test helper: only NAMES SERPER_API_KEY in the list of variables the tests clear (applyEnv); it reads no value and makes no request.' },
]

const NAMES = { host: /serper\.dev/i, header: /x-api-key/i, key: /SERPER_API_KEY/ }
/** A direct network call on a line that also mentions Serper by name. */
const DIRECT = /(\bfetch\s*\(|\baxios\b|\bundici\b|\bhttps?\.request\b|\bgot\s*\()/

// A line that is ONLY a comment. Leading block comments are skipped first, so a block comment followed by code on the same line counts as code.
const isComment = (line: string): boolean => {
  let s = line.trim()
  for (;;) { const m = /^\/\*.*?\*\//.exec(s); if (!m) break; s = s.slice(m[0].length).trim() }
  return s === '' || /^(\/\/|\*|\/\*)/.test(s)
}

/** Violations of the rules in a set of files. Pure: tests it on synthetic files as well as on the real tree. */
export function findViolations(files: SourceFile[], exceptions: Exception[] = EXCEPTIONS): string[] {
  const allowed = (path: string, rule: Exception['rules'][number]) => exceptions.some(e => e.path === path && e.rules.includes(rule))
  const out: string[] = []
  for (const f of files) {
    const lines = f.text.split('\n')
    lines.forEach((line, i) => {
      const at = `${f.path}:${i + 1}`
      // the hostname is forbidden EVERYWHERE outside the list, comments included (a comment naming it is how a copy-pasted fetch starts)
      if (NAMES.host.test(line) && !allowed(f.path, 'host')) out.push(`${at} names the Serper host outside the allowed list: ${line.trim().slice(0, 120)}`)
      if (isComment(line)) return
      if (NAMES.header.test(line) && !allowed(f.path, 'header')) out.push(`${at} sets or names the X-API-KEY header outside the allowed list: ${line.trim().slice(0, 120)}`)
      if (NAMES.key.test(line) && !allowed(f.path, 'key')) out.push(`${at} reads SERPER_API_KEY outside the allowed list: ${line.trim().slice(0, 120)}`)
      if (/serper/i.test(line) && DIRECT.test(line) && !allowed(f.path, 'direct')) out.push(`${at} makes a direct network call on a line that names Serper: ${line.trim().slice(0, 120)}`)
    })
  }
  return out
}

const ROOT = join(__dirname, '..', '..', '..')
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'recordings', 'out', 'coverage'])
const CODE = /\.(ts|tsx|mjs|js|cjs)$/
const TESTISH = /\.test\.(ts|tsx|mjs|js)$|\.testkit\.ts$/
export function readTree(roots: string[], keepTests = false): SourceFile[] {
  const files: SourceFile[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) { walk(p); continue }
      if (!CODE.test(name) || (!keepTests && TESTISH.test(name) && name !== 'liveRunner.testkit.ts')) continue
      files.push({ path: relative(ROOT, p).split(sep).join('/'), text: readFileSync(p, 'utf8') })
    }
  }
  for (const r of roots) walk(join(ROOT, r))
  return files
}

describe('Serper cannot be reached around serperPost (static scan of src/ and scripts/)', () => {
  const files = readTree(['src', 'scripts'])

  it('scans a real tree (not an empty one)', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(files.some(f => f.path === DOOR)).toBe(true)
  })

  it('the real tree has NO violation: host, X-API-KEY header, API key and direct calls appear only in the listed files', () => {
    expect(findViolations(files)).toEqual([])
  })

  it('every exception names a file that still exists and gives a real reason (no stale or reasonless entry)', () => {
    for (const e of EXCEPTIONS) {
      expect(files.some(f => f.path === e.path), `${e.path} no longer exists - remove its exception`).toBe(true)
      expect(e.reason.trim().length, `${e.path} needs a reason`).toBeGreaterThanOrEqual(40)
      expect(e.rules.length).toBeGreaterThan(0)
    }
  })

  it('every rule an exception is granted is actually USED by that file (no unused permission)', () => {
    for (const e of EXCEPTIONS) {
      const f = files.find(x => x.path === e.path)!
      const probe = findViolations([f], []) // with NO exceptions: which rules does this file trip?
      const used = new Set<string>()
      for (const v of probe) used.add(v.includes('Serper host') ? 'host' : v.includes('X-API-KEY') ? 'header' : v.includes('SERPER_API_KEY') ? 'key' : 'direct')
      for (const r of e.rules) expect(used.has(r), `${e.path} is granted "${r}" but does not use it`).toBe(true)
    }
  })

  it('the door really contains what the list says it does (host, header, key-free fetch)', () => {
    const door = files.find(f => f.path === DOOR)!.text
    expect(door).toMatch(/https:\/\/google\.serper\.dev\//)
    expect(door).toMatch(/'X-API-KEY'/)
    expect(door.split('\n').filter(l => !isComment(l)).join('\n').match(/\bfetch\(/g)?.length).toBe(1) // exactly one network call in the door (comments do not count)
  })

  it('every non-replay reader of SERPER_API_KEY also uses serperPost, and none of them sets a header or calls fetch with a Serper URL', () => {
    for (const e of EXCEPTIONS.filter(x => x.rules.includes('key') && !x.rules.includes('header') && x.path.startsWith('src/'))) {
      const text = files.find(f => f.path === e.path)!.text
      const code = text.split('\n').filter(l => !isComment(l)).join('\n') // doc comments may name the header; code may not
      expect(text, e.path).toMatch(/serperPost\(/)
      expect(code, e.path).not.toMatch(/x-api-key/i)
    }
  })

  describe('the rules fire on synthetic offenders (so the scan is not vacuous)', () => {
    const bad = (path: string, text: string): string[] => findViolations([{ path, text }])
    it('the Serper host in a new file, even in a comment', () => {
      expect(bad('src/lib/evil.ts', "const r = await fetch('https://google.serper.dev/search', { method: 'POST' })")).not.toEqual([])
      expect(bad('src/lib/evil.ts', '// copy of https://google.serper.dev/search')).not.toEqual([])
      expect(bad('scripts/x.mjs', 'const u = "serper.dev"')).not.toEqual([])
    })
    it('the X-API-KEY header in a new file (a comment naming it is allowed)', () => {
      expect(bad('src/lib/evil.ts', "headers: { 'X-API-KEY': k }")).not.toEqual([])
      expect(bad('src/lib/ok.ts', ' * the provider wants an X-API-KEY header')).toEqual([])
      expect(bad('src/lib/ok.ts', '// X-API-KEY header goes through serperPost')).toEqual([])
    })
    it('a block comment in front of the code does not hide it; a line that is only a comment is still allowed', () => {
      expect(bad('src/lib/evil.ts', "/* x */ headers: { 'X-API-KEY': k }")).not.toEqual([])
      expect(bad('src/lib/evil.ts', '/**/ const k = process.env.SERPER_API_KEY')).not.toEqual([])
      expect(bad('src/lib/evil.ts', '/* a */ /* b */ const k = process.env.SERPER_API_KEY')).not.toEqual([])
      expect(bad('src/lib/ok.ts', '/* the X-API-KEY header goes through serperPost */')).toEqual([])
      expect(bad('src/lib/ok.ts', ' * SERPER_API_KEY is read in one place')).toEqual([])
    })
    it('a new reader of SERPER_API_KEY', () => {
      expect(bad('src/lib/evil.ts', 'const k = process.env.SERPER_API_KEY')).not.toEqual([])
      expect(bad('src/lib/ok.ts', '// uses SERPER_API_KEY')).toEqual([])
    })
    it('a direct call on a line that names Serper', () => {
      expect(bad('src/lib/evil.ts', "const r = await fetch(serperUrl, { body })")).not.toEqual([])
      expect(bad('src/lib/evil.ts', "import axios from 'axios'; axios.post(serperBase, b)")).not.toEqual([])
    })
    it('an exception without the matching rule does not excuse another rule', () => {
      const onlyKey: Exception[] = [{ path: 'src/lib/k.ts', rules: ['key'], reason: 'x'.repeat(50) }]
      expect(findViolations([{ path: 'src/lib/k.ts', text: 'const k = process.env.SERPER_API_KEY' }], onlyKey)).toEqual([])
      expect(findViolations([{ path: 'src/lib/k.ts', text: "headers: { 'X-API-KEY': k }" }], onlyKey)).not.toEqual([])
    })
    it('[known limit] a host assembled from pieces is NOT caught by this scan (stated, not hidden)', () => {
      expect(bad('src/lib/sneaky.ts', "const h = 'google.' + 'serper' + '.dev'")).toEqual([])
    })
  })
})
