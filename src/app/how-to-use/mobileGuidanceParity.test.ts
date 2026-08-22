import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOW_TO_USE_DOC } from './howToUseDoc'

// Cross-platform guidance parity — Web / Android / iOS.
//
// iOS has no test runner in this environment (no macOS, no Xcode), so without something here the
// iOS guidance would ship on nothing but a careful read. These assertions run in the normal web
// suite and in CI, and they read the real Swift and XML rather than a copy, so a string deleted on
// one platform is caught by the platform that still has a runner.
//
// This does NOT constitute an iOS build. Nothing here compiles Swift.

const IOS_VIEW = 'ios/TappyAI/Features/Profile/UI/HowToUseView.swift'
const IOS_SETTINGS = 'ios/TappyAI/Features/Profile/UI/SettingsView.swift'
const IOS_SHELL = 'ios/TappyAI/App/Shell/PlaceholderShellView.swift'
const IOS_MODELS = 'ios/TappyAI/Features/Profile/Model/ProfileModels.swift'
const IOS_CATALOG = 'ios/TappyAI/Resources/Localizable.xcstrings'
const ANDROID_EN = 'android/app/src/main/res/values/strings_guide.xml'
const ANDROID_VI = 'android/app/src/main/res/values-vi/strings_guide.xml'

const read = (p: string) => readFileSync(p, 'utf8')

interface Catalog {
  strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }>
}

/** Every `guide.*` key the SwiftUI view references. */
function iosKeysInView(): string[] {
  const matches = read(IOS_VIEW).matchAll(/"(guide\.[A-Za-z0-9.]+)"/g)
  return [...new Set([...matches].map((m) => m[1]))]
}

function androidKeys(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of read(file).matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)) out[m[1]] = m[2]
  return out
}

/** The twelve feature areas the guidance must cover, on every platform. */
const FEATURES = [
  'chat', 'food', 'travel', 'product', 'readaloud', 'notifications',
  'tappysound', 'reviews', 'saves', 'tools', 'account', 'limits',
] as const

describe('iOS guidance — every referenced key is localized in both languages', () => {
  const catalog = JSON.parse(read(IOS_CATALOG)) as Catalog
  const keys = iosKeysInView()

  it('the view references a non-trivial number of keys', () => {
    expect(keys.length).toBeGreaterThan(50)
  })

  it('every key exists in the String Catalog with English and Vietnamese', () => {
    const broken = keys.filter((k) => {
      const loc = catalog.strings[k]?.localizations
      return !loc?.en?.stringUnit?.value?.trim() || !loc?.vi?.stringUnit?.value?.trim()
    })
    expect(broken).toEqual([])
  })

  it('no entry left English sitting in the Vietnamese slot', () => {
    const identical = keys.filter((k) => {
      const loc = catalog.strings[k]?.localizations
      return loc?.en?.stringUnit?.value === loc?.vi?.stringUnit?.value
    })
    expect(identical).toEqual([])
  })

  it('the view holds no hardcoded prose', () => {
    // StaticPageView hardcodes Vietnamese titles; that is the mistake this guard prevents
    // repeating. Comments are stripped first so the file's own documentation cannot trip it.
    const code = read(IOS_VIEW)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    // Two refinements, both learned the hard way. \n is excluded because a plain Swift literal
    // cannot span lines — without it the match ran from one key's closing quote to the next
    // key's opening quote and called the code in between "prose". And a literal only counts as
    // prose if it contains a SPACE: localization keys are long dotted identifiers, so a length
    // threshold alone flags every `guide.notifications.title` in the file.
    const literals = [...code.matchAll(/"([^"\\\n]{20,})"/g)]
      .map((m) => m[1])
      .filter((s) => s.includes(' '))
    expect(literals).toEqual([])
  })
})

describe('iOS guidance — reachable from Settings', () => {
  it('the destination exists and the shell shows the view', () => {
    expect(read(IOS_MODELS)).toContain('case howToUse')
    const shell = read(IOS_SHELL)
    expect(shell).toContain('case .howToUse')
    expect(shell).toContain('HowToUseView()')
  })

  it('Settings pushes the destination with a localized label', () => {
    const settings = read(IOS_SETTINGS)
    expect(settings).toContain('ProfileDestination.howToUse')
    // labelKey, not label: only the LocalizedStringKey overload follows the in-app picker.
    expect(settings).toContain('labelKey: "guide.settingsRow"')
  })

  it('the Settings label itself is localized in both languages', () => {
    const loc = (JSON.parse(read(IOS_CATALOG)) as Catalog).strings['guide.settingsRow']?.localizations
    expect(loc?.en?.stringUnit?.value?.trim()).toBeTruthy()
    expect(loc?.vi?.stringUnit?.value?.trim()).toBeTruthy()
  })
})

describe('Android guidance — locale parity', () => {
  const en = androidKeys(ANDROID_EN)
  const vi = androidKeys(ANDROID_VI)

  it('defines the same keys in values/ and values-vi/', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort())
  })

  it('leaves no English string in the Vietnamese file', () => {
    expect(Object.keys(en).filter((k) => en[k] === vi[k])).toEqual([])
  })
})

describe('cross-platform parity — the same features are explained everywhere', () => {
  const webKeys = new Set(
    HOW_TO_USE_DOC.sections.flatMap((s) => [
      s.headingKey,
      // `contact` has no keys of its own; `email` contributes only its label key — the address
      // beside it is a literal, not translated.
      ...s.blocks.flatMap((b) =>
        b.kind === 'bullets' || b.kind === 'steps' ? b.keys
          : b.kind === 'contact' ? []
          : b.kind === 'email' ? [b.labelKey]
          : [b.key],
      ),
    ]),
  )
  const iosKeys = new Set(iosKeysInView())
  const androidEn = androidKeys(ANDROID_EN)

  // Web covers the Tappy sound inside its notifications section rather than as a separate
  // heading, because web has no toggle to describe. Android and iOS give it its own section.
  const webAliases: Record<string, string[]> = {
    tappysound: ['guide.notif.identity', 'guide.notif.android'],
    product: ['guide.shop.heading'],
    readaloud: ['guide.voice.heading'],
    notifications: ['guide.notif.heading'],
    saves: ['guide.saved.heading'],
  }

  for (const feature of FEATURES) {
    it(`"${feature}" is covered on Android`, () => {
      expect(Object.keys(androidEn)).toContain(`guide_${feature}_title`)
      expect(Object.keys(androidEn)).toContain(`guide_${feature}_body`)
    })

    it(`"${feature}" is covered on iOS`, () => {
      expect([...iosKeys].some((k) => k.startsWith(`guide.${feature}.`))).toBe(true)
    })

    it(`"${feature}" is covered on Web`, () => {
      const candidates = webAliases[feature] ?? [`guide.${feature}.heading`]
      expect(candidates.some((c) => webKeys.has(c))).toBe(true)
    })
  }
})

describe('guidance never overclaims', () => {
  it('no platform asserts that notification delivery has been verified', () => {
    // V2-03 has had no production FCM end-to-end test. Describing the feature is fine;
    // asserting it is proven to arrive is not.
    const corpus = [read(ANDROID_EN), read(IOS_CATALOG), read('src/lib/i18n/guide/index.ts')]
      .join(' ')
      .toLowerCase()
    for (const claim of ['delivery is verified', 'guaranteed to arrive', 'always arrives']) {
      expect(corpus.includes(claim), claim).toBe(false)
    }
  })

  it('no platform claims a cloud voice for read-aloud', () => {
    // Web is window.speechSynthesis, Android is android.speech.tts, iOS is the system voice.
    // Google Cloud TTS is blocked and unshipped; the guidance must not imply otherwise.
    const corpus = [read(ANDROID_EN), read(IOS_CATALOG), read('src/lib/i18n/guide/index.ts')]
      .join(' ')
      .toLowerCase()
    for (const claim of ['google tts', 'google cloud', 'cloud voice']) {
      expect(corpus.includes(claim), claim).toBe(false)
    }
  })
})
