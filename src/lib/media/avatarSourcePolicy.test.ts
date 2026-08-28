// @vitest-environment node
//
// The three properties that keep a user's avatar theirs. Each is a real production failure mode,
// and none of them is visible from a component test.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Next's own `hasMatch` was the obvious thing to assert through, and it is deliberately NOT used:
// it lives at `next/dist/shared/lib/match-remote-pattern`, an internal path, and it is already
// gone in the version this repo actually installs (the lockfile pins 14.2.35; a machine holding
// 14.2.5 still has it). A test that breaks on a patch bump is not a safety net.
//
// So the documented rule is applied directly instead: a leading `*` matches exactly one hostname
// label, and nothing else is wildcarded.
const hostMatches = (pattern: string, host: string): boolean => {
  if (!pattern.startsWith('*.')) return host === pattern
  const suffix = pattern.slice(1) // '.zadn.vn'
  if (!host.endsWith(suffix)) return false
  const label = host.slice(0, host.length - suffix.length)
  return label.length > 0 && !label.includes('.')
}

type Pattern = { protocol?: string; hostname: string }
const allowed = (patterns: Pattern[], url: string): boolean => {
  const u = new URL(url)
  return patterns.some(p => (!p.protocol || `${p.protocol}:` === u.protocol) && hostMatches(p.hostname, u.hostname))
}

describe('ROOT CAUSE — the Zalo CDN must be an allowed image host', () => {
  it('next/image accepts a Zalo avatar URL', async () => {
    const config = (await import('../../../next.config.mjs')).default
    const patterns = config.images?.remotePatterns as Pattern[] | undefined
    expect(patterns, 'next.config must declare images.remotePatterns').toBeTruthy()
    if (!patterns) return

    // The exact shape that returned 400 on production 53052c9.
    expect(allowed(patterns, 'https://s120-ava-talk.zadn.vn/a/b/c/1/x.jpg')).toBe(true)
    // A different Zalo size/shard host must work too — the URL is not stable across avatars.
    expect(allowed(patterns, 'https://photo-talk-cdn.zadn.vn/a/b/c/1/x.jpg')).toBe(true)
    // The hosts that already worked must keep working.
    expect(allowed(patterns, 'https://lh3.googleusercontent.com/a/default')).toBe(true)
    expect(allowed(patterns, 'https://abc.supabase.co/storage/v1/object/public/avatars/u.jpg')).toBe(true)
    // And the allowlist is still an allowlist — including the near-miss that a sloppy
    // "endsWith" rule would wave through.
    expect(allowed(patterns, 'https://evil.example.com/x.jpg')).toBe(false)
    expect(allowed(patterns, 'https://notzadn.vn/x.jpg')).toBe(false)
    expect(allowed(patterns, 'http://s120-ava-talk.zadn.vn/x.jpg')).toBe(false) // https only
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
