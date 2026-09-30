/**
 * security-audit L2 — the service-role client cannot end up in a browser bundle.
 *
 * `lib/supabase/admin.ts` imports 'server-only', which Next.js resolves per bundling layer and turns
 * into a BUILD error when reached from client code. These tests pin that the guard is in place and
 * that nothing marked 'use client' imports the admin client directly. That admin.ts is the ONLY
 * place a service-role client is built is already pinned by admin.test.ts and the Architecture
 * Guard rule no-adhoc-service-role-client.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ADMIN = 'src/lib/supabase/admin.ts'

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })

describe('service-role client is server-only', () => {
  it("admin.ts imports 'server-only' before anything else", () => {
    const firstImport = fs.readFileSync(ADMIN, 'utf8').split('\n').find((l) => l.startsWith('import '))
    expect(firstImport).toBe("import 'server-only'")
  })

  it("no 'use client' file imports the admin client", () => {
    const offenders = walk('src').filter((f) => {
      const s = fs.readFileSync(f, 'utf8')
      return /^\s*['"]use client['"]/.test(s) && /from\s+'@\/lib\/supabase\/admin'/.test(s)
    })
    expect(offenders).toEqual([])
  })

  it('the admin client still loads in server code (tests resolve server-only to its no-op)', async () => {
    const mod = await import('@/lib/supabase/admin')
    expect(typeof mod.createAdminClient).toBe('function')
  })
})
