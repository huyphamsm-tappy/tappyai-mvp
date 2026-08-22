import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { requestSearchParams, searchParam } from './searchParams'

// ── R01 — a route handler must not require a Next-specific property ─────────
//
// The defect was invisible on either side of a merge. Module 08's suspension tests build a plain
// `new Request(...)` (has `url`, no `nextUrl`) and POST to /api/reviews; on main that handler
// never read `nextUrl`. The Consultative branch added a `?lang=` read to the same handler. Both
// green; the merge threw `TypeError: … reading 'searchParams'` and three SECURITY tests went red.
//
// So the guard is not "does this parse a query string" — it is "can a handler be called with
// either standard Request shape", which is the property that was actually missing.

describe('the URL is read from whichever standard property carries it', () => {
  it('a plain WHATWG Request — the Module 08 harness shape', () => {
    const req = new Request('http://localhost/api/reviews?lang=en', { method: 'POST' })
    expect(searchParam(req, 'lang')).toBe('en')
  })

  it('a NextRequest-shaped mock — the older harness shape in this repo', () => {
    const req = { nextUrl: new URL('http://localhost/api/reviews?lang=vi') }
    expect(searchParam(req, 'lang')).toBe('vi')
  })

  it('a real NextRequest carries both, and they agree', () => {
    // Production shape. The two branches cannot disagree because `nextUrl` is parsed FROM `url`,
    // which is why reading either is correct rather than a compromise.
    const url = 'http://localhost/api/reviews?lang=en&other=1'
    const req = { url, nextUrl: new URL(url) }
    expect(searchParam(req, 'lang')).toBe('en')
    expect(requestSearchParams(req).get('other')).toBe('1')
  })

  it('no query string is null, not a throw', () => {
    expect(searchParam(new Request('http://localhost/api/reviews'), 'lang')).toBeNull()
  })

  it('a request with NEITHER property yields empty params, not a 500', () => {
    // The exact failure mode R01 was: an absent optional turning into a TypeError. A query
    // parameter is optional at every call site here, and "absent" is a valid answer.
    expect(requestSearchParams({} as never).get('lang')).toBeNull()
    expect(searchParam(undefined as never, 'lang')).toBeNull()
  })

  it('a malformed or relative URL degrades to empty rather than throwing', () => {
    expect(searchParam({ url: '/api/reviews?lang=en' }, 'lang')).toBeNull()
    expect(searchParam({ url: 'not a url' }, 'lang')).toBeNull()
  })
})

describe('no route handler reads req.nextUrl.searchParams directly any more', () => {
  function routeFiles(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) out.push(...routeFiles(p))
      else if (e === 'route.ts') out.push(p.replace(/\\/g, '/'))
    }
    return out
  }

  const files = routeFiles('src/app/api')

  it('there are route files to check at all', () => {
    // Guards the guard: a path typo would make the assertion below vacuously true, which is the
    // failure mode that lets this exact class of bug back in.
    expect(files.length).toBeGreaterThan(30)
  })

  it('every query-string read goes through the helper', () => {
    const offenders = files.filter(f => /req\.nextUrl\.searchParams/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the Zalo host reads are deliberately left alone', () => {
    // Scope, made explicit. These ask for the HOST, already fall back through
    // `x-forwarded-host`/`host` headers first, and are a different question. Asserted so that a
    // future sweep does not "tidy" them into the helper and change proxy behaviour.
    const zalo = readFileSync('src/app/api/auth/zalo/route.ts', 'utf8')
    expect(zalo).toContain('req.nextUrl.host')
    expect(zalo).toContain('x-forwarded-host')
  })
})

describe('the mutating handlers the UAT identified work with a plain Request', () => {
  // The four `req.nextUrl` sites in mutating handlers found during the final UAT. Reading the
  // SOURCE rather than invoking them: each needs a Supabase client, an authenticated session and
  // a live safety pipeline to run, and what regressed was the property access, not the business
  // logic. The behavioural proof that they now survive a plain Request is the Module 08 suite
  // itself, which is exercised against the merged tree.
  const HANDLERS = [
    'src/app/api/reviews/route.ts',
    'src/app/api/reviews/[id]/comments/route.ts',
    'src/app/api/favorites/route.ts',
    'src/app/api/group/route.ts',
  ]

  for (const f of HANDLERS) {
    it(`${f.replace('src/app/api/', '')} reads the query string through the helper`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/req\.nextUrl\.searchParams/)
      expect(src).toMatch(/from '@\/lib\/http\/searchParams'/)
    })
  }
})
