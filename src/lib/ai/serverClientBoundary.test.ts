// 20/11: a server module (the chat route and everything under lib/ai it calls) must never import a "use client" module: in the server build its functions are placeholders and the call throws
// ("translate is not a function": every plan answer failed), which a unit test cannot see because vitest has no such boundary.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = walk('src/lib/ai').filter(f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))

describe('server modules under lib/ai', () => {
  it('do not import the client-only translation hook module', () => {
    const offenders = files.filter(f => /from\s+['"]@\/lib\/i18n\/useTranslation['"]/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
  it('do not import a "use client" component or hook module', () => {
    const clientFiles = ['src/components', 'src/hooks'].flatMap(d => { try { return walk(d) } catch { return [] } }).filter(f => /\.(ts|tsx)$/.test(f) && /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8').slice(0, 200)))
    const keys = clientFiles.map(f => f.replace(/\\/g, '/').replace(/^src\//, '@/').replace(/\.(ts|tsx)$/, ''))
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/^import\s+(?!type\b)[^'"]*from\s+['"](@\/(?:components|hooks)\/[^'"]+)['"]/gm)) if (keys.includes(m[1])) bad.push(`${f} -> ${m[1]}`)
    }
    expect(bad).toEqual([])
  })
})
