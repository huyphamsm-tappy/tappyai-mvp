// 04/11/2026 (Owner): the SuperTux game is removed. It shipped a 1 MB WASM runtime, its own service worker, two COOP/COEP header rules and
// 'wasm-unsafe-eval' in the CSP - all surface the app does not need. This keeps it from coming back by accident.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('SuperTux is gone', () => {
  it('has no files, routes or pages', () => {
    for (const p of ['public/games', 'public/games/supertux', 'public/games/supertux-sw.js', 'src/app/games', 'src/app/(app)/game']) {
      expect(existsSync(join(root, p)), p).toBe(false)
    }
  })

  it('is not mentioned by the middleware, the Vercel config or the Next config', () => {
    for (const f of ['middleware.ts', 'vercel.json']) expect(read(f).toLowerCase(), f).not.toContain('supertux')
    const cfg = read('next.config.mjs')
    expect(cfg).not.toContain("source: '/game/supertux'")
    expect(cfg).not.toMatch(/script-src[^\n]*wasm-unsafe-eval/)
  })
})
