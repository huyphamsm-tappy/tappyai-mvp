// @vitest-environment node
// Round 2d · STATIC SCAN: no route to Serper around `serperPost`. MOCK-ONLY (reads source text, opens no socket).
//
// What it proves: in the NON-TEST source of src/ and scripts/ (ts, tsx, mjs, js, cjs), the Serper hostname, Serper's auth header and the Serper API key
// appear only where this file's list says they may, each with a reason. A new file that names the host, sets the header, or reads the key FAILS the test.
//
// What it does NOT prove (stated, not hidden): a comment marker inside a string or regex literal can hide the rest of a line (or file) from the key / header / direct
// rules (the host rule reads raw lines and is not fooled); a URL assembled from pieces ('google.' + 'serper' + '.dev'), a call through an external library or
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
  { path: 'scripts/uat/consultUat/liveTrial.ts', rules: ['host'], reason: 'The live-trial core (scripts/ only, never loaded by the app): it NAMES google.serper.dev in the allow-list of hosts its fetch wrapper lets through and in its request counters. It builds no Serper URL, sets no header, reads no key and sends nothing itself: every request still goes through serperPost and the spend gate.' },
  { path: 'scripts/uat/consultUat/liveRunner.ts', rules: ['key'], reason: 'The benchmark runner (scripts/ only): redactSecrets NAMES SERPER_API_KEY (and OPENAI_API_KEY) to read their values from the env object it is given and REMOVE them from text before it is written or shown. It sends nothing with the key and never writes the value.' },
  { path: 'scripts/uat/consultUat/liveTrialLauncher.mjs', rules: ['key'], reason: 'The launcher of the live trial (scripts/ only, run by the Owner with plain node): it NAMES SERPER_API_KEY (and OPENAI_API_KEY) to pass the variable on to the child process it starts and to REMOVE the value from the child output before anything is printed or written. It sends no request, sets no header and never prints or writes the value.' },
  { path: 'src/lib/ai/tools/common.ts', rules: ['key'], reason: 'Reads SERPER_API_KEY and hands it ONLY to serperPost (images, search, shopping); it sets no header and opens no connection of its own.' },
  { path: 'src/lib/ai/tools/serperPlaces.ts', rules: ['key'], reason: 'Reads SERPER_API_KEY and hands it ONLY to serperPost (maps); no header, no connection of its own.' },
  { path: 'src/app/api/cron/price-check/route.ts', rules: ['key'], reason: 'Cron route (not on the chat path): reads SERPER_API_KEY and hands it ONLY to serperPost (search, num 5).' },
  { path: 'scripts/consult/replay/lib/env.ts', rules: ['key'], reason: 'Replay tool (opt-in): copies SERPER_API_KEY from the audit env file into process.env for the replay run; it makes no request.' },
  { path: 'scripts/uat/consultUat/liveRunner.testkit.ts', rules: ['key'], reason: 'Test helper: only NAMES SERPER_API_KEY in the list of variables the tests clear (applyEnv); it reads no value and makes no request.' },
]

const NAMES = { host: /serper\.dev/i, header: /x-api-key/i, key: /SERPER_API_KEY/ }
/** A direct network call on a line that also mentions Serper by name (fetch and its wrappers, axios, undici, got, ky, ofetch, $fetch, node:http(s) get/request). */
const DIRECT = /(\b(?:o|\$)?fetch\s*\(|\baxios\b|\bundici\b|\bhttps?\.(?:request|get)\s*\(|\bgot(?:\.\w+)?\s*\(|\bky(?:\.\w+)?\s*\()/

/**
 * The CODE of each line of a file: block comments (also over several lines, also closed in the middle of a line) and `//` comments are removed.
 * A `//` right after a colon (a URL) is not a comment. This is a small scanner, not a parser: a comment marker inside a string literal can fool it.
 */
export function codeLines(text: string): string[] {
  let inBlock = false
  return text.split('\n').map(line => {
    let out = ''
    let i = 0
    while (i < line.length) {
      if (inBlock) {
        const j = line.indexOf('*/', i)
        if (j < 0) return out
        inBlock = false; i = j + 2; out += ' '; continue
      }
      if (line.startsWith('/*', i)) { inBlock = true; i += 2; continue }
      if (line.startsWith('//', i) && line[i - 1] !== ':') return out
      out += line[i++]
    }
    return out
  })
}

export interface Violation { rule: Exception['rules'][number]; at: string; message: string }

/** Violations of the rules in a set of files. Pure: tests it on synthetic files as well as on the real tree. */
export function findViolations(files: SourceFile[], exceptions: Exception[] = EXCEPTIONS): Violation[] {
  const allowed = (path: string, rule: Exception['rules'][number]) => exceptions.some(e => e.path === path && e.rules.includes(rule))
  const out: Violation[] = []
  for (const f of files) {
    const raw = f.text.split('\n')
    const code = codeLines(f.text)
    raw.forEach((line, i) => {
      const at = `${f.path}:${i + 1}`
      const push = (rule: Violation['rule'], what: string) => out.push({ rule, at, message: `${at} ${what}: ${line.trim().slice(0, 120)}` })
      // the hostname is forbidden EVERYWHERE outside the list, comments included (a comment naming it is how a copy-pasted fetch starts)
      if (NAMES.host.test(line) && !allowed(f.path, 'host')) push('host', 'names the Serper host outside the allowed list')
      const c = code[i]
      if (NAMES.header.test(c) && !allowed(f.path, 'header')) push('header', 'sets or names the X-API-KEY header outside the allowed list')
      if (NAMES.key.test(c) && !allowed(f.path, 'key')) push('key', 'reads SERPER_API_KEY outside the allowed list')
      if (/serper/i.test(c) && DIRECT.test(c) && !allowed(f.path, 'direct')) push('direct', 'makes a direct network call on a line that names Serper')
    })
  }
  return out
}

const ROOT = join(__dirname, '..', '..', '..')
/** Skipped by NAME at any depth: dependency and build folders only. */
const SKIP_NAMES = new Set(['node_modules', '.next', '.git'])
/** Skipped by ROOT-RELATIVE path: the one recordings folder (JSON answers recorded from Serper; no code). */
const SKIP_PATHS = new Set(['scripts/consult/replay/recordings'])
export const shouldSkipDir = (relPath: string): boolean => SKIP_NAMES.has(relPath.split('/').pop() ?? '') || SKIP_PATHS.has(relPath)
export const SCAN_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const TESTISH = /\.test\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$|\.testkit\.ts$/
export function readTree(roots: string[], keepTests = false): SourceFile[] {
  const files: SourceFile[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const rel = relative(ROOT, p).split(sep).join('/')
      const st = statSync(p)
      if (st.isDirectory()) { if (!shouldSkipDir(rel)) walk(p); continue }
      if (!SCAN_EXT.test(name) || (!keepTests && TESTISH.test(name) && name !== 'liveRunner.testkit.ts')) continue
      files.push({ path: rel, text: readFileSync(p, 'utf8') })
    }
  }
  for (const r of roots) walk(join(ROOT, r))
  return files
}

describe('static scan of src/ and scripts/: a tripwire for the NORMAL ways around serperPost (not a proof that none exists)', () => {
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
      for (const v of probe) used.add(v.rule)
      for (const r of e.rules) expect(used.has(r), `${e.path} is granted "${r}" but does not use it`).toBe(true)
    }
  })

  it('the door really contains what the list says it does (host, header, key-free fetch)', () => {
    const door = files.find(f => f.path === DOOR)!.text
    expect(door).toMatch(/https:\/\/google\.serper\.dev\//)
    expect(door).toMatch(/'X-API-KEY'/)
    expect(codeLines(door).join('\n').match(/\bfetch\(/g)?.length).toBe(1) // exactly one network call in the door (comments do not count)
  })

  it('every src/ reader of SERPER_API_KEY that is not the door passes it to serperPost, and its CODE never names the X-API-KEY header (comments may)', () => {
    for (const e of EXCEPTIONS.filter(x => x.rules.includes('key') && !x.rules.includes('header') && x.path.startsWith('src/'))) {
      const text = files.find(f => f.path === e.path)!.text
      expect(text, e.path).toMatch(/serperPost\(/)
      expect(codeLines(text).join('\n'), e.path).not.toMatch(/x-api-key/i)
    }
  })

  describe('the rules fire on synthetic offenders (so the scan is not vacuous)', () => {
    const bad = (path: string, text: string): Violation[] => findViolations([{ path, text }])
    it('the Serper host in a new file, even in a comment', () => {
      expect(bad('src/lib/evil.ts', "const r = await fetch('https://google.serper.dev/search', { method: 'POST' })")).not.toEqual([])
      expect(bad('src/lib/evil.ts', '// copy of https://google.serper.dev/search')).not.toEqual([])
      expect(bad('scripts/x.mjs', 'const u = "serper.dev"')).not.toEqual([])
    })
    it('the X-API-KEY header in a new file (a comment naming it is allowed)', () => {
      expect(bad('src/lib/evil.ts', "headers: { 'X-API-KEY': k }")).not.toEqual([])
      expect(bad('src/lib/ok.ts', '/**\n * the provider wants an X-API-KEY header\n */')).toEqual([])
      expect(bad('src/lib/ok.ts', '// X-API-KEY header goes through serperPost')).toEqual([])
    })
    it('a block comment in front of the code does not hide it; a line that is only a comment is still allowed', () => {
      expect(bad('src/lib/evil.ts', "/* x */ headers: { 'X-API-KEY': k }")).not.toEqual([])
      expect(bad('src/lib/evil.ts', '/**/ const k = process.env.SERPER_API_KEY')).not.toEqual([])
      expect(bad('src/lib/evil.ts', '/* a */ /* b */ const k = process.env.SERPER_API_KEY')).not.toEqual([])
      expect(bad('src/lib/ok.ts', '/* the X-API-KEY header goes through serperPost */')).toEqual([])
      expect(bad('src/lib/ok.ts', '/**\n * SERPER_API_KEY is read in one place\n */')).toEqual([])
    })
    it('[review A4] a block comment CLOSED at the start of a line does not hide the code after it', () => {
      expect(bad('src/lib/evil.ts', '/* note\n*/ const k = process.env.SERPER_API_KEY')).not.toEqual([])
      expect(bad('src/lib/evil.ts', "/**\n * note\n */ headers: { 'X-API-KEY': k }")).not.toEqual([])
      expect(bad('src/lib/ok.ts', '/* note\n   still the comment\n*/')).toEqual([])
    })
    it('[review A6] a violation names its rule (not guessed from its message text)', () => {
      expect(findViolations([{ path: 'src/lib/evil.ts', text: 'const k = process.env.SERPER_API_KEY' }])).toMatchObject([{ rule: 'key' }])
      expect(findViolations([{ path: 'src/lib/evil.ts', text: "headers: { 'X-API-KEY': k }" }])).toMatchObject([{ rule: 'header' }])
      expect(findViolations([{ path: 'src/lib/evil.ts', text: "const u = 'https://google.serper.dev/x'" }])).toMatchObject([{ rule: 'host' }])
      // a direct call whose text happens to contain the key's NAME is still reported under BOTH rules, each under its own label
      const both = findViolations([{ path: 'src/lib/evil.ts', text: 'await fetch(serperUrl, { k: SERPER_API_KEY })' }]).map(v => v.rule).sort()
      expect(both).toEqual(['direct', 'key'])
    })
    it('[review A5] more direct-call forms are recognised on a line that names Serper', () => {
      for (const call of ['ofetch(serperUrl)', '$fetch(serperUrl)', 'http.get(serperUrl)', 'ky(serperUrl)', 'ky.post(serperUrl)', 'https.get(serperUrl)', 'got.post(serperUrl)']) {
        expect(bad('src/lib/evil.ts', `await ${call}`), call).not.toEqual([])
      }
    })
    it('[review A5] the scan reads .mts / .cts / .jsx as well', () => {
      for (const name of ['a.ts', 'a.tsx', 'a.mjs', 'a.js', 'a.cjs', 'a.mts', 'a.cts', 'a.jsx']) expect(SCAN_EXT.test(name), name).toBe(true)
      expect(SCAN_EXT.test('a.json')).toBe(false)
    })
    it('[review A3] directories are skipped by their ROOT-RELATIVE path: only node_modules / .next / .git by name, and the one recordings folder by path', () => {
      for (const p of ['node_modules', 'src/x/node_modules', '.next', '.git', 'scripts/consult/replay/recordings']) expect(shouldSkipDir(p), p).toBe(true)
      for (const p of ['src/app/api/recordings', 'src/lib/out', 'scripts/out', 'src/lib/coverage', 'recordings']) expect(shouldSkipDir(p), p).toBe(false)
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
