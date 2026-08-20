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

/** Shared by the B03 guards below; the older describes keep their own local copy. */
const VIETNAMESE_RE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

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

  // ── R02 ───────────────────────────────────────────────────────────────────
  //
  // Every key the code ASKS FOR must exist. This is a different failure from the hardcoded
  // literals above, and a quieter one: the code was already calling the localization API
  // correctly — the keys had simply never been added. `NSLocalizedString` returns the key itself
  // when it misses, and `ErrorPresenter`'s `L(key, fallback)` helpfully substitutes an English
  // fallback, so nothing looked broken. Thirteen of thirteen error keys were missing, which meant
  // every user-facing error on iOS — offline, network, interrupted reply, validation, auth, the
  // daily message limit — rendered in English no matter what language the app was in.
  //
  // A fallback that hides a missing translation is worse than a visible one: it converts a
  // localization bug into something only a Vietnamese user on an error path would ever notice.
  it('every key the Swift code references exists in the catalogue', () => {
    const cat = catalogue()
    const referenced = new Map<string, string>()
    for (const file of swiftFiles(IOS)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/NSLocalizedString\("([^"]+)"/g)) referenced.set(m[1], file)
      for (const m of src.matchAll(/\bL\("([^"]+)"/g)) referenced.set(m[1], file)
    }
    // Guards the guard: if the scan finds nothing, the assertion below proves nothing.
    expect(referenced.size).toBeGreaterThan(20)
    const missing = [...referenced].filter(([k]) => !cat.strings[k]).map(([k, f]) => `${k} (${f})`)
    expect(missing).toEqual([])
  })

  it('every ErrorPresenter message exists in BOTH languages', () => {
    // Named separately from the sweep above because these are the ones R02 was about, and because
    // an error message is the one string a user reads at their least patient moment.
    const cat = catalogue()
    const src = readFileSync(`${IOS}/Core/ErrorHandling/ErrorPresenter.swift`, 'utf8')
    const keys = [...src.matchAll(/\bL\("([^"]+)"/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThanOrEqual(13)
    for (const key of keys) {
      const locs = cat.strings[key]?.localizations ?? {}
      expect(locs.en?.stringUnit?.value, `EN ${key}`).toBeTruthy()
      expect(locs.vi?.stringUnit?.value, `VI ${key}`).toBeTruthy()
    }
  })

  it('the four representative error paths are covered', () => {
    // network, auth, validation, server/unexpected — the classes the UAT called out.
    const cat = catalogue()
    for (const key of [
      'error.network.title', 'error.network.message',
      'error.auth.title', 'error.auth.generic',
      'error.validation.title',
      'error.unexpected.title',
    ]) {
      const locs = cat.strings[key]?.localizations ?? {}
      expect(locs.vi?.stringUnit?.value, `VI ${key}`).toBeTruthy()
      // And the Vietnamese must not simply be the English string copied across.
      expect(locs.vi?.stringUnit?.value, `VI ${key} is untranslated`)
        .not.toBe(locs.en?.stringUnit?.value)
    }
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

// ── B03 ──────────────────────────────────────────────────────────────────────
//
// The ratchet below used to allow 487 Vietnamese literals, and the final UAT read that number as
// "iOS is not at EN/VI parity". Auditing it properly split it in two:
//
//   • 45 are the VIETNAMESE HALF OF AN EN/VI PAIR — `labelVi`/`labelEn` tuples, `thinkHintsVi`
//     with a `thinkHintsEn` twin, `locale == "en" ? … : …`. An English user already saw English
//     there. Wrong architecture, not wrong language on screen.
//   • 463 were genuinely untranslated: Home, Preferences, Subscription, the Reviews feed,
//     Account, Notifications, the tools — screens with NO localization mechanism at all, where an
//     English user simply read Vietnamese.
//
// All 463 are now in the catalogue. What is left is the first group, which is why the assertion
// below is on the SECOND number and not on the raw literal count: counting both together is what
// made 487 unreadable as a measure of anything.
describe('no shipped iOS screen is Vietnamese-only', () => {
  /**
   * Is this literal the Vietnamese half of a pair that already has an English half?
   *
   * Mirrors `scripts/ios-l10n-audit.mjs`. Deliberately duplicated rather than imported: the
   * script is a developer tool that can be edited freely, and this is the gate. If they drift,
   * the gate is what holds.
   */
  function isBilingual(lines: string[], idx: number): boolean {
    const whole = lines.join('\n')
    for (let i = idx; i >= Math.max(0, idx - 4); i--) {
      if (/locale\s*==\s*"en"|language(\.rawValue)?\s*==\s*("en"|\.(en|english))|isEnglish|lang\s*==\s*"en"/.test(lines[i])) return true
    }
    if (/\b\w*En\b\s*:|\btextEn\b|\blabelEn\b|\bpromptEn\b/.test(lines[idx])) return true
    for (let i = idx; i >= Math.max(0, idx - 25); i--) {
      const decl = lines[i]
      const named = decl.match(/\blet\s+(\w+)Vi\b/)
      if (named && new RegExp(`\\b${named[1]}En\\b`).test(whole)) return true
      if (/\blet\s+\w+\s*:\s*\[?\(/.test(decl) && /\w*Vi\s*:/.test(decl) && /\w*En\s*:/.test(decl)) return true
      if (/\blet\s+vi\s*:/.test(decl)) return /\blet\s+en\s*:/.test(whole)
      if (/\blet\s+en\s*:/.test(decl)) return true
      if (/^\s*(private\s+)?(let|var|func|struct)\s/.test(decl) && i !== idx) break
    }
    return false
  }

  function untranslated(): string[] {
    const out: string[] = []
    for (const file of swiftFiles(IOS)) {
      if (DEV_ONLY.test(file) || /\/Model\//.test(file)) continue
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (/\bvalue:\s*"[^"]*"/.test(line)) return
        if (/\bverbatim:/.test(line)) return   // Swift's own "this is data" marker
        if (/l10n:exempt/.test(line)) return   // explicit, greppable, reviewable
        for (const m of line.matchAll(/"([^"\\]{2,})"/g)) {
          if (VIETNAMESE_RE.test(m[1]) && !isBilingual(lines, i)) out.push(`${file}:${i + 1} ${m[1].slice(0, 40)}`)
        }
      })
    }
    return out
  }

  it('ZERO user-facing strings are Vietnamese-only', () => {
    // 🚨 `toEqual([])`, not `toBeLessThanOrEqual(N)`. A ceiling lets the next screen ship
    // Vietnamese-only as long as someone deletes a literal elsewhere, and that is exactly how
    // 487 accumulated. This cannot be satisfied by trading one screen against another.
    expect(untranslated()).toEqual([])
  })

  it('the scan is not vacuous', () => {
    // Guards the guard: if `swiftFiles` or the exclusions ever return nothing, the assertion
    // above passes while proving nothing at all.
    const scanned = swiftFiles(IOS).filter(f => !DEV_ONLY.test(f) && !/\/Model\//.test(f))
    expect(scanned.length).toBeGreaterThan(100)
    const withVietnamese = scanned.filter(f => VIETNAMESE_RE.test(readFileSync(f, 'utf8')))
    expect(withVietnamese.length).toBeGreaterThan(5) // the bilingual pairs are still there
  })

  it('the core screens named in the UAT reference the catalogue', () => {
    // Behavioural intent, stated per screen: these are the ones the UAT called out as showing
    // Vietnamese to English users. Each must now go through the resource system.
    const CORE = [
      'Features/Home/UI/HomeSectionViews.swift',
      'Features/Profile/UI/PreferencesView.swift',
      'Features/Profile/UI/SubscriptionView.swift',
      'Features/Reviews/UI/ReviewsFeedView.swift',
      'Features/Profile/UI/AccountView.swift',
      'Features/Profile/UI/NotificationsSettingsView.swift',
      'Features/Chat/UI/ChatMessageList.swift',
    ]
    for (const rel of CORE) {
      const src = readFileSync(`${IOS}/${rel}`, 'utf8')
      expect(src, rel).toMatch(/NSLocalizedString\(|"[a-z]+\.[a-zA-Z.]+"/)
    }
  })

  it('the iOS sources are structurally sound', () => {
    // `scripts/ios-swift-syntax-check.mjs` exists because there is no Swift compiler here and a
    // real syntax error — `Text("Nhắn Tappy: "Tappy theo dõi …"")`, unescaped inner quotes — sat
    // in PriceWatchesView undetected until B03 read every string in the file by hand.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const out = execFileSync(process.execPath, ['scripts/ios-swift-syntax-check.mjs'], { encoding: 'utf8' })
    expect(out).toContain('OK —')
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
  // 487 → 45 in B03. Every one of the 45 that remain is the Vietnamese half of a working EN/VI
  // pair, which `no shipped iOS screen is Vietnamese-only` above asserts directly and far more
  // usefully than a ceiling can. This number is kept as a second, blunter line of defence — it
  // notices a NEW literal even in a file that happens to look bilingual to the smarter check.
  //
  // 47 rather than the 45 `scripts/ios-l10n-audit.mjs` prints: this describe uses the file's own
  // narrower DEV_ONLY and does not honour `verbatim:`/`l10n:exempt`, so it scans slightly more.
  // Left as-is deliberately — the two numbers measure different things and making them agree
  // would mean loosening one of them.
  const IOS_LITERAL_BACKLOG = 47

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
