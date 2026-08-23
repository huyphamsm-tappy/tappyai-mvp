import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// ── Android login belongs to the same product as the web login ───────────────
//
// On a real device the Android login was four lines of text:
//
//     TappyAI / Sign in to continue / Continue with Google / Continue with Zalo
//
// No mascot, no tagline, nothing that says which product this is. The web login has always led
// with the Tappy otter. The branded Android screen also already existed, on a branch that was
// never merged — so this was never a design problem, it was a merge that did not happen.
//
// The strongest thing this file asserts is that the mascot Android ships is BYTE-IDENTICAL to the
// one the web serves. Comparing rendered layout across two toolchains is not possible here, but
// "the same approved artwork file" is exact, and it is the assertion that fails if someone
// regenerates, re-exports, or substitutes the mascot on one platform only. The artwork is the
// owner's; neither platform may invent its own.

const WEB_MASCOT = 'public/tappy/welcome.png'
const ANDROID_MASCOT = 'android/features/auth/src/main/res/drawable-nodpi/tappy_welcome.png'
const ANDROID_LOGIN = 'android/features/auth/src/main/java/com/tappyai/features/auth/ui/login/LoginScreen.kt'
const WEB_LOGIN = 'src/app/login/page.tsx'
const STRINGS_EN = 'android/features/auth/src/main/res/values/strings.xml'
const STRINGS_VI = 'android/features/auth/src/main/res/values-vi/strings.xml'

const read = (p: string) => readFileSync(p, 'utf8')
const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

/** `<string name="x">y</string>` → `{ x: y }`, with the XML entities undone. */
function strings(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of read(path).matchAll(/<string name="([a-z_0-9]+)">([\s\S]*?)<\/string>/g)) {
    out[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\'/g, "'")
  }
  return out
}

describe('Android login ships the same mascot artwork as the web', () => {
  it('the two platforms serve the identical file', () => {
    expect(sha256(ANDROID_MASCOT)).toBe(sha256(WEB_MASCOT))
  })

  it('the web login is the screen that artwork is taken from', () => {
    // Pins the provenance: if the web login stops using welcome.png, the hash above would keep
    // passing against a file nothing renders any more.
    expect(read(WEB_LOGIN)).toContain('/tappy/welcome.png')
  })

  it('the Android login actually renders it', () => {
    expect(read(ANDROID_LOGIN)).toMatch(/painterResource\(R\.drawable\.tappy_welcome\)/)
  })
})

describe('Android login carries the brand identity, in both languages', () => {
  const en = strings(STRINGS_EN)
  const vi = strings(STRINGS_VI)

  // Every string the branded screen renders that carries identity rather than mechanism.
  const IDENTITY = [
    'auth_welcome_to',
    'auth_tagline',
    'auth_personal_agent',
    'auth_signin_title',
    'auth_signin_subtitle',
    'auth_trust_line',
    'auth_agree_prefix',
    'auth_terms',
    'auth_privacy',
    'auth_footer_rights',
    'auth_feature_1_title',
    'auth_feature_2_title',
    'auth_feature_3_title',
    'auth_feature_4_title',
  ] as const

  it.each(IDENTITY)('%s is defined in English and Vietnamese', (key) => {
    expect(en[key]?.trim()).toBeTruthy()
    expect(vi[key]?.trim()).toBeTruthy()
  })

  it('the Vietnamese strings are translated, not copied', () => {
    // The failure this catches has happened on this project before (V2-UAT-009): one dictionary
    // entry pasted into both locales, which looks translated until you read it.
    const copied = IDENTITY.filter((k) => en[k] === vi[k])
    expect(copied, 'identical in both locales — untranslated').toEqual([])
  })

  it('the screen renders them rather than hardcoding English', () => {
    const screen = read(ANDROID_LOGIN)
    for (const key of IDENTITY) expect(screen).toContain(`R.string.${key}`)
  })

  it('the tagline matches the web wordmark line', () => {
    // "Touch Every Service" is the product's line, not a per-platform invention.
    expect(en['auth_tagline']).toBe('Touch Every Service')
  })
})

describe('branding did not displace the sign-in mechanism', () => {
  const screen = read(ANDROID_LOGIN)

  it('both MVP providers are still offered', () => {
    expect(screen).toContain('R.string.auth_continue_with_google')
    expect(screen).toContain('R.string.auth_continue_with_zalo')
    expect(screen).toMatch(/viewModel\.onGoogleSignInClick\(context\)/)
    expect(screen).toMatch(/viewModel\.onZaloSignInClick\(context\)/)
  })

  it('neither provider is presented as the lesser option', () => {
    // Web parity intent: two equal-weight choices. Previously Google was a solid Primary and Zalo a
    // tonal Secondary, which reads as a recommended path and a fallback.
    const variants = [...screen.matchAll(/TappyButtonVariant\.(\w+)/g)].map((m) => m[1])
    const providerVariants = variants.slice(0, 2)
    expect(new Set(providerVariants).size).toBe(1)
  })

  it('loading and error states survive', () => {
    expect(screen).toContain('TappyLoadingIndicator()')
    expect(screen).toMatch(/errorState is UiState\.Error/)
  })

  it('the screen scrolls, so a small phone cannot clip it', () => {
    // The branded screen is much taller than the four lines it replaced: mascot + tagline + four
    // feature rows + card + footer. On a 720×1600 device that does not fit.
    expect(screen).toMatch(/\.verticalScroll\(rememberScrollState\(\)\)/)
  })
})
