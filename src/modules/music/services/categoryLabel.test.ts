import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// `musicService` re-exports from `musicRepository`, which constructs a Supabase client at MODULE
// SCOPE from env vars. Importing the service therefore fails in a bare test process before a
// single assertion runs. Stubbing the repository keeps this file about the label function, which
// touches no I/O of its own.
vi.mock('../repository/musicRepository', () => ({}))

const { getCategoryLabel } = await import('./musicService')
type MusicCategory = import('../types/category').MusicCategory

/**
 * B11 — a music category renders in the app's language.
 *
 * The API has always returned `labelI18n: { en: "Trending", vi: "Thịnh hành" }`, and Android has
 * always rendered it correctly. Web called `getCategoryLabel(category)` with no locale, took the
 * `DEFAULT_LOCALE = 'vi'` default, and showed "Thịnh hành" to English users. The English string
 * was in the payload the whole time; nobody asked for it.
 */
const category = (labelI18n: Record<string, string>): MusicCategory => ({
  id: 'c1', slug: 'trending', labelI18n, sortOrder: 1,
})

describe('a category label follows the requested locale', () => {
  const trending = category({ en: 'Trending', vi: 'Thịnh hành' })

  it('English asks for and receives English', () => {
    expect(getCategoryLabel(trending, 'en')).toBe('Trending')
  })

  it('Vietnamese asks for and receives Vietnamese', () => {
    expect(getCategoryLabel(trending, 'vi')).toBe('Thịnh hành')
  })

  it('the two differ — the assertion above is not passing by accident', () => {
    expect(getCategoryLabel(trending, 'en')).not.toBe(getCategoryLabel(trending, 'vi'))
  })
})

describe('the fallback chain still degrades sensibly', () => {
  it('an unsupported locale falls back to Vietnamese rather than blank', () => {
    expect(getCategoryLabel(category({ en: 'Trending', vi: 'Thịnh hành' }), 'fr')).toBe('Thịnh hành')
  })

  it('a category with no labels at all falls back to its slug', () => {
    expect(getCategoryLabel(category({}), 'en')).toBe('trending')
  })

  it('a label present in only one language is still returned for that one', () => {
    expect(getCategoryLabel(category({ vi: 'Chỉ tiếng Việt' }), 'vi')).toBe('Chỉ tiếng Việt')
  })
})

describe('the call site cannot forget the locale again', () => {
  it('🚨 `locale` is a REQUIRED parameter', () => {
    // The whole of B11 was an omitted argument silently defaulting to Vietnamese. Removing the
    // default turns that omission into a compile error, which is a stronger guard than any
    // assertion here — this test pins the signature so nobody restores the default as a
    // "convenience".
    const src = readFileSync('src/modules/music/services/musicService.ts', 'utf8')
    expect(src).toMatch(/getCategoryLabel\(category: MusicCategory, locale: string\)/)
    expect(src).not.toMatch(/locale: string = DEFAULT_LOCALE/)
  })

  it('the tabs component passes the active locale from the app authority', () => {
    const src = readFileSync('src/modules/music/components/MusicCategoryTabs.tsx', 'utf8')
    expect(src).toContain('getCategoryLabel(category, locale)')
    // `useTranslation` is the same locale authority the rest of the web client reads — not a
    // second source of truth invented for this component.
    expect(src).toMatch(/const \{ t, locale \} = useTranslation\(\)/)
  })
})
