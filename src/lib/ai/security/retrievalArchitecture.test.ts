import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ── P3-S4 architecture guard ─────────────────────────────────────────────────
//
// retrievalBoundary.test.ts proves the boundary holds for the payloads it
// tries. This file proves something a payload test cannot: that there is no
// SECOND way in. It scans production source — never fixtures, never itself —
// for the shapes that would let retrieved content acquire authority:
//
//   G1  become markup            — a markdown token built without the sanitiser
//   G2  become instructions      — tool/enrichment code emitting a system role
//   G3  steer the router         — routing signals derived from retrieved data
//   G4  reach the provider       — tool/enrichment code setting provider options
//   G5  bypass the boundary      — a second URL sanitiser competing with the one
//
// A scan-based guard fails open: wrong root, empty bodies, a regex that never
// matches, or a comment-skip that swallows code all pass forever while
// enforcing nothing. S-00 checks each of those before any rule is trusted.

const SRC = resolve(__dirname, '../../..')
const SELF = 'lib/ai/security/retrievalArchitecture.test.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/** Repo-relative, POSIX separators, so assertions read the same on Windows. */
const rel = (f: string) => relative(SRC, f).split('\\').join('/')

/** A full-line comment. Documentation must be able to NAME what it forbids —
 *  the prose above is the rules written down, not a breach of them. Only whole
 *  lines are skipped, so code with a trailing comment is still scanned. */
const isCommentOnly = (line: string) => /^\s*(?:\/\/|\/\*|\*)/.test(line)

/** Tests may legitimately construct hostile markup: that is the payload. The
 *  guard is about what SHIPS, so test files are scanned only where noted. */
const isTest = (p: string) => /\.test\.tsx?$/.test(p) || p.includes('__fixtures__') || p.includes('__measure__')

const FILES = walk(SRC)
  .map(f => ({ path: rel(f), body: readFileSync(f, 'utf8') }))
  .filter(f => f.path !== SELF)

const PROD = FILES.filter(f => !isTest(f.path))

interface Rule {
  name: string
  pattern: RegExp
  appliesTo: (path: string) => boolean
  /** A line that matches `pattern` but is nonetheless correct. */
  allow?: RegExp
}

const AI_LAYER = (p: string) => p.startsWith('lib/ai/')
const RETRIEVAL_LAYER = (p: string) => p.startsWith('lib/ai/tools/') || p === 'lib/ai/streamEnrichment.ts'

const RULES: Rule[] = [
  {
    // G1. A markdown link/image whose destination is an interpolated value.
    // Retrieved URLs are the only reason this layer builds such a token, so the
    // sanitiser must be named on the same line — no "it was cleaned earlier".
    name: 'markdown-destination-must-name-its-sanitiser',
    pattern: /\]\(\$\{/,
    appliesTo: AI_LAYER,
    allow: /sanitizeUrlForMarkdown/,
  },
  {
    // G2. Nothing in the retrieval layer may mint a system/developer turn.
    name: 'retrieval-layer-cannot-emit-a-system-role',
    pattern: /role\s*:\s*['"`](?:system|developer)['"`]/,
    appliesTo: RETRIEVAL_LAYER,
  },
  {
    // G3. Routing must not be steerable by what a search returned. The router
    // is a pure function of RoutingSignals; if a retrieval noun appears in that
    // directory at all, retrieved text has a path to model selection.
    name: 'routing-signals-free-of-retrieved-nouns',
    pattern: /\b(?:search_results|searchResults|snippet|photo_urls|order_links|platform_links|toolResult|tool_result|organic)\b/,
    appliesTo: (p) => p.startsWith('lib/ai/llm/routing/'),
  },
  {
    // G4. Provider options are an authority channel (system prompt, tools,
    // cache control). The retrieval layer has no business touching them.
    name: 'retrieval-layer-cannot-set-provider-options',
    pattern: /\b(?:providerOptions|experimental_providerMetadata|cache_control|cacheControl)\b/,
    appliesTo: RETRIEVAL_LAYER,
  },
  {
    // G5. One sanitiser, one place to audit. A competing local implementation
    // is how a boundary silently develops a second, weaker half.
    name: 'no-competing-url-sanitiser',
    pattern: /%28|%5B|\.replace\([^)]*\\\)[^)]*['"]%/,
    appliesTo: (p) => AI_LAYER(p) && p !== 'lib/ai/tools/common.ts',
  },
]

interface Violation { file: string; line: number; text: string }

function scan(rule: Rule, files = PROD): Violation[] {
  const found: Violation[] = []
  for (const file of files) {
    if (!rule.appliesTo(file.path)) continue
    file.body.split(/\r?\n/).forEach((text, i) => {
      if (isCommentOnly(text)) return
      if (!rule.pattern.test(text)) return
      if (rule.allow?.test(text)) return
      found.push({ file: file.path, line: i + 1, text: text.trim() })
    })
  }
  return found
}

const report = (v: Violation[]) => v.map(x => `${x.file}:${x.line}  ${x.text}`).join('\n')

// ── S-00: the guard is not vacuous ───────────────────────────────────────────

describe('S-00 — the guard is not vacuous', () => {
  it('scans a real, substantial slice of src/', () => {
    expect(FILES.length).toBeGreaterThan(50)
    expect(PROD.length).toBeGreaterThan(50)
  })

  it('reads real file bodies, not empty strings', () => {
    expect(FILES.every(f => f.body.length > 0)).toBe(true)
  })

  it('actually reaches the two files this phase changed', () => {
    for (const p of ['lib/ai/streamEnrichment.ts', 'lib/ai/tools/common.ts']) {
      expect(PROD.some(f => f.path === p), p).toBe(true)
    }
  })

  it('each rule matches at least one directory that exists', () => {
    for (const rule of RULES) {
      expect(PROD.some(f => rule.appliesTo(f.path)), rule.name).toBe(true)
    }
  })

  it('every pattern still matches the shape it is meant to catch', () => {
    const POSITIVE: Record<string, string> = {
      'markdown-destination-must-name-its-sanitiser': 'lines.push(`![x](${url})`)',
      'retrieval-layer-cannot-emit-a-system-role': "messages.push({ role: 'system', content: t })",
      'routing-signals-free-of-retrieved-nouns': 'const n = result.search_results.length',
      'retrieval-layer-cannot-set-provider-options': 'providerOptions: { anthropic: {} },',
      'no-competing-url-sanitiser': "u.replace(/\\(/g, '%28')",
    }
    for (const rule of RULES) {
      const probe = POSITIVE[rule.name]
      expect(probe, `no positive control for ${rule.name}`).toBeTruthy()
      expect(rule.pattern.test(probe), rule.name).toBe(true)
    }
  })

  it('the G1 allowance recognises the compliant form and only that', () => {
    const rule = RULES.find(r => r.name === 'markdown-destination-must-name-its-sanitiser')!
    expect(rule.allow!.test('`![x](${sanitizeUrlForMarkdown(url)})`')).toBe(true)
    expect(rule.allow!.test('`![x](${url})`')).toBe(false)
  })

  it('skips whole-line comments but never code', () => {
    expect(isCommentOnly('// providerOptions: never set here')).toBe(true)
    expect(isCommentOnly(' * the router never sees search_results')).toBe(true)
    expect(isCommentOnly("providerOptions: { anthropic: {} },")).toBe(false)
    expect(isCommentOnly("const x = 1 // providerOptions")).toBe(false)
  })

  it('the production filter excludes tests but keeps real modules', () => {
    expect(isTest('lib/ai/security/retrievalBoundary.test.ts')).toBe(true)
    expect(isTest('lib/ai/__fixtures__/syntheticCandidates.ts')).toBe(true)
    expect(isTest('lib/ai/streamEnrichment.ts')).toBe(false)
    expect(PROD.some(f => f.path.endsWith('.test.ts'))).toBe(false)
  })
})

// ── the rules ────────────────────────────────────────────────────────────────

describe('retrieved content cannot acquire authority', () => {
  it.each(RULES.map(r => [r.name, r] as const))('%s', (_n, rule) => {
    const violations = scan(rule)
    expect(violations, `\n${report(violations)}\n`).toHaveLength(0)
  })

  it('the ONE place that builds markdown from retrieval is the enrichment site', () => {
    // If this count grows, a new injection path exists and G1 must be re-read
    // rather than the number bumped.
    const sites = PROD.flatMap(f =>
      f.body.split(/\r?\n/)
        .map((text, i) => ({ file: f.path, line: i + 1, text }))
        .filter(l => AI_LAYER(l.file) && !isCommentOnly(l.text) && /\]\(\$\{/.test(l.text)))
    expect(sites.map(s => s.file)).toEqual(['lib/ai/streamEnrichment.ts', 'lib/ai/streamEnrichment.ts'])
  })

  it('the sanitisers are exported from exactly one module', () => {
    const owners = PROD.filter(f => /export function (?:sanitizeUrlForMarkdown|escapeMarkdownLabel)\b/.test(f.body))
    expect(owners.map(f => f.path)).toEqual(['lib/ai/tools/common.ts'])
  })
})
