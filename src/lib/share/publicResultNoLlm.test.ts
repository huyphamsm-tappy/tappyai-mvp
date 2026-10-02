import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE COST RULE, AS A TEST. A public shared-result view must not be able to
// call a model. Rather than trusting a comment, this walks the import graph
// of everything under /r/[slug] (page, view, client, OG route) and the share
// library, and fails if any of it reaches a model client, the chat route, the
// tool layer, or user memory. The follow-up box is the ONE sanctioned path to
// inference, and it goes through `/api/chat` over HTTP — never an import.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT)

const FORBIDDEN_IMPORTS: RegExp[] = [
  /@ai-sdk\/anthropic/,
  /from '@\/lib\/ai\/(?!consultative\/synthesisView'|security\/)/, // only the marker parser (a pure projection) is allowed
  /from 'ai'(?!\/react)/,
  /streamText|generateText|generateObject/,
  /@\/lib\/memory/,
  /@\/lib\/ai\/tools/,
  /@\/lib\/preferences/,
  /userMemory/,
  /@\/app\/api\/chat/,
]

const ALLOWED_AI_IMPORTS = new Set([
  "@/lib/ai/consultative/synthesisView", // parseShoppingMarker: regex + JSON.parse, no model
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p)
  }
  return out
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])
}

const PUBLIC_SURFACE = [
  ...walk(join(SRC, 'app', 'r')),
  ...walk(join(SRC, 'lib', 'share')),
]

describe('public shared result — no LLM by construction', () => {
  it('covers the files it claims to', () => {
    const names = PUBLIC_SURFACE.map(f => f.replace(/\\/g, '/'))
    expect(names.some(n => n.endsWith('app/r/[slug]/page.tsx'))).toBe(true)
    expect(names.some(n => n.endsWith('app/r/[slug]/og.png/route.tsx'))).toBe(true)
    expect(names.some(n => n.endsWith('lib/share/publicSanitizer.ts'))).toBe(true)
  })

  for (const file of PUBLIC_SURFACE) {
    const rel = file.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/')
    it(`${rel} imports nothing that can reach a model, memory or the tool layer`, () => {
      const src = readFileSync(file, 'utf8')
      for (const imp of importsOf(file)) {
        if (imp.startsWith('@/lib/ai/')) expect(ALLOWED_AI_IMPORTS.has(imp), `${rel} imports ${imp}`).toBe(true)
      }
      for (const re of FORBIDDEN_IMPORTS) {
        // `from '@/lib/ai/consultative/synthesisView'` is the one allowed hit; the regex excludes it.
        expect(re.test(src), `${rel} matches ${re}`).toBe(false)
      }
    })
  }

  it('the page is ISR-cached and renders from the store, not a live pipeline', () => {
    const page = readFileSync(join(SRC, 'app', 'r', '[slug]', 'page.tsx'), 'utf8')
    expect(page).toMatch(/export const revalidate = \d+/)
    expect(page).toContain("from '@/lib/share/sharedResultStore'")
  })

  it('the sanitizer runs before persistence: the store validates and never sanitizes at render', () => {
    const store = readFileSync(join(SRC, 'lib', 'share', 'sharedResultStore.ts'), 'utf8')
    expect(store).toContain('validateSharedResultPayload(input.payload)')
    expect(store).not.toContain('buildPublicPayload')
  })

  it('the store is never imported by a client component', () => {
    const all = walk(join(SRC, 'app')).concat(walk(join(SRC, 'components')))
    for (const f of all) {
      const src = readFileSync(f, 'utf8')
      if (src.startsWith("'use client'") && src.includes('@/lib/share/sharedResultStore')) {
        throw new Error(`${f} is a client component importing the service-role store`)
      }
    }
  })
})
