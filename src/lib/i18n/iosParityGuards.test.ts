import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * W6 — the iOS defects the release-readiness UAT found, guarded from the web suite.
 *
 * ============================================================================
 * WHY THESE ARE TEXT CHECKS
 * ============================================================================
 * There is no Mac and CI runs no Xcode, so nothing here compiles or runs Swift. That makes the
 * evidence level SOURCE and nothing higher — it is stated that way in the report and it is stated
 * here so nobody mistakes a green run for a working app.
 *
 * What a text check CAN do is hold the properties that were wrong: a tab with no case, a
 * navigation destination that ignores its argument, an endpoint nobody calls, a hardcoded English
 * string, a reference to a property that does not exist. Every one of those is visible in the
 * source and invisible at runtime until a user walks into it.
 */

const IOS = 'ios/TappyAI'
const SHELL = `${IOS}/App/Shell/PlaceholderShellView.swift`
const read = (p: string) => readFileSync(p, 'utf8')

/**
 * Source with comments stripped.
 *
 * 🚨 Load-bearing. Every guard below asserts that a WRONG construct is ABSENT — and each fix left
 * a comment quoting that exact construct so the next reader knows what was wrong. Matching raw
 * text would make all of them pass on the comment and prove nothing. This bit me while writing
 * them: three guards went green against their own explanatory comments.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function swiftFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) swiftFiles(p, out)
    else if (entry.endsWith('.swift')) out.push(p)
  }
  return out
}

describe('C31 — every tab renders its feature, not a placeholder', () => {
  it('the Deals tab has its own case in tabRoot', () => {
    // Deals fell through to `default: PlaceholderTabView` and shipped as "Coming soon" while a
    // complete DealsView + DealsService + DealsViewModel sat in the tree with zero references.
    expect(code(SHELL)).toMatch(/case \.deals:\s*\n\s*DealsView\(deps: deps\)/)
  })

  it('every AppTab case is handled explicitly', () => {
    // Swift allows `case home, chat, explore, deals, profile` on ONE line, so a naive
    // /case\s+(\w+)/ finds only "home" and silently checks one tab instead of five.
    const tabs = [...code(`${IOS}/Core/Navigation/AppTab.swift`).matchAll(/^\s*case\s+([a-z][\w,\s]*)$/gm)]
      .flatMap((m) => m[1].split(',').map((t) => t.trim()))
      .filter(Boolean)
    const shell = code(SHELL)
    expect(tabs.length, 'the AppTab parser found nothing — this test would be vacuous').toBeGreaterThanOrEqual(5)
    for (const tab of tabs) {
      expect(shell, `AppTab.${tab} has no case in tabRoot — it would render "Coming soon"`)
        .toContain(`case .${tab}:`)
    }
  })

  it('DealsView is referenced by something', () => {
    // The check that would have caught this in the first place: a screen nothing mentions is a
    // screen nobody ships.
    const refs = swiftFiles(IOS)
      .filter((f) => !f.endsWith('DealsView.swift') && read(f).includes('DealsView'))
    expect(refs.length, 'DealsView is dead code again').toBeGreaterThan(0)
  })
})

describe('C32 — user search never navigates to the wrong person', () => {
  const SEARCH = `${IOS}/Features/Reviews/UI/UserSearchView.swift`

  it('does not push a destination that ignores the tapped user', () => {
    // Was: `router.push(ProfileDestination.account, on: .profile)` for EVERY result — tapping
    // anyone opened YOUR OWN account. A constant destination inside a per-result row is the bug.
    expect(code(SEARCH)).not.toMatch(/router\.push\(ProfileDestination\.account/)
  })

  it('still renders the results it found', () => {
    // Removing the wrong destination must not have removed the feature.
    expect(code(SEARCH)).toMatch(/List\(vm\.results\)/)
  })
})

describe('C33 — an anonymous session hands its history to the account', () => {
  const REPO = `${IOS}/Features/Auth/AuthRepository.swift`
  const SERVICE = `${IOS}/Features/Auth/Data/AnonymousSessionService.swift`

  it('the claim endpoint is called at all', () => {
    // `grep -r claim-anonymous ios/` returned ZERO hits before this fix, while Web and Android
    // both claim. An iOS guest who signed in lost their chat history, silently.
    //
    // 🚨 The CLOSING QUOTE is part of the pattern. `toContain('/api/auth/claim-anonymous')` is
    // satisfied by `/api/auth/claim-anonymousXX` — a mutation proved it, and a typo'd path is
    // exactly the failure this guard exists to catch. A path is only right if it ENDS there.
    expect(code(SERVICE)).toMatch(/path:\s*"\/api\/auth\/claim-anonymous"/)
  })

  it('sends the OLD anonymous token in the body, as the route requires', () => {
    const src = code(SERVICE)
    // Quoted exactly, for the same reason as the path above: the server reads this key by name,
    // and a near-miss arrives as a field it does not read — a claim that silently claims nothing.
    expect(src).toMatch(/"anonymous_access_token"\s*:/)
    expect(src).toMatch(/requiresAuth:\s*true/)
  })

  it('every sign-in path claims, and reads the token BEFORE the session is replaced', () => {
    const src = code(REPO)
    // Four ways in: Google, Zalo, email OTP, register.
    expect((src.match(/claimAnonymousHistory\(claimToken\)/g) ?? []).length).toBe(4)
    expect((src.match(/anonymousTokenToClaim\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4)

    // 🚨 Ordering IS the fix. `finishAuthentication` swaps the session, so a capture placed after
    // it would read the NEW account's token and claim nothing at all — while looking correct.
    for (const fn of ['signInWithGoogle', 'verifyEmailOTP']) {
      const start = src.indexOf(`func ${fn}`)
      expect(start, `${fn} not found`).toBeGreaterThan(-1)
      const body = src.slice(start, start + 700)
      expect(body.indexOf('anonymousTokenToClaim()'), `${fn}: capture must precede finishAuthentication`)
        .toBeLessThan(body.indexOf('finishAuthentication'))
    }
  })

  it('a failed claim cannot fail the sign-in', () => {
    // Sign-in has already succeeded by then. Losing history is bad; losing the sign-in is worse.
    const src = code(REPO)
    const body = src.slice(src.indexOf('func claimAnonymousHistory'))
    expect(body.slice(0, 600)).toMatch(/do \{[\s\S]*catch/)
  })
})

describe('C36 — no hardcoded English in a localized view', () => {
  it('the coming-soon placeholder is a catalogue key', () => {
    const src = code(`${IOS}/App/Shell/PlaceholderTabView.swift`)
    expect(src).not.toMatch(/message:\s*"Coming soon"/)
    expect(src).toContain('placeholder.comingSoon')
  })

  it('the key exists, translated, in both languages', () => {
    const cat = JSON.parse(read(`${IOS}/Resources/Localizable.xcstrings`))
    const entry = cat.strings['placeholder.comingSoon']
    expect(entry, 'placeholder.comingSoon missing from the catalogue').toBeDefined()
    expect(entry.localizations.en.stringUnit.value).toBeTruthy()
    expect(entry.localizations.vi.stringUnit.value).toBeTruthy()
    expect(entry.localizations.en.stringUnit.value).not.toBe(entry.localizations.vi.stringUnit.value)
  })
})

describe('C53 — the iOS sources reference properties that exist', () => {
  it('AuthRepository reads AuthTokens.accessToken, the property that is declared', () => {
    // `tokens.access` was a plain compile error sitting in a file nothing had ever built —
    // the cost of a target that has never seen a compiler.
    const tokensType = code(`${IOS}/Core/Session/AuthState.swift`)
    expect(tokensType).toMatch(/let accessToken: String/)
    expect(tokensType).not.toMatch(/let access: String/)
    expect(code(`${IOS}/Features/Auth/AuthRepository.swift`)).not.toMatch(/tokens\.access\b(?!Token)/)
  })
})
