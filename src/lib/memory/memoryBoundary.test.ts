import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { MEMORY_FIELDS } from './memoryContract'

// ── P3-S3 architecture guards ────────────────────────────────────────────────
//
// Non-vacuous and specific. These pin the two properties that make memory
// persistence a boundary: it is SINGULAR (no bypass), and the validator it
// depends on is pure.

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
const code = (f: string) => strip(readFileSync(f, 'utf8'))

const SERVICE = 'src/lib/memory/memoryService.ts'
const CONTRACT = 'src/lib/memory/memoryContract.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const rel = (f: string) => relative(SRC, f).split('\\').join('/')
const FILES = walk(SRC)
  .map(f => ({ path: `src/${rel(f)}`, body: strip(readFileSync(f, 'utf8')) }))
  .filter(f => !/\.test\.tsx?$/.test(f.path))

describe('S-00 · the guard is not vacuous', () => {
  it('scans a real slice of src/', () => {
    expect(FILES.length).toBeGreaterThan(50)
  })

  it('sees the memory service itself', () => {
    expect(FILES.some(f => f.path === SERVICE)).toBe(true)
    expect(FILES.find(f => f.path === SERVICE)!.body).toContain('updateMemory')
  })
})

describe('MEM-11 · persistence is singular — nothing bypasses the boundary', () => {
  /** Any write verb applied to the memory table, anywhere in src/. */
  const WRITE = /from\(\s*['"]user_memory['"]\s*\)\s*\.\s*(upsert|insert|update|delete)/

  it('only memoryService touches user_memory with a write verb', () => {
    const offenders = FILES.filter(f => WRITE.test(f.body)).map(f => f.path)
    expect(offenders).toEqual([SERVICE])
  })

  it('the pattern is live — it matches a real write in the service', () => {
    // Guards that match nothing pass forever. Prove this one fires.
    expect(WRITE.test(FILES.find(f => f.path === SERVICE)!.body)).toBe(true)
  })

  it('exactly one upsert exists in the service', () => {
    const body = code(SERVICE)
    expect((body.match(/\.upsert\(/g) || []).length).toBe(1)
  })
})

describe('MEM-01/02 · the boundary sanitises and pins ownership', () => {
  const body = code(SERVICE)

  it('updateMemory runs the candidate through the canonical sanitiser', () => {
    expect(body).toMatch(/const\s+patch\s*=\s*sanitizeMemoryPatch\(\s*newData\s*\)/)
  })

  it('the sanitiser is imported, not re-implemented locally', () => {
    expect(body).toMatch(/import\s*\{[^}]*sanitizeMemoryPatch[^}]*\}\s*from\s*'\.\/memoryContract'/)
    expect(body).not.toMatch(/function\s+sanitize\w*\s*\(/)
  })

  it('user_id is written AFTER the patch is spread', () => {
    // `{ user_id, ...patch }` would let a candidate field override ownership.
    const upsertArgs = body.slice(body.indexOf('.upsert('), body.indexOf('onConflict'))
    const spreadAt = upsertArgs.indexOf('...patch')
    const ownerAt = upsertArgs.indexOf('user_id:')
    expect(spreadAt).toBeGreaterThan(-1)
    expect(ownerAt).toBeGreaterThan(spreadAt)
  })

  it('the raw candidate is never spread into the row', () => {
    expect(body).not.toContain('...newData')
  })

  it('a write without a server identity is refused', () => {
    expect(body).toMatch(/typeof\s+userId\s*!==\s*'string'/)
  })
})

describe('the validator is pure', () => {
  const body = code(CONTRACT)

  it('the contract file is actually being read', () => {
    expect(body).toContain('export function sanitizeMemoryPatch')
    expect(body.length).toBeGreaterThan(500)
  })

  it.each([
    ['environment access', /process\.env/],
    ['the clock', /new Date\(|Date\.now/],
    ['randomness', /Math\.random|crypto\./],
    ['network I/O', /\bfetch\(|XMLHttpRequest/],
    ['asynchrony', /\basync\b|\bawait\b/],
    ['a model call', /AI\.|generateText|streamText/],
    ['a database client', /supabase|createClient|createAdminClient/i],
  ])('contains no %s', (_what, pattern) => {
    expect(pattern.test(body)).toBe(false)
  })

  it('imports nothing — no provider, no framework, no database', () => {
    expect(body).not.toMatch(/^\s*import\b/m)
  })

  it('carries no provider-specific branch', () => {
    for (const vendor of ['anthropic', 'claude', 'openai', 'gemini', 'deepseek']) {
      expect(body.toLowerCase()).not.toContain(vendor)
    }
  })
})

describe('the persisted field set cannot silently grow', () => {
  it('names no ownership, identity or trust column', () => {
    for (const f of MEMORY_FIELDS) {
      expect(f).not.toMatch(/^(id|user_?id|owner|account|trust|role|source|provider|model|created_at|updated_at)$/i)
    }
  })

  it('every named field is one the memory block or a known consumer reads', () => {
    const consumers = [code(SERVICE), code('src/lib/ai/contextBuilder.ts')].join('\n')
    for (const f of MEMORY_FIELDS) {
      expect(consumers, `${f} is persisted but nothing reads it`).toContain(f)
    }
  })
})
