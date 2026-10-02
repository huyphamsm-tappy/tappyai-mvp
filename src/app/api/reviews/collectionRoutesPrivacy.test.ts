import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The four personal-collection routes are the BEARER'S OWN, on every platform (2026-09-17).
 *
 * `/api/reviews/mine`, `/liked`, `/saved` and `/shared` back the five collections the web hub,
 * the Android self profile and the iOS collections screen all show. Their privacy is not a UI
 * decision: each route refuses a missing session with 401 before any read, scopes every query to
 * `user.id` from the verified session, and accepts no user parameter — so there is no request an
 * owner can make for someone else's list, and none a visitor can make for the owner's. The three
 * list routes also apply the hidden and publication gates and strip unservable media (their own
 * suites execute that); this file pins the scoping at the source, for all four at once.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ROUTES = ['mine', 'liked', 'saved', 'shared'] as const

describe.each(ROUTES)('GET /api/reviews/%s', (name) => {
  const src = code(`src/app/api/reviews/${name}/route.ts`)

  it('refuses a missing session with 401 before reading anything', () => {
    const gate = src.indexOf("if (!user) return NextResponse.json({ error: 'unauthorized'")
    const firstRead = src.indexOf('.from(')
    expect(gate).toBeGreaterThan(-1)
    expect(firstRead).toBeGreaterThan(gate)
    expect(src.slice(gate, src.indexOf('\n', gate))).toContain('{ status: 401 }')
  })

  it("scopes the membership query to the session's own id", () => {
    expect(src).toContain(".eq('user_id', user.id)")
  })

  it('takes no user parameter — there is no way to aim it at another account', () => {
    expect(src).not.toMatch(/searchParams\.get\(\s*'(user|userId|user_id|id)'\s*\)/)
    expect(src).not.toMatch(/searchParam\(req,\s*'(user|userId|user_id|id)'\)/)
    expect(src).not.toMatch(/params\.(id|userId)/)
  })
})

describe('the three list routes withhold what the public feed withholds', () => {
  it.each(['liked', 'saved', 'shared'] as const)('/%s filters hidden posts, applies publishableFilter and strips media', (name) => {
    const src = code(`src/app/api/reviews/${name}/route.ts`)
    expect(src).toContain(".or('is_hidden.is.null,is_hidden.eq.false')")
    expect(src).toContain('.or(publishableFilter())')
    expect(src).toContain('map(stripUnservableMedia)')
  })

  it('/mine is the only one that returns hidden rows — to their author, with the flag on each row', () => {
    const src = code('src/app/api/reviews/mine/route.ts')
    expect(src).not.toContain("is_hidden.eq.false")
    expect(src).toMatch(/is_hidden,/)  // selected, so the client can split Posts from Hidden
    expect(src).toContain('map(stripUnservableMedia)')
  })
})
