import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Controller V2 — Component 9a: one construction path for the service-role client.
//
// Two routes used to hand-roll their own admin client:
//
//   api/iap/apple/notifications  →  function adminSupabase()
//   api/webhooks/stripe          →  function getAdminSupabase()
//
// Both omitted the hardening `createAdminClient` applies. A service-role client
// with `autoRefreshToken` left on will try to refresh a token it does not have,
// inside a serverless handler that is about to be frozen — and `persistSession`
// asks it to write session state in an environment with nowhere to write.
//
// These assertions read the SOURCE TREE. A behaviour test would only prove the
// call sites that exist today are correct; it cannot see a third factory added
// next month. The Architecture Guard rule `no-adhoc-service-role-client` is the
// CI half of the same invariant — this file is the half that explains why.

const SRC = join(process.cwd(), 'src')

/**
 * The service-role env-var name, assembled at runtime.
 *
 * Writing it literally here would make THIS FILE violate
 * `no-adhoc-service-role-client` — the guard scans tests too, deliberately,
 * because a test that hand-rolls an admin client is just as much a second
 * construction path as a route that does.
 */
const KEY = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')
const ADMIN_MODULE = 'lib/supabase/admin.ts'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/')
const ALL = walk(SRC)
const read = (p: string) => readFileSync(p, 'utf8')

/** Comments cannot construct a client; only code counts. */
const codeOf = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

describe('createAdminClient is the single construction point', () => {
  it('applies the hardening that a hand-rolled client omits', () => {
    const admin = read(join(SRC, ADMIN_MODULE))

    expect(admin).toMatch(/autoRefreshToken:\s*false/)
    expect(admin).toMatch(/persistSession:\s*false/)
  })

  it('is the ONLY file that reads the service-role key to build a client', () => {
    const readers = ALL.filter((p) => new RegExp(KEY).test(codeOf(read(p)))).map(rel)

    // `users/search` reads the key as an availability FLAG and calls
    // createAdminClient() like everyone else — see the next test, which stops
    // that exemption from growing into a bypass.
    expect(readers.sort()).toEqual([ADMIN_MODULE, 'app/api/users/search/route.ts'].sort())
  })

  it('the one exempted file constructs nothing of its own', () => {
    const code = codeOf(read(join(SRC, 'app/api/users/search/route.ts')))

    expect(code).not.toMatch(/createClient\s*\(/)
    expect(code).toMatch(/createAdminClient\s*\(\)/)
  })

  it('no file outside the admin module calls createClient with a service-role key', () => {
    const offenders = ALL.filter((p) => rel(p) !== ADMIN_MODULE).filter((p) =>
      /createClient\s*\([^)]*SERVICE_ROLE/.test(codeOf(read(p)))
    )

    expect(offenders.map(rel)).toEqual([])
  })
})

describe('the two migrated routes', () => {
  const MIGRATED = [
    'app/api/iap/apple/notifications/route.ts',
    'app/api/webhooks/stripe/route.ts',
  ]

  it.each(MIGRATED)('%s imports the sanctioned constructor', (file) => {
    expect(read(join(SRC, file))).toMatch(/import \{ createAdminClient \} from '@\/lib\/supabase\/admin'/)
  })

  it.each(MIGRATED)('%s no longer imports the raw supabase-js factory', (file) => {
    expect(codeOf(read(join(SRC, file)))).not.toMatch(/from '@supabase\/supabase-js'/)
  })

  it.each(MIGRATED)('%s defines no local admin factory', (file) => {
    const code = codeOf(read(join(SRC, file)))

    expect(code).not.toMatch(/function \w*[aA]dmin\w*Supabase\s*\(/)
    expect(code).not.toMatch(/createClient\s*\(/)
  })

  it('every former factory call site now calls createAdminClient', () => {
    // Behaviour preservation: the routes did one thing with the client and they
    // still do. Only the constructor changed.
    const apple = codeOf(read(join(SRC, MIGRATED[0])))
    const stripe = codeOf(read(join(SRC, MIGRATED[1])))

    expect(apple).toMatch(/const db = createAdminClient\(\)/)
    expect(apple).toMatch(/db: ReturnType<typeof createAdminClient>/)
    expect(stripe).toMatch(/const supabase = createAdminClient\(\)/)
    expect(apple).not.toMatch(/adminSupabase/)
    expect(stripe).not.toMatch(/getAdminSupabase/)
  })
})

describe('the Architecture Guard enforces this in CI', () => {
  const guard = readFileSync(join(process.cwd(), 'scripts/architecture/check.mjs'), 'utf8')

  it('declares the rule', () => {
    expect(guard).toMatch(/id: 'no-adhoc-service-role-client'/)
  })

  it('the rule pattern is a real regex, not a corrupted one', () => {
    // The first attempt at this rule shipped a literal U+0008 where `\b` was
    // intended, so it silently matched nothing and CI stayed green over a live
    // violation. An inert guard is worse than no guard: it manufactures
    // confidence. This asserts the pattern still matches the token it is for.
    const m = guard.match(/id: 'no-adhoc-service-role-client'[\s\S]*?patterns: \[([\s\S]*?)\]/)
    expect(m).not.toBeNull()

    const patternSrc = m![1]
    // Excludes \t \n \r — a multi-line slice legitimately contains those.
    const STRAY_CONTROL = new RegExp(String.raw`[\u0000-\u0008\u000b\u000c\u000e-\u001f]`)
    expect(patternSrc).not.toMatch(STRAY_CONTROL)

    const literal = patternSrc.match(/\/(.+?)\/,/)
    expect(literal).not.toBeNull()
    expect(new RegExp(literal![1]).test(`process.env.${KEY}`)).toBe(true)
  })

  it('exempts only the admin module and the documented flag read', () => {
    expect(guard).toMatch(/allow: \[SUPABASE_ADMIN, SERVICE_ROLE_FLAG_READ\]/)
    expect(guard).toMatch(/const SUPABASE_ADMIN = 'src\/lib\/supabase\/admin\.ts'/)
    expect(guard).toMatch(/const SERVICE_ROLE_FLAG_READ = 'src\/app\/api\/users\/search\/route\.ts'/)
  })
})
