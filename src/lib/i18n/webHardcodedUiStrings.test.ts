import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { w4vi, w4en } from './w4'
import { w5vi, w5en } from './w5'
import { dictionaries } from './dictionaries'

/**
 * B07 regression guard — Web UI text must come from the dictionaries, not from the JSX.
 *
 * The final UAT found whole screens rendering Vietnamese to English sessions: the paywall, "What
 * Tappy knows", Preferences, App connections, Recommendations, the first-run chat quiz. Vietnamese
 * was complete everywhere; English was the unfinished locale, and nothing failed when a developer
 * typed a Vietnamese sentence straight into a component.
 *
 * Two mechanisms here:
 *
 *  1. SEALED files — the screens fixed in this round. Zero Vietnamese literals, permanently. If
 *     someone adds one back, this fails by name.
 *  2. A RATCHET over the rest of the app surface. The remaining count may only ever go DOWN.
 *     This does not pretend the whole surface is converted; it makes the direction one-way.
 *
 * Detection is by Vietnamese-specific code points rather than a word list, so it does not depend
 * on anticipating the vocabulary. It looks only at `src/app` and `src/components` — the UI. Prompt
 * text, classifier keywords, seeded content and machine-to-machine payloads live under `src/lib`
 * and are legitimately Vietnamese; those are a different question from UI localization.
 */

const ROOT = join(__dirname, '..', '..', '..')
const UI_DIRS = [join(ROOT, 'src', 'app'), join(ROOT, 'src', 'components')]

// Latin letters carrying Vietnamese diacritics, plus the đ/ơ/ư families. Plain ASCII carries no
// signal, so it is deliberately excluded.
const VIETNAMESE = /[À-ưẠ-ỹ]/

/** Screens converted in the B07 fix round. These must stay at zero. */
const SEALED = [
  // U04 — the music copyright / notice-and-takedown policy. It rendered an English title, English
  // chrome and a 197-word Vietnamese body, which is the shape that stops anyone looking twice.
  // Now a LegalDocument like /privacy and /terms, so it follows the LanguagePicker.
  'src/app/copyright/page.tsx',
  'src/app/subscription/page.tsx',
  'src/app/subscription/SubscriptionView.tsx',
  'src/components/StripeCheckoutButton.tsx',
  'src/components/ManageSubscriptionButton.tsx',
  'src/app/profile/tappy-knows/page.tsx',
  'src/app/profile/integrations/page.tsx',
  'src/app/profile/edit/page.tsx',
  'src/app/profile/history/page.tsx',
  'src/app/profile/history/HistoryView.tsx',
  'src/app/profile/history/DeleteConversationButton.tsx',
  'src/app/recommendations/page.tsx',
  'src/app/currency/page.tsx',
  'src/app/music/upload/page.tsx',
  'src/components/CategoryGrid.tsx',

  // ── Sealed by the release-readiness fix round (C14, C15, C43) ──────────────
  'src/components/Header.tsx',            // the app-wide greeting: "Good morning, bạn"
  'src/app/profile/account/page.tsx',
  'src/app/profile/account/AccountView.tsx',
  'src/app/profile/bookings/page.tsx',
  'src/app/profile/bookings/BookingsView.tsx',
  'src/app/profile/favorites/page.tsx',
  'src/app/profile/posts/page.tsx',
  'src/app/profile/price-watches/page.tsx',
  'src/app/group/new/GroupNewForm.tsx',
  'src/app/music/page.tsx',
]

/**
 * `/profile/preferences` is sealed too, but with one carve-out: CUISINE_OPTIONS holds the exact
 * Vietnamese strings already PERSISTED in user rows. Replacing them with ids would silently
 * deselect every cuisine every existing user has chosen, so the value stays and only the label is
 * translated. Such a line is recognisable by carrying a dictionary key beside the value.
 */
const SEALED_WITH_PERSISTED_VALUES: Record<string, RegExp> = {
  'src/app/profile/preferences/page.tsx': /^\s*\{\s*value:\s*'[^']+',\s*key:\s*'[a-z][A-Za-z.]+'\s*\},?\s*$/,
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

function rel(p: string): string {
  return relative(ROOT, p).replace(/\\/g, '/')
}

/** Vietnamese-bearing lines in a file, ignoring comments (they are never rendered). */
function vietnameseLines(file: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = []
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw, i) => {
    const code = raw.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    if (VIETNAMESE.test(code)) hits.push({ line: i + 1, text: raw.trim().slice(0, 100) })
  })
  return hits
}

const uiFiles = UI_DIRS.flatMap((d) => walk(d))

describe('B07 — Web UI strings come from the dictionary', () => {
  it.each(SEALED)('%s has no hardcoded Vietnamese', (relPath) => {
    const file = join(ROOT, relPath)
    const hits = vietnameseLines(file)
    expect(
      hits.map((h) => `${relPath}:${h.line}  ${h.text}`),
      `${relPath} was localized in the B07 fix round; UI text belongs in src/lib/i18n`,
    ).toEqual([])
  })

  it.each(Object.keys(SEALED_WITH_PERSISTED_VALUES))(
    '%s has no hardcoded Vietnamese outside its persisted option values',
    (relPath) => {
      const allowed = SEALED_WITH_PERSISTED_VALUES[relPath]
      const hits = vietnameseLines(join(ROOT, relPath)).filter((h) => !allowed.test(h.text))
      expect(hits.map((h) => `${relPath}:${h.line}  ${h.text}`)).toEqual([])
    },
  )

  it('the sealed list names files that exist', () => {
    // A renamed file would otherwise turn its guard into a no-op that still passes.
    const known = new Set(uiFiles.map(rel))
    const missing = [...SEALED, ...Object.keys(SEALED_WITH_PERSISTED_VALUES)].filter((f) => !known.has(f))
    expect(missing).toEqual([])
  })
})

describe('B07 — the rest of the Web surface only gets better', () => {
  /**
   * Measured after the release-readiness fix round: **591 → 513**, as nine more screens moved into
   * the sealed list above.
   *
   * LOWER THIS NUMBER when you localize a screen; never raise it. Raising it is the exact move
   * that produced a Vietnamese-only paywall.
   */
  // 513 → 497 when U04 moved the copyright policy into the legal dictionary. Lowered so the gain
  // is locked in: a ratchet left above the real number quietly re-opens room for the next
  // regression to fit inside.
  const BASELINE = 497

  it(`carries at most ${BASELINE} Vietnamese UI lines outside the sealed screens`, () => {
    const sealed = new Set([...SEALED, ...Object.keys(SEALED_WITH_PERSISTED_VALUES)])
    const remaining = uiFiles
      .filter((f) => !sealed.has(rel(f)))
      .flatMap((f) => vietnameseLines(f).map(() => rel(f)))

    expect(
      remaining.length,
      remaining.length > BASELINE
        ? `Hardcoded Vietnamese UI text grew from ${BASELINE} to ${remaining.length} lines. ` +
          `Put the new text in src/lib/i18n instead.`
        : `Down to ${remaining.length} — lower BASELINE in this file to ${remaining.length} to lock the gain in.`,
    ).toBeLessThanOrEqual(BASELINE)
  })
})

describe('B07 — the w4 + w5 dictionaries are complete in both languages', () => {
  // Both waves, merged once. w5 was added by the release-readiness fix round for the screens the
  // UAT found still Vietnamese-only in an EN session; it gets the same guarantees w4 has.
  const VI: Record<string, string> = { ...w4vi, ...w5vi }
  const EN: Record<string, string> = { ...w4en, ...w5en }

  it('defines every Vietnamese key in English too', () => {
    // A key present in vi but missing in en falls back to Vietnamese at runtime — which is the
    // defect this whole round is about, just arriving through the dictionary instead of the JSX.
    expect(Object.keys(VI).filter((k) => !(k in EN))).toEqual([])
  })

  it('defines every English key in Vietnamese too', () => {
    expect(Object.keys(EN).filter((k) => !(k in VI))).toEqual([])
  })

  it('has no English value that is still the Vietnamese one', () => {
    // Copy-pasting the vi map and forgetting to translate is the easy mistake; anything identical
    // in both languages must be a proper noun, a number or an emoji, not a sentence.
    const suspicious = Object.keys(EN)
      .filter((k) => EN[k] === VI[k] && VIETNAMESE.test(EN[k]))
      .sort()
    expect(suspicious).toEqual([
      // Dish names English uses as-is.
      'cuisine.comTam',
      // A price in VND — converting it would invent a price that does not exist.
      'sub.free.price',
    ])
  })

  it('keeps the placeholders identical across languages', () => {
    // A dropped {count} renders a literal gap in the sentence for one language only.
    const vars = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',')
    const mismatched = Object.keys(VI).filter((k) => vars(VI[k]) !== vars(EN[k] ?? ''))
    expect(mismatched).toEqual([])
  })
})

describe('B07 — the base dictionary supplies the greeting fallback', () => {
  it('has home.friend in both languages', () => {
    // The home greeting used to fall back to the literal 'bạn', producing "Hi, bạn 👋" in English.
    expect(dictionaries.vi['home.friend']).toBeTruthy()
    expect(dictionaries.en['home.friend']).toBeTruthy()
    expect(VIETNAMESE.test(dictionaries.en['home.friend'])).toBe(false)
  })
})
