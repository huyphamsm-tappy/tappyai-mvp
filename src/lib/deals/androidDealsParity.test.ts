import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { vi as viDict } from '../i18n/w3/deals'

// ── Android Deals ↔ web Deals parity ─────────────────────────────────────────
//
// The reported symptom was a Deals tab of seven flat grey rows: a title, "Mua sắm · via Shopee",
// and an external-link icon. No logo, no description, no category colour, no subtitle, no
// disclosure. The web has rendered the full card the whole time.
//
// The cause is one mechanism with two faces, and both are invisible to the Kotlin compiler:
//
//   1. DATA. `/api/deals` migrated from a hardcoded Shopee pool to admin-managed `partner_deals`,
//      renaming url→officialUrl, source→partnerName, discount→discountLabel and adding
//      description/logoImage/categoryKey/voucherCode/endAt. The DTO kept the old names. The shared
//      Json runs `ignoreUnknownKeys = true`, so a name that no longer exists is NOT an error — it
//      decodes to the declared default. Every deal came back blank and nothing failed.
//   2. PARITY. The Android screen never had the card the web has. `git log` on DealsScreen.kt shows
//      153 → 158 → 164 lines and no reduction, so this is a gap that shipped, not a regression.
//
// A static source check is the mechanism because CI does not run Gradle — the Kotlin unit tests
// (DealsWireContractTest, DealListKeysTest, PromoCountdownTest) are real and they pass, but nothing
// runs them on a pull request. This file is what actually guards the contract in CI, and it is the
// same approach `nativePosterParity.test.ts` takes for the same reason.
//
// Expectations are DERIVED from the web — the rendered field list is read out of `DealsView.tsx`
// and the copy out of the shared dictionary — so adding a field or changing a sentence on the web
// flags Android instead of quietly leaving it behind.

const WEB_VIEW = 'src/app/deals/DealsView.tsx'
const ANDROID = {
  dto: 'android/app/src/main/java/com/tappyai/app/deals/data/DealsNetworkDtos.kt',
  model: 'android/app/src/main/java/com/tappyai/app/deals/Deal.kt',
  screen: 'android/app/src/main/java/com/tappyai/app/deals/DealsScreen.kt',
  api: 'android/app/src/main/java/com/tappyai/app/deals/data/DealsApi.kt',
  stringsEn: 'android/app/src/main/res/values/strings_deals.xml',
  stringsVi: 'android/app/src/main/res/values-vi/strings_deals.xml',
} as const

const read = (path: string) => readFileSync(path, 'utf8')

/** Every `deal.<field>` the web card reads — the authoritative list of what a deal must carry. */
function webRenderedFields(): string[] {
  const matches = read(WEB_VIEW).matchAll(/\bdeal\.([a-zA-Z][a-zA-Z0-9]*)\b/g)
  return [...new Set([...matches].map((m) => m[1]))].sort()
}

/** `<string name="x">y</string>` → `{ x: y }`, with XML entities and Android escapes undone. */
function androidStrings(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of read(path).matchAll(/<string name="([a-z_0-9]+)">([\s\S]*?)<\/string>/g)) {
    out[m[1]] = m[2]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\\'/g, "'")
  }
  return out
}

/** Web `{count}` / `{source}` placeholders → the Android positional form, so copy can be compared. */
const normalizePlaceholders = (s: string) =>
  s.replace(/\{count\}/g, '%1$d').replace(/\{source\}/g, '%1$s')

describe('Android Deals decodes every field the web card renders', () => {
  const dto = read(ANDROID.dto)
  const model = read(ANDROID.model)

  it('the web card reads a non-trivial set of fields', () => {
    // Guards the guard: if the scrape ever returns nothing, every case below would pass vacuously.
    expect(webRenderedFields().length).toBeGreaterThanOrEqual(10)
  })

  it.each(webRenderedFields())('DealDto declares `%s`', (field) => {
    expect(dto).toMatch(new RegExp(`\\bval ${field}:`))
  })

  it.each(webRenderedFields())('the Deal model carries `%s`', (field) => {
    expect(model).toMatch(new RegExp(`\\bval ${field}:`))
  })

  // The exact shape of the defect: the DTO kept names the feed had stopped sending. These decode
  // silently to their defaults, so their presence is the bug, not a symptom of it.
  it.each(['url', 'source', 'discount', 'emoji', 'badge'])(
    'the retired field name `%s` is gone from the DTO',
    (retired) => {
      expect(dto).not.toMatch(new RegExp(`\\bval ${retired}:`))
    },
  )

  it('optional fields decode as absent rather than blank', () => {
    // A "" logo renders an empty box and a "" voucher renders an empty pill — both are the bare
    // card the owner photographed, just arrived at from the other direction.
    for (const field of ['description', 'logoImage', 'discountLabel', 'voucherCode', 'endAt']) {
      expect(dto).toContain(`${field} = ${field}?.takeIf { it.isNotBlank() }`)
    }
  })
})

describe('Android Deals renders the card the web renders', () => {
  const screen = read(ANDROID.screen)

  it('colours the category chip from the language-independent key', () => {
    // `category` is localized; the colour map is keyed on the Vietnamese base label. Colouring from
    // the localized label drops every colour the moment the user switches to English.
    expect(screen).toContain('categoryColor(deal.categoryKey)')
    expect(screen).not.toContain('categoryColor(deal.category)')
  })

  it('keys the list through dealListKeys, never straight off a field', () => {
    // `key = { it.<field> }` is what threw `Key "" was already used` and killed the tab before it
    // drew. Asserting the token `dealListKeys` appears would prove nothing — this asserts the
    // expression the LazyColumn actually keys on.
    expect(screen).toMatch(/key = \{ index, _ -> keys\[index\] \}/)
    expect(screen).toMatch(/val keys = remember\(deals\) \{ dealListKeys\(deals\) \}/)
    expect(screen).not.toMatch(/key = \{ it\./)
  })

  it('renders the parts that were missing from the photographed screen', () => {
    for (const part of [
      'R.string.deals_subtitle', // curated-count line above the list
      'R.string.deals_disclosure', // commercial-nature disclosure (MFS 3.10)
      'R.string.deals_via_source', // "via Shopee" attribution
      'deal.description', // the one field carrying real copy today
      'deal.discountLabel',
      'deal.voucherCode',
      'deal.endAt',
    ]) {
      expect(screen).toContain(part)
    }
  })

  it('shows a logo when there is one and an initial when there is not', () => {
    // Asserting that the string `deal.logoImage` merely APPEARS proves nothing — it appears inside
    // the image call too, so deleting the branch entirely still matches. These pin the branch.
    expect(screen).toMatch(/if \(deal\.logoImage != null\) \{/)
    expect(screen).toMatch(/TappyImage\(url = deal\.logoImage/)
    expect(screen).toMatch(/deal\.partnerName\.firstOrNull\(\)\?\.uppercase\(\)/)
  })

  it('bumps the popularity counter on open, as the web does', () => {
    expect(read(WEB_VIEW)).toContain('/api/deals/${deal.id}/click')
    expect(read(ANDROID.api)).toContain('@POST("api/deals/{id}/click")')
    expect(screen).toContain('viewModel.onDealOpen(deal)')
  })
})

describe('Android Deals copy matches the shared dictionary', () => {
  const en = androidStrings(ANDROID.stringsEn)
  const vi = androidStrings(ANDROID.stringsVi)

  it('every English key has a Vietnamese counterpart', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort())
  })

  // Keyed by the dictionary entry each Android resource is the port of.
  const PORTED: ReadonlyArray<readonly [string, string]> = [
    ['deals_subtitle', 'deals.subtitle'],
    ['deals_via_source', 'deals.viaSource'],
    ['deals_ending_soon', 'deals.endingSoon'],
    ['deals_day_left', 'deals.dayLeft'],
    ['deals_days_left', 'deals.daysLeft'],
    ['deals_voucher_label', 'deals.voucherLabel'],
    ['deals_copy_code', 'deals.copyCode'],
    ['deals_code_copied', 'deals.codeCopied'],
  ]

  it.each(PORTED)('%s says what the web says in Vietnamese', (androidKey, webKey) => {
    expect(vi[androidKey]).toBe(normalizePlaceholders(viDict[webKey]))
  })

  it('the disclosure carries all three of the web clauses', () => {
    // The web bolds the middle clause and so splits it across three keys; Android renders one plain
    // paragraph. Different markup, same sentence — and the "not paid advertising" clause is the one
    // that must not be lost, since it is the disclosure's whole point.
    const joined =
      viDict['deals.disclosurePrefix'] +
      viDict['deals.disclosureEmphasis'] +
      viDict['deals.disclosureSuffix']
    expect(vi['deals_disclosure']).toBe(joined)
    expect(vi['deals_disclosure']).toContain('không phải quảng cáo trả tiền')
  })

  it('English and Vietnamese are actually different text', () => {
    // One dictionary entry copied into both languages is a defect this screen has had before
    // (V2-UAT-009, "Mua sắm · via Shopee" on the Vietnamese page).
    for (const [androidKey] of PORTED) {
      expect(vi[androidKey]).not.toBe(en[androidKey])
    }
  })
})
