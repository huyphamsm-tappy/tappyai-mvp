import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── iOS localization, guarded from the web suite ─────────────────────────────
//
// V2-UAT-012 was reported as "Localizable.xcstrings: 92 en / 91 vi". That count was wrong — the
// catalogue was at exact parity — and the real defect was much larger and pointing the other way:
// 368 user-facing string literals were written directly into Swift views, 316 of them containing
// Vietnamese diacritics, against a 91-key catalogue. A literal never reaches the resource system,
// so iOS was effectively Vietnamese-only no matter what language the user picked.
//
// There is no Swift toolchain on the build machine and CI runs no Xcode, so a text-level contract
// check is the ONLY gate that can run for iOS at all. It cannot prove the app renders correctly —
// that is device UAT — but it can prove the catalogue stays honest and that converted screens stay
// converted.

const IOS = 'ios/TappyAI'
const CATALOGUE = `${IOS}/Resources/Localizable.xcstrings`

interface Catalogue {
  sourceLanguage: string
  strings: Record<string, { localizations?: Record<string, { stringUnit?: { value?: string } }> }>
}

const catalogue = (): Catalogue => JSON.parse(readFileSync(CATALOGUE, 'utf8'))

function swiftFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...swiftFiles(path))
    else if (entry.endsWith('.swift')) out.push(path.replace(/\\/g, '/'))
  }
  return out
}

/**
 * Development-only surfaces, excluded for the same reason Android's previews are.
 *
 * These never ship to a user: `Diagnostics` is an internal harness and `Previews.swift` renders
 * only in Xcode's canvas. Forcing them through the catalogue would add keys nobody can ever read
 * and would make the guard's real signal harder to see.
 */
const DEV_ONLY = /\/(Diagnostics|Previews)\b|Previews\.swift$/

describe('the iOS string catalogue is at EN/VI parity', () => {
  it('every key carries both languages', () => {
    const cat = catalogue()
    const keys = Object.keys(cat.strings)
    expect(keys.length).toBeGreaterThan(100)

    const missing: string[] = []
    for (const key of keys) {
      const locs = cat.strings[key].localizations ?? {}
      for (const lang of ['en', 'vi']) {
        const value = locs[lang]?.stringUnit?.value
        if (typeof value !== 'string' || value.length === 0) missing.push(`${key} [${lang}]`)
      }
    }
    expect(missing).toEqual([])
  })

  it('no key is the same string in both languages, except the brand', () => {
    // An identical value on both sides is the usual shape of "someone pasted the Vietnamese in
    // and moved on", which reads as translated to every tool and to none of the users.
    const cat = catalogue()
    // Names, numeric ranges and symbols are legitimately identical. Listed explicitly rather than
    // pattern-matched, so adding one is a decision someone makes on purpose rather than a hole a
    // regex quietly widens.
    const IDENTICAL_BY_DESIGN = new Set([
      'app.name',
      // Money ranges written the same way in both languages. "50–100k" is not Vietnamese text; a
      // different English form would be a different NUMBER, not a translation.
      'onboarding.budget.50to100',
      'onboarding.budget.100to200',
    ])
    const suspicious: string[] = []
    for (const [key, entry] of Object.entries(cat.strings)) {
      if (IDENTICAL_BY_DESIGN.has(key)) continue
      const en = entry.localizations?.en?.stringUnit?.value
      const vi = entry.localizations?.vi?.stringUnit?.value
      if (!en || !vi) continue
      // A value that is only punctuation, digits or emoji is the same in any language.
      if (/^[\s\d\p{P}\p{S}]+$/u.test(en)) continue
      if (en === vi) suspicious.push(`${key} = ${JSON.stringify(en)}`)
    }
    expect(suspicious).toEqual([])
  })

  it('the catalogue is valid JSON with the expected shape', () => {
    const cat = catalogue()
    expect(cat.sourceLanguage).toBe('en')
    expect(typeof cat.strings).toBe('object')
  })
})

describe('converted iOS screens stay converted', () => {
  // Named explicitly, because a broad "no literals anywhere" assertion cannot pass yet — the
  // conversion is partial and the remainder is recorded in the fix-phase report. What this guard
  // does protect is REGRESSION: a screen that has been converted must not sprout a new literal,
  // which is exactly how the 368 accumulated in the first place.
  const CONVERTED = [
    'ios/TappyAI/Features/Auth/UI/AuthFlowView.swift',
    'ios/TappyAI/Features/Chat/UI/ChatInputBar.swift',
    'ios/TappyAI/Features/Chat/UI/OnboardingSheet.swift',
    'ios/TappyAI/Features/Deals/UI/DealsView.swift',
    'ios/TappyAI/Features/Discovery/UI/FavoritesView.swift',
    'ios/TappyAI/Features/Reviews/UI/MyPostsView.swift',
    'ios/TappyAI/Features/Reviews/UI/MusicPickerView.swift',
    'ios/TappyAI/Features/Reviews/UI/UserSearchView.swift',
    'ios/TappyAI/Features/Profile/UI/ProfileMainView.swift',
    'ios/TappyAI/Features/Profile/UI/SettingsView.swift',
  ]

  // Vietnamese diacritics. A literal carrying one is unambiguously user-facing prose rather than
  // an identifier, an SF Symbol name or a format string.
  const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

  for (const file of CONVERTED) {
    it(`${file.replace('ios/TappyAI/Features/', '')} has no Vietnamese literal left`, () => {
      const source = readFileSync(file, 'utf8')
      const offenders = source
        .split(/\r?\n/)
        .map((text, i) => ({ line: i + 1, text }))
        // A comment explaining WHY something was localized may quote the old Vietnamese.
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l.text))
        // A `value:` argument is the CANONICAL stored value, not display text — the paired
        // `labelKey:` is what the user reads. Vietnamese place names belong in the value: "Bình
        // Thạnh" is the district's actual name, and storing an English rendering of it would send
        // the backend something that does not exist. The guard only cares about what is DISPLAYED.
        .filter(l => !/\bvalue:\s*"[^"]*"/.test(l.text))
        .filter(l => {
          const literals = [...l.text.matchAll(/"([^"\\]*)"/g)].map(m => m[1])
          return literals.some(v => VIETNAMESE.test(v))
        })
        .map(l => `${file}:${l.line}  ${l.text.trim().slice(0, 80)}`)
      expect(offenders).toEqual([])
    })
  }
})

describe('the iOS client asks the backend for the app language', () => {
  it('the request builder sets Accept-Language from the app locale', () => {
    // Same defect class as Android's, and the same fix at the same layer: URLSession sets its own
    // Accept-Language from Locale.preferredLanguages — the DEVICE's — so an English user on a
    // Vietnamese phone would be told in Vietnamese why their post is not public.
    const source = readFileSync(`${IOS}/Core/Networking/Endpoint.swift`, 'utf8')
    expect(source).toContain('Accept-Language')
    expect(source).toContain('LocalizationManager.currentLanguageCode')
  })

  it('the language is read per request, not captured at construction', () => {
    // A stored value would put the language back on process lifetime: changing it in Settings
    // would not reach the server until the next cold start.
    const source = readFileSync(`${IOS}/Core/Networking/Endpoint.swift`, 'utf8')
    expect(source).toMatch(/func makeRequest[\s\S]*LocalizationManager\.currentLanguageCode/)
  })
})

describe('the conversion backlog is measured, not guessed', () => {
  /**
   * The number of Vietnamese literals still sitting in shipped iOS UI code.
   *
   * A RATCHET, not a target: the assertion is `<=`, so converting more screens keeps passing and
   * adding a literal fails. It exists so the fix-phase report and the code cannot drift apart —
   * a written "N remaining" goes stale the moment someone edits a view; this does not.
   *
   * Lower it whenever a batch lands. Raising it means a screen went backwards.
   */
  const IOS_LITERAL_BACKLOG = 487

  /**
   * Content, not chrome — excluded on purpose.
   *
   * `Model/` holds the tarot deck, the zodiac tables, the fortune corpus and the Can Chi data:
   * thousands of Vietnamese strings that are the PRODUCT, not its interface. Translating a tarot
   * reading is a content project with an owner and a budget, not a localization defect, and
   * counting them here would bury the ~240 interface strings that ARE the defect under an order
   * of magnitude of noise.
   */
  const CONTENT_NOT_CHROME = /\/Model\//

  it('reports how many user-facing literals remain in shipped iOS UI', () => {
    const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
    let count = 0
    for (const file of swiftFiles(IOS)) {
      if (DEV_ONLY.test(file) || CONTENT_NOT_CHROME.test(file)) continue
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
        if (/\bvalue:\s*"[^"]*"/.test(line)) continue
        for (const m of line.matchAll(/"([^"\\]{2,})"/g)) {
          if (VIETNAMESE.test(m[1])) count++
        }
      }
    }
    expect(count).toBeLessThanOrEqual(IOS_LITERAL_BACKLOG)
  })
})
