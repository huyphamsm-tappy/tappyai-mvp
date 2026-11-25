import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Same guard as src/lib/ai/research/clientBundleSafe.test.ts (12/11/2026: a Node-only import reached the browser bundle and /chat answered 500). Anything under src/lib/context may be imported by a
// client component, so the import closure of this folder (relative imports AND the '@/' imports it makes, transitively) must be free of Node-only modules.

const SRC = join(process.cwd(), 'src')
const DIR = join(SRC, 'lib/context')
const NODE_ONLY = /from\s+['"](node:[^'"]+|fs|path|crypto|os|child_process|stream|zlib|net|http|https|worker_threads|server-only)['"]/
const REQUIRE_NODE = /require\(\s*['"](node:[^'"]+|fs|path|crypto|os|child_process)['"]\s*\)/

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? join(from, '..', spec) : null
  if (!base) return null
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c)) return c
  return null
}

function closure(entries: string[]): string[] {
  const seen = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, m[1])
      if (next && !/\.test\.tsx?$/.test(next)) walk(next)
    }
  }
  entries.forEach(walk)
  return [...seen]
}

describe('what a client component can reach from src/lib/context is browser-safe', () => {
  const entries = readdirSync(DIR).filter(f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\.cases\.ts$/.test(f)).map(f => join(DIR, f))
  const files = closure(entries)
  it('the closure is the context files plus the pure helpers they reuse (guards against walking nothing)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(6)
    for (const f of ['lib/context/canonicalContext.ts', 'lib/context/geoGazetteer.ts', 'lib/ai/intent.ts', 'lib/market/marketGate.ts']) expect(files.map(x => x.replace(/\\/g, '/')).some(x => x.endsWith(f)), f).toBe(true)
  })
  it('no file in it imports a Node-only module', () => {
    const bad = files.filter(f => NODE_ONLY.test(readFileSync(f, 'utf8')) || REQUIRE_NODE.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
