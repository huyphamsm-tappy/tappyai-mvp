// @vitest-environment node
//
// The three properties that keep a user's avatar theirs. Each is a real production failure mode,
// and none of them is visible from a component test.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { hasMatch } from 'next/dist/shared/lib/match-remote-pattern'

describe('ROOT CAUSE — the Zalo CDN must be an allowed image host', () => {
  it('next/image accepts a Zalo avatar URL', async () => {
    // Asserted through Next's OWN matcher, not a string search: this is the exact function the
    // image optimizer uses to decide 200 vs 400, so the test cannot pass while production 400s.
    const config = (await import('../../../next.config.mjs')).default
    const patterns = config.images?.remotePatterns
    expect(patterns, 'next.config must declare images.remotePatterns').toBeTruthy()
    if (!patterns) return
    expect(hasMatch([], patterns, new URL('https://s120-ava-talk.zadn.vn/a/b/c/1/x.jpg'))).toBe(true)
    // A different Zalo size/shard host must work too — the URL is not stable across avatars.
    expect(hasMatch([], patterns, new URL('https://photo-talk-cdn.zadn.vn/a/b/c/1/x.jpg'))).toBe(true)
    // The hosts that already worked must keep working.
    expect(hasMatch([], patterns, new URL('https://lh3.googleusercontent.com/a/default'))).toBe(true)
    expect(hasMatch([], patterns, new URL('https://abc.supabase.co/storage/v1/object/public/avatars/u.jpg'))).toBe(true)
    // And the allowlist is still an allowlist.
    expect(hasMatch([], patterns, new URL('https://evil.example.com/x.jpg'))).toBe(false)
  })
})

describe('PRIORITY — an uploaded TappyAI avatar outranks the Zalo one', () => {
  // POST /api/profile writes the upload to `profiles.avatar_url`; the Zalo avatar only ever
  // reaches `user_metadata.avatar_url` (set once, at account creation). Every read must therefore
  // prefer the profiles row, or an upload would appear to "not save" for Zalo users.
  const readers = [
    'src/app/profile/account/page.tsx',
    'src/app/api/profile/route.ts',
  ]
  for (const f of readers) {
    it(`${f} prefers profiles.avatar_url over user_metadata`, () => {
      const src = readFileSync(f, 'utf8')
      const m = src.match(/profile\??\.avatar_url\s*\|\|\s*user\.user_metadata\??\.avatar_url/)
      expect(m, 'expected `profile?.avatar_url || user.user_metadata?.avatar_url`').toBeTruthy()
    })
  }
})

describe('PERSISTENCE — signing in with Zalo must never overwrite a chosen avatar', () => {
  it('the Zalo completion route only ever creates a user, never updates one', () => {
    const src = readFileSync('src/app/api/auth/zalo/complete/route.ts', 'utf8')
    // It writes user_metadata exactly once, inside createUser — which Supabase rejects for an
    // existing account (the "already registered" error is deliberately swallowed). If an update
    // path is ever added here, a returning user's uploaded avatar would be replaced by their
    // Zalo one on every single login.
    expect(src).toContain('auth.admin.createUser')
    expect(src).not.toContain('updateUserById')
    expect(src).not.toContain("from('profiles')")
  })
})
