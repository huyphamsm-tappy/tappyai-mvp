import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAnonymousUser } from './socialWriteAccess'

// ─────────────────────────────────────────────────────────────────────────────
// ONE LINE BETWEEN A VISITOR AND A MEMBER, DRAWN IN ONE PLACE.
//
// 🚨 WHY THIS FILE EXISTS. Every browser on this product holds a real Supabase
// session — `ensureAnonymousSession` mints one so the five free questions can be
// scoped to somebody. It is an `auth.users` row on the `authenticated` role with
// `is_anonymous = true`, and `getUser()` returns it happily.
//
// So "is there a user?" is not "is this person signed in?", and three surfaces
// had been asking the first question while meaning the second:
//
//   · the login page redirected every visitor away from its own form;
//   · the sidebar offered Logout to people who had never logged in;
//   · together they made an infinite loop with no way to sign in or out.
//
// `isAnonymousUser` already drew this line for social writes. These tests hold
// the surfaces that decide identity to that one definition, so a fourth surface
// cannot quietly invent a fifth answer.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('the shipped definition of a visitor', () => {
  it('an anonymous session is a visitor, a real account is not', () => {
    expect(isAnonymousUser({ is_anonymous: true })).toBe(true)
    expect(isAnonymousUser({ is_anonymous: false })).toBe(false)
    expect(isAnonymousUser(null)).toBe(false)
    expect(isAnonymousUser(undefined)).toBe(false)
    // Absent is not anonymous: a provider that omits the flag is a real account.
    expect(isAnonymousUser({})).toBe(false)
  })
})

describe('the login page can be reached by the people who need it', () => {
  const page = read('src/app/login/page.tsx')

  it('🚨 does not treat an anonymous session as already signed in', () => {
    // The measured loop: click Logout → `/login` → getUser() returns the
    // anonymous user → router.replace('/') → Home, still showing Logout.
    expect(page).toContain("import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'")
    expect(page).toMatch(/if \(!user \|\| isAnonymousUser\(user\)\) return/)
  })

  it('still sends a genuinely signed-in person to their destination', () => {
    expect(page).toMatch(/const dest = readReturnTo\(window\.location\.search\)/)
    expect(page).toMatch(/router\.replace\(dest\)/)
  })
})

describe('the sidebar derives its session row rather than hardcoding it', () => {
  const shell = read('src/components/v3/V3Shell.tsx')

  it('🚨 the row is no longer a static link to /login', () => {
    expect(shell).toContain('authRow: true')
    expect(shell).toContain('function AuthNavRow')
  })

  it('uses the shared auth status and the single sign-out call site', () => {
    expect(shell).toContain("import { useAuthStatus } from '@/hooks/useAuthStatus'")
    expect(shell).toContain("import { performSignOut } from '@/lib/auth/signOut'")
    // Deliberately NOT re-asserting "one signOut call site" here — the repo
    // already owns that guarantee in signOut's own suite, and duplicating it as a
    // substring check matched this file's own prose about it.
    expect(shell).toContain('await performSignOut()')
  })

  it('the hook keys on the shared definition, not on "is there a user"', () => {
    const hook = read('src/hooks/useAuthStatus.ts')
    expect(hook).toContain("import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'")
    expect(hook).toMatch(/!isAnonymousUser\(user\)/)
    expect(hook).toContain('onAuthStateChange')
  })
})

describe('the server stays the authority on quota identity', () => {
  const route = read('src/app/api/chat/route.ts')

  it('resolves identity from the verified session, never from the client', () => {
    expect(route).toMatch(/const \{ user, supabase \} = await getRequestUser\(req\)/)
  })

  it('🚨 an ANONYMOUS session gets the anonymous quota', () => {
    expect(route).toMatch(/if \(user\?\.is_anonymous\) \{/)
    expect(route).toContain('anon_chat_usage_increment')
    expect(route).toContain('ANON_DAILY_LIMIT')
  })

  it('🚨 a real account is NEVER counted against the anonymous quota', () => {
    // The two branches are exclusive by construction — `else if (user)` — and the
    // cookie fallback is additionally guarded on `!authedUserId`.
    expect(route).toMatch(/\} else if \(user\) \{/)
    expect(route).toMatch(/else if \(!authedUserId && !anonQuotaByToken\)/)
  })

  it('the anonymous limit is still enforced — this was never about removing it', () => {
    expect(route).toContain("error: 'anon_limit_reached'")
    expect(route).toMatch(/usedToday > ANON_DAILY_LIMIT/)
    expect(route).toMatch(/anonCount >= ANON_DAILY_LIMIT/)
  })
})
