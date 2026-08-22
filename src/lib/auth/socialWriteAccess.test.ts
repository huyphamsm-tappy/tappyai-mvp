import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isAnonymousUser, refuseAnonymousSocialWrite } from './socialWriteAccess'

/**
 * B17 — an anonymous session may browse and chat. It may not write to the social graph.
 *
 * A UAT probe with an ordinary anonymous session (the kind chat mints for every visitor) liked,
 * saved, followed, commented and created a group — all 200. Every route gated on
 * `if (!user) 401`, and an anonymous user IS a user, so the check separated nobody.
 *
 * 🚨 Both halves are asserted here, and the second matters as much as the first: a guard that
 * refuses anonymous callers is only correct if REGISTERED callers still get through. Blocking
 * everyone would pass a naive "forbidden case" test and break the product.
 */
const req = { url: 'http://localhost/api/x', headers: new Headers() }

describe('who counts as anonymous', () => {
  it('a real anonymous session does', () => {
    expect(isAnonymousUser({ is_anonymous: true })).toBe(true)
  })

  it('a registered account does not', () => {
    expect(isAnonymousUser({ is_anonymous: false })).toBe(false)
  })

  it('🚨 an ABSENT flag is treated as registered, not anonymous', () => {
    // Supabase omits `is_anonymous` for accounts created before anonymous auth existed. Reading
    // absence as "anonymous" would lock long-standing users out of commenting overnight — a far
    // worse failure than the one being fixed, and the kind a guard written only against the
    // forbidden case would ship.
    expect(isAnonymousUser({})).toBe(false)
    expect(isAnonymousUser(null)).toBe(false)
    expect(isAnonymousUser(undefined)).toBe(false)
  })
})

describe('the refusal itself', () => {
  it('an anonymous caller is refused with 403', async () => {
    const res = refuseAnonymousSocialWrite(req, { is_anonymous: true })
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const body = await res!.json()
    expect(body.error).toBe('account_required')
  })

  it('🚨 403 and not 401 — the caller IS authenticated', () => {
    // A 401 tells a client to authenticate. This client already did; an Android/iOS client that
    // retries a 401 by minting another anonymous session would loop forever. 403 says the
    // identity is understood and insufficient, which is the truth and is actionable.
    expect(refuseAnonymousSocialWrite(req, { is_anonymous: true })!.status).not.toBe(401)
  })

  it('the refusal is localized and says what to DO', async () => {
    const en = await refuseAnonymousSocialWrite({ ...req, url: 'http://x/?lang=en' }, { is_anonymous: true })!.json()
    const vi = await refuseAnonymousSocialWrite({ ...req, url: 'http://x/?lang=vi' }, { is_anonymous: true })!.json()
    expect(en.message).toMatch(/sign in/i)
    expect(vi.message).toMatch(/đăng nhập/i)
    expect(en.message).not.toBe(vi.message)
  })

  it('a REGISTERED caller passes straight through', () => {
    expect(refuseAnonymousSocialWrite(req, { is_anonymous: false })).toBeNull()
    expect(refuseAnonymousSocialWrite(req, {})).toBeNull()
  })
})

describe('every social mutation route is behind the boundary', () => {
  /**
   * The routes that write content or graph edges OTHER PEOPLE SEE.
   *
   * 🚨 Deliberately does NOT include conversations, memory, preferences, favorites, price watches
   * or bookings. That state is the visitor's own, invisible to anyone else, and is what makes the
   * 5 free questions work — refusing it would break the anonymous experience the product
   * intentionally offers, which is not what "read-only SOCIAL" says.
   */
  const SOCIAL_WRITES = [
    'src/app/api/reviews/route.ts',
    'src/app/api/reviews/[id]/route.ts',
    'src/app/api/reviews/[id]/comments/route.ts',
    'src/app/api/reviews/[id]/like/route.ts',
    'src/app/api/reviews/[id]/save/route.ts',
    'src/app/api/comments/[commentId]/reactions/route.ts',
    'src/app/api/users/[id]/follow/route.ts',
    'src/app/api/group/route.ts',
    'src/app/api/group/[id]/join/route.ts',
    'src/app/api/group/[id]/suggest/route.ts',
    'src/app/api/music/tracks/route.ts',
    'src/app/api/music/tracks/[id]/report/route.ts',
    'src/app/api/sound/[trackId]/follow/route.ts',
    'src/app/api/sound/[trackId]/save/route.ts',
    'src/app/api/reviews/upload/route.ts',
  ]

  for (const rel of SOCIAL_WRITES) {
    it(`${rel.replace('src/app/api/', '')} refuses anonymous callers`, () => {
      const src = readFileSync(rel, 'utf8')
      expect(src, rel).toContain('refuseAnonymousSocialWrite')
    })
  }

  it('the guard sits AFTER the authentication check, not before it', () => {
    // Order matters for the answer the caller gets: an unauthenticated request must still be told
    // to authenticate (401), not that its account is insufficient (403).
    for (const rel of SOCIAL_WRITES) {
      const src = readFileSync(rel, 'utf8')
      const auth = src.indexOf('if (!user)')
      const anon = src.indexOf('refuseAnonymousSocialWrite(req, user)')
      expect(auth, rel).toBeGreaterThan(-1)
      expect(anon, rel).toBeGreaterThan(auth)
    }
  })

  it("the visitor's own private state is still writable", () => {
    // The other half of the contract, asserted so a later sweep does not "tidy" the guard onto
    // every route and quietly kill anonymous chat.
    for (const rel of [
      'src/app/api/conversations/route.ts',
      'src/app/api/memory/route.ts',
      'src/app/api/preferences/route.ts',
    ]) {
      expect(readFileSync(rel, 'utf8'), rel).not.toContain('refuseAnonymousSocialWrite')
    }
  })
})

describe('mutations report what they actually did — B16', () => {
  function routeFiles(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) out.push(...routeFiles(p))
      else if (e === 'route.ts') out.push(p.replace(/\\/g, '/'))
    }
    return out
  }

  it('reviews delete/patch check the affected rows before claiming success', () => {
    // Deleting someone else's review answered `200 {"ok":true}` while deleting nothing: the
    // statement was correctly scoped and RLS held, but PostgREST does not call "0 rows" an error
    // and the handler only inspected `error`. A client removed the post on `ok`; it came back on
    // refresh.
    const src = readFileSync('src/app/api/reviews/[id]/route.ts', 'utf8')
    expect(src).toContain(".select('id')")
    expect(src.match(/data\.length === 0/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(src).toContain("error: 'not_found'")
  })

  it('🚨 a not-yours row answers 404, never 403', () => {
    // 403 on a row that exists but belongs to someone else turns the ownership check into an
    // existence oracle: guess ids, read the status, enumerate the table. 404 for both cases
    // reveals only what the caller is entitled to know.
    const src = readFileSync('src/app/api/reviews/[id]/route.ts', 'utf8')
    expect(src).not.toMatch(/status:\s*403/)
    expect(src).toMatch(/status:\s*404/)
  })

  it('the ownership scope on the statement is intact', () => {
    // The actual security boundary, asserted so the affected-row work above is never mistaken
    // for it. Both mutations stay scoped to the caller's own rows.
    const src = readFileSync('src/app/api/reviews/[id]/route.ts', 'utf8')
    expect(src.match(/\.eq\('user_id', user\.id\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
