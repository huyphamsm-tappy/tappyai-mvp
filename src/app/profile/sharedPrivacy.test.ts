/**
 * "Đã share" is a PRIVATE self-profile collection (2026-09-15). Pinned at the source: the only
 * page that fetches `/api/reviews/shared` is the signed-in `/profile` hub; the public creator
 * profile (`/users/[id]` → `ProfileTab` page variant) and the guest hub never do, and the route
 * itself takes no user parameter to aim at someone else.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('shared collection privacy', () => {
  it('only the self hub reads /api/reviews/shared', () => {
    expect(read('src/app/profile/ProfileView.tsx')).toContain("fetchRows('/api/reviews/shared')")
    expect(read('src/app/profile/GuestProfileView.tsx')).not.toContain('reviews/shared')
    expect(read('src/app/reviews/ProfileTab.tsx')).not.toContain('reviews/shared')
    expect(read('src/app/users/[id]/UserProfileView.tsx')).not.toContain('reviews/shared')
    expect(read('src/app/reviews/creator/[id]/page.tsx')).not.toContain('reviews/shared')
  })

  it('the read route keys on the bearer only — no user id parameter, no user_id in the body', () => {
    const route = read('src/app/api/reviews/shared/route.ts')
    expect(route).toContain(".eq('user_id', user.id)")
    expect(route).not.toMatch(/searchParams\.get\('user/)
    const write = read('src/app/api/reviews/[id]/share/route.ts')
    expect(write).toContain('user_id: user.id')
    expect(write).toContain('refuseAnonymousSocialWrite(req, user)')
  })

  it('the migration pins ownership and shuts anonymous sessions out at the database', () => {
    const sql = read('supabase/migrations/20260915_review_shares.sql')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    for (const policy of ['review_shares_select_own', 'review_shares_insert_own']) {
      const block = sql.slice(sql.indexOf(`CREATE POLICY ${policy}`))
      expect(block.slice(0, 260)).toContain('auth.uid() = user_id')
      expect(block.slice(0, 260)).toContain("(auth.jwt() ->> 'is_anonymous')::boolean, false) = false")
    }
    // History, not a relationship: the DDL carries no unique pair (the comment above it explains why).
    const ddl = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf('CREATE INDEX'))
    expect(ddl).not.toMatch(/UNIQUE/)
    expect(sql).toContain('review_shares_user_created_idx ON public.review_shares (user_id, created_at DESC)')
  })
})
