import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// 12/11/2026, found by actually starting the UAT server: researchContracts.ts imported 'node:crypto', and deepResearch.ts (imported by the CLIENT component ChatInterface for the charts) pulled it into
// the browser bundle, so /chat answered 500 "UnhandledSchemeError". Unit tests never see a bundler. This guard walks the relative-import closure of deepResearch.ts inside src/lib/ai/research and
// refuses any Node-only module there (node: scheme, fs, path, crypto, child_process ...): anything the client component can reach must be browser-safe.

const DIR = join(process.cwd(), 'src/lib/ai/research')
const NODE_ONLY = /from\s+['"](node:[^'"]+|fs|path|crypto|os|child_process|stream|zlib|net|http|https|worker_threads)['"]/

function closure(entry: string): string[] {
  const seen = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = readFileSync(join(DIR, file), 'utf8')
    for (const m of src.matchAll(/(?:from|import)\s+['"]\.\/([A-Za-z0-9_.-]+)['"]/g)) {
      const next = `${m[1]}.ts`
      if (existsSync(join(DIR, next)) && !/\.test\.ts$/.test(next)) walk(next)
    }
  }
  walk(entry)
  return [...seen]
}

describe('what the client component can reach from deepResearch.ts is browser-safe', () => {
  const files = closure('deepResearch.ts')
  it('the closure is the engine and its helpers (guards against walking nothing)', () => {
    expect(files.length).toBeGreaterThan(10)
    for (const f of ['deepResearch.ts', 'contractsRun.ts', 'researchContracts.ts', 'thesisReport.ts', 'evidenceCards.ts']) expect(files, f).toContain(f)
  })
  it('no file in it imports a Node-only module', () => {
    const bad = files.filter(f => NODE_ONLY.test(readFileSync(join(DIR, f), 'utf8')))
    expect(bad).toEqual([])
  })
})
