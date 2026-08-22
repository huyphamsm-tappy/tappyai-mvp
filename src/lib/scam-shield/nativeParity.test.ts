import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RiskLevel } from './types'

/**
 * B09 — Scam Shield must exist on Android and iOS, and must stay a thin client of the backend.
 *
 * The final UAT found zero references to Scam Shield in either native tree: mobile users had no
 * scam protection at all, while a mis-scored bank phishing link on the web had been treated as a
 * CRITICAL bug. This suite is the gate on that gap staying closed.
 *
 * There is no Swift toolchain on the build machine and CI runs no Xcode, and the Android Compose
 * UI has no Robolectric here — so these are source-contract checks. They cannot prove either app
 * renders correctly (that is device UAT). What they CAN prove is the property that actually
 * matters and is invisible at runtime until it is too late: that neither client scores risk
 * locally, and that neither one can present an unresolved check as a safe one.
 */

const ANDROID = 'android/app/src/main/java/com/tappyai/app/scamshield'
const IOS_MODEL = 'ios/TappyAI/Features/UtilityTools/Model/ScamShieldModel.swift'
const IOS_VIEW = 'ios/TappyAI/Features/UtilityTools/UI/ScamShield/ScamShieldView.swift'
const IOS_VM = 'ios/TappyAI/Features/UtilityTools/UI/ScamShield/ScamShieldViewModel.swift'
const IOS_SERVICE = 'ios/TappyAI/Features/UtilityTools/Data/UtilityToolsService.swift'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function filesUnder(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...filesUnder(p, ext))
    else if (entry.endsWith(ext)) out.push(p)
  }
  return out
}

/** Every level the backend can send, from the web's own union type. */
const LEVELS: RiskLevel[] = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INCONCLUSIVE']

describe('B09 — Scam Shield exists on both native clients', () => {
  it('Android has the feature package', () => {
    expect(existsSync(ANDROID)).toBe(true)
    for (const file of ['ScamShieldScreen.kt', 'ScamShieldViewModel.kt', 'ScamShieldModels.kt']) {
      expect(existsSync(join(ANDROID, file)), `${file} is missing`).toBe(true)
    }
  })

  it('iOS has the feature files', () => {
    for (const file of [IOS_MODEL, IOS_VIEW, IOS_VM]) {
      expect(existsSync(file), `${file} is missing`).toBe(true)
    }
  })

  it('both clients are reachable from Home', () => {
    expect(read('android/app/src/main/java/com/tappyai/app/home/HomeTabHost.kt'))
      .toContain('ScamShieldRoute.Main')
    expect(read('android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt'))
      .toContain('onOpenScamShield')
    expect(read('ios/TappyAI/Features/Home/UI/HomeSectionViews.swift')).toContain('.scamShield')
    expect(read('ios/TappyAI/App/Shell/PlaceholderShellView.swift')).toContain('ScamShieldView(deps: deps)')
  })
})

describe('B09 — the backend stays the only authority on risk', () => {
  /**
   * 🚨 If a threshold, a weight or a domain list ever appears in a native client, the phone can
   * disagree with the web about the same URL. B01 was a CRITICAL scoring bug, fixed once, on the
   * server — a second implementation is a second place for it to come back.
   */
  const SCORING = [
    'MIN_CONFIDENCE',
    'LEVEL_THRESHOLD',
    'PROVIDER_MAX_WEIGHT',
    'calculateRisk',
  ]

  it('Android contains no local scoring', () => {
    for (const file of filesUnder(ANDROID, '.kt')) {
      const text = read(file)
      for (const needle of SCORING) {
        expect(text.includes(needle), `${file} must not score risk locally (${needle})`).toBe(false)
      }
    }
  })

  it('iOS contains no local scoring', () => {
    for (const file of [IOS_MODEL, IOS_VIEW, IOS_VM]) {
      const text = read(file)
      for (const needle of SCORING) {
        expect(text.includes(needle), `${file} must not score risk locally (${needle})`).toBe(false)
      }
    }
  })

  it('both clients call the same backend endpoint', () => {
    expect(read(join(ANDROID, 'data/ScamShieldApi.kt'))).toContain('api/scam-shield/check')
    expect(read(IOS_SERVICE)).toContain('/api/scam-shield/check')
  })
})

describe('B09 — every backend risk level is handled on both clients', () => {
  it.each(LEVELS)('Android gives %s a deliberate appearance', (level) => {
    const screen = read(join(ANDROID, 'ScamShieldScreen.kt'))
    expect(screen).toContain(`RiskLevel.${level} ->`)
  })

  it.each(LEVELS)('iOS gives %s a deliberate appearance', (level) => {
    // Swift cases are lowerCamel of the wire value.
    const swiftCase = level.toLowerCase()
    const view = read(IOS_VIEW)
    expect(view).toContain(`case .${swiftCase}:`)
  })

  it('Android models every level the web can send', () => {
    const models = read(join(ANDROID, 'ScamShieldModels.kt'))
    for (const level of LEVELS) expect(models).toContain(level)
  })

  it('iOS models every level the web can send', () => {
    const model = read(IOS_MODEL)
    for (const level of LEVELS) expect(model).toContain(`"${level}"`)
  })
})

describe('B09 — an unresolved check can never look safe', () => {
  /**
   * The single most important property in this file. An unrecognised or missing level must
   * degrade to "no verdict", not to "safe" — otherwise a backend change made after a native
   * release turns silently into a false reassurance on a phishing link.
   */
  it('Android degrades an unknown level to UNKNOWN, not SAFE', () => {
    const models = read(join(ANDROID, 'ScamShieldModels.kt'))
    expect(models).toMatch(/\?:\s*UNKNOWN/)
    expect(models).not.toMatch(/\?:\s*SAFE/)
  })

  it('iOS degrades an unknown level to .unknown, not .safe', () => {
    const model = read(IOS_MODEL)
    expect(model).toMatch(/\?\?\s*\.unknown/)
    expect(model).not.toMatch(/\?\?\s*\.safe/)
  })

  it('Android draws INCONCLUSIVE and UNKNOWN in neutral slate, never green', () => {
    const screen = read(join(ANDROID, 'ScamShieldScreen.kt'))
    const safeLine = screen.split('\n').find((l) => l.includes('RiskLevel.SAFE ->'))!
    const greenHex = safeLine.match(/0xFF[0-9A-F]{6}/)![0]

    for (const level of ['INCONCLUSIVE', 'UNKNOWN']) {
      const line = screen.split('\n').find((l) => l.includes(`RiskLevel.${level} ->`))!
      expect(line, `${level} must not reuse the SAFE colour`).not.toContain(greenHex)
      expect(line, `${level} must not use the reassuring shield glyph`).not.toContain('GppGood')
    }
  })

  it('iOS draws inconclusive and unknown in neutral slate, never the safe colour', () => {
    const view = read(IOS_VIEW)
    const colorBlock = view.slice(view.indexOf('func color(for'), view.indexOf('func glyph(for'))
    for (const level of ['inconclusive', 'unknown']) {
      const line = colorBlock.split('\n').find((l) => l.includes(`case .${level}:`))!
      expect(line, `${level} must use the neutral slate`).toContain('slate')
    }

    const glyphBlock = view.slice(view.indexOf('func glyph(for'), view.indexOf('func levelKey(for'))
    for (const level of ['inconclusive', 'unknown']) {
      const line = glyphBlock.split('\n').find((l) => l.includes(`case .${level}:`))!
      expect(line, `${level} must not use the reassuring shield glyph`).not.toContain('checkmark.shield')
    }
  })

  it('neither client has an else/default branch that could swallow a new level', () => {
    // A catch-all would let a level added later fall through to whatever the author wrote last,
    // instead of failing the build until someone decides how it should look.
    const android = read(join(ANDROID, 'ScamShieldScreen.kt'))
    const appearance = android.slice(android.indexOf('private fun appearanceFor'))
      .split('\n}')[0]
    expect(appearance).not.toContain('else ->')

    const ios = read(IOS_VIEW)
    const colorBlock = ios.slice(ios.indexOf('func color(for'), ios.indexOf('func glyph(for'))
    expect(colorBlock).not.toContain('default:')
  })

  it('a failed check routes to the unresolved presentation on both clients', () => {
    expect(read(join(ANDROID, 'ScamShieldScreen.kt'))).toMatch(/ScamShieldUiState\.Failed -> UnresolvedCard/)
    expect(read(IOS_VIEW)).toMatch(/vm\.failure\s*\{[\s\S]{0,80}unresolvedCard/)
  })
})

describe('B09 — the native copy tells the truth about a failed check', () => {
  /**
   * A failure message that reads like "no problems found" is the same defect as a wrong verdict.
   * Both catalogues must say the link was NOT checked.
   */
  it('the Android error strings say the link was not checked', () => {
    const en = read('android/app/src/main/res/values/strings_scam_shield.xml')
    const vi = read('android/app/src/main/res/values-vi/strings_scam_shield.xml')
    for (const key of ['offline', 'timeout', 'generic']) {
      expect(en).toMatch(new RegExp(`scam_shield_error_${key}">[^<]*has not been checked`))
      expect(vi).toMatch(new RegExp(`scam_shield_error_${key}">[^<]*CHƯA được kiểm tra`))
    }
  })

  it('the Android strings exist in both languages', () => {
    const keys = (xml: string) => [...xml.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]).sort()
    expect(keys(read('android/app/src/main/res/values/strings_scam_shield.xml')))
      .toEqual(keys(read('android/app/src/main/res/values-vi/strings_scam_shield.xml')))
  })

  it('the iOS catalogue carries every Scam Shield key in both languages', () => {
    const catalogue = JSON.parse(read('ios/TappyAI/Resources/Localizable.xcstrings'))
    const keys = Object.keys(catalogue.strings).filter((k) => k.startsWith('scamShield.'))
    expect(keys.length).toBeGreaterThan(15)
    for (const key of keys) {
      const loc = catalogue.strings[key].localizations
      expect(loc?.en?.stringUnit?.value, `${key} has no English`).toBeTruthy()
      expect(loc?.vi?.stringUnit?.value, `${key} has no Vietnamese`).toBeTruthy()
      expect(loc.en.stringUnit.value, `${key} was never translated`).not.toBe(loc.vi.stringUnit.value)
    }
  })

  it('every level referenced by the iOS view exists in the catalogue', () => {
    const catalogue = JSON.parse(read('ios/TappyAI/Resources/Localizable.xcstrings'))
    const referenced = [...read(IOS_VIEW).matchAll(/"(scamShield\.[A-Za-z.]+)"/g)].map((m) => m[1])
    const missing = [...new Set(referenced)].filter((k) => !(k in catalogue.strings))
    expect(missing).toEqual([])
  })
})
