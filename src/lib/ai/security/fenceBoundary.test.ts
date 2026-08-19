import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { UNTRUSTED_SOURCES } from './fence'

// ── P3-S2 architecture guards ────────────────────────────────────────────────
//
// Small, specific, non-vacuous. These pin the three things that make the fence
// an architecture rather than a helper somebody happened to call: it is the ONE
// implementation, it is PURE, and every untrusted producer actually routes
// through it.

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
const code = (f: string) => strip(readFileSync(f, 'utf8'))

const FENCE = 'src/lib/ai/security/fence.ts'

/** Every producer that concatenates an untrusted value into a prompt string,
 *  as established by the S2 data-flow trace. */
const PRODUCERS: Array<[string, string]> = [
  ['memory', 'src/lib/memory/memoryService.ts'],
  ['stored preferences + GPS label', 'src/lib/ai/promptBuilder.ts'],
  ['calendar events', 'src/lib/integrations/googleCalendar.ts'],
  ['client preferences', 'src/app/api/chat/route.ts'],
]

describe('the fence is the single implementation', () => {
  it.each(PRODUCERS)('%s imports the shared fence rather than rolling its own', (_n, file) => {
    expect(code(file)).toMatch(/import\s*\{[^}]*fenceUntrusted[^}]*\}\s*from\s*'[^']*security\/fence'/)
  })

  it.each(PRODUCERS)('%s calls the fence at least once', (_n, file) => {
    expect((code(file).match(/fenceUntrusted\(/g) || []).length).toBeGreaterThan(0)
  })

  it('no second fencing implementation exists', () => {
    // A competing local implementation is how a boundary quietly develops a gap.
    for (const [, file] of PRODUCERS) {
      const src = code(file)
      expect(src).not.toMatch(/function\s+fence\w*\s*\(/)
      expect(src).not.toContain('UNTRUSTED_DATA')
    }
  })

  it('every declared source label is actually used by a producer', () => {
    const all = PRODUCERS.map(([, f]) => code(f)).join('\n')
    for (const source of UNTRUSTED_SOURCES) {
      expect(all, `source "${source}" is declared but never applied`).toContain(`'${source}'`)
    }
  })
})

describe('the fence function is pure', () => {
  const src = code(FENCE)

  it('the file is actually being read', () => {
    expect(src).toContain('export function fenceUntrusted')
    expect(src.length).toBeGreaterThan(500)
  })

  it.each([
    ['environment access', /process\.env/],
    ['the clock', /new Date\(|Date\.now/],
    ['randomness', /Math\.random|crypto\./],
    ['network I/O', /\bfetch\(|XMLHttpRequest/],
    ['asynchrony', /\basync\b|\bawait\b/],
    ['a model call', /AI\.|generateText|streamText/],
    ['console output', /console\./],
  ])('contains no %s', (_what, pattern) => {
    expect(pattern.test(src)).toBe(false)
  })

  it('imports nothing at all — it depends on no provider and no framework', () => {
    expect(src).not.toMatch(/^\s*import\b/m)
  })

  it('carries no provider-specific branch', () => {
    for (const vendor of ['anthropic', 'claude', 'openai', 'gemini', 'deepseek']) {
      expect(src.toLowerCase()).not.toContain(vendor)
    }
  })
})

describe('untrusted values do not reach the cached prefix', () => {
  const pb = code('src/lib/ai/promptBuilder.ts')

  it('shared is still assembled only from module-scope constants', () => {
    const line = pb.split(/\r?\n/).find(l => l.includes('const shared = '))
    expect(line).toBeDefined()
    // No interpolation of anything request-shaped: the only ${...} allowed are
    // the static block constants.
    for (const forbidden of ['memoryBlock', 'prefBlock', 'gpsBlock', 'userLocation', 'fenceUntrusted']) {
      expect(line, `shared must not interpolate ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('the fenced spans are interpolated into dynamic', () => {
    const line = pb.split(/\r?\n/).find(l => l.includes('const dynamic = '))
    expect(line).toBeDefined()
    expect(line).toContain('memoryBlock')
    expect(line).toContain('prefBlock')
    expect(line).toContain('gpsBlock')
  })
})

describe('the client cannot bypass the fence', () => {
  it('the route fences its preference items rather than interpolating them raw', () => {
    const route = code('src/app/api/chat/route.ts')
    expect(route).toMatch(/fenceUntrusted\('user_preferences',/)
    // The raw join must not appear outside the fence call.
    const rawJoin = /\$\{rawPrefsArr\.map\([^)]*\)\.join\('\\n'\)\}/
    expect(rawJoin.test(route)).toBe(false)
  })

  it('P3-S1 validation still runs before any fencing', () => {
    const route = code('src/app/api/chat/route.ts')
    expect(route.indexOf('validateClientInput(')).toBeLessThan(route.indexOf('fenceUntrusted('))
  })
})
