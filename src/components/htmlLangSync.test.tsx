// @vitest-environment jsdom
/**
 * R03 — the browser tab must be in the language the user chose.
 *
 * The final UAT switched the app to English and found the tab, the bookmark name and the history
 * entry still read "TappyAI – Trợ lý AI thuần Việt". `metadata` in the root layout is a SERVER
 * value evaluated once with a hardcoded `'vi'`, so the Vietnamese title ships in every response
 * and nothing on the client had ever revised it.
 *
 * These tests are about the property that was missing — the title FOLLOWS the active language —
 * and about the way a naive fix would break something worse: eleven routes set their own title,
 * and a review page's title is the review's own subject.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import HtmlLangSync from './HtmlLangSync'
import { setLocale } from '@/lib/i18n/useTranslation'
import { BRAND } from '@/lib/share/openGraph'

const path = vi.hoisted(() => ({ current: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => path.current }))

const VI = BRAND.title.vi
const EN = BRAND.title.en

beforeEach(() => {
  path.current = '/'
  // The SSR title, which is what every response actually carries.
  document.title = VI
  document.documentElement.lang = 'vi'
})
afterEach(cleanup)

describe('the title follows the active language', () => {
  it('a Vietnamese session keeps the Vietnamese title', () => {
    act(() => setLocale('vi'))
    render(<HtmlLangSync />)
    expect(document.title).toBe(VI)
    expect(document.documentElement.lang).toBe('vi')
  })

  it('an English session gets the English title on first paint', () => {
    // The reported bug, at its simplest: the language is already English when the page loads
    // (it was stored from a previous session) and the server still sent Vietnamese markup.
    act(() => setLocale('en'))
    render(<HtmlLangSync />)
    expect(document.title).toBe(EN)
    expect(document.documentElement.lang).toBe('en')
  })

  it('switching VI → EN retitles the tab', () => {
    act(() => setLocale('vi'))
    render(<HtmlLangSync />)
    expect(document.title).toBe(VI)

    act(() => setLocale('en'))
    expect(document.title).toBe(EN)
    expect(document.documentElement.lang).toBe('en')
  })

  it('switching EN → VI retitles it back', () => {
    act(() => setLocale('en'))
    render(<HtmlLangSync />)
    expect(document.title).toBe(EN)

    act(() => setLocale('vi'))
    expect(document.title).toBe(VI)
    expect(document.documentElement.lang).toBe('vi')
  })

  it('the title and the lang attribute never disagree', () => {
    // They describe the same thing to two different audiences — the user and assistive
    // technology. A fix that moved one without the other would just relocate the defect.
    for (const locale of ['en', 'vi', 'en'] as const) {
      cleanup()
      act(() => setLocale(locale))
      render(<HtmlLangSync />)
      expect([document.documentElement.lang, document.title])
        .toEqual([locale, BRAND.title[locale]])
    }
  })

  it('survives a refresh — the stored choice is re-applied over the Vietnamese SSR title', () => {
    act(() => setLocale('en'))
    render(<HtmlLangSync />)
    expect(document.title).toBe(EN)

    // A reload: fresh DOM carrying the server's Vietnamese title, same stored locale.
    cleanup()
    document.title = VI
    document.documentElement.lang = 'vi'
    render(<HtmlLangSync />)
    expect(document.title).toBe(EN)
  })

  it('a direct URL to a deep route is retitled the same way', () => {
    path.current = '/chat'
    act(() => setLocale('en'))
    render(<HtmlLangSync />)
    expect(document.title).toBe(EN)
  })
})

describe("a route's own title is not collateral damage", () => {
  it('a review page title survives a language switch untouched', () => {
    // 🚨 The regression a naive `document.title = siteTitle(locale)` would introduce. This title
    // is the review's subject; it is not a translation of anything and there is no English
    // counterpart to swap in. Overwriting it would be a worse bug than the one being fixed.
    path.current = '/reviews/abc'
    document.title = 'Phở Lệ – TappyAI'
    act(() => setLocale('vi'))
    render(<HtmlLangSync />)
    expect(document.title).toBe('Phở Lệ – TappyAI')

    act(() => setLocale('en'))
    expect(document.title).toBe('Phở Lệ – TappyAI')
    // …while the attribute still tracks the language, because that one is always ours.
    expect(document.documentElement.lang).toBe('en')
  })

  it('a static legal page keeps its own title', () => {
    path.current = '/privacy'
    document.title = 'Chính sách quyền riêng tư'
    act(() => setLocale('en'))
    render(<HtmlLangSync />)
    expect(document.title).toBe('Chính sách quyền riêng tư')
  })

  it('navigating from an own-titled route back to a site-titled one retitles it', () => {
    // Why `pathname` is in the effect deps. Next installs the destination route's title during
    // the navigation commit; without a re-run the Vietnamese title would sit there until the
    // user next changed language.
    act(() => setLocale('en'))
    path.current = '/privacy'
    document.title = 'Chính sách quyền riêng tư'
    const { rerender } = render(<HtmlLangSync />)
    expect(document.title).toBe('Chính sách quyền riêng tư')

    path.current = '/'
    document.title = VI // what Next just installed for the root route
    rerender(<HtmlLangSync />)
    expect(document.title).toBe(EN)
  })
})

describe('the brand strings have exactly one home', () => {
  it('the component holds no copy of them', () => {
    // The owner's constraint on this fix: no duplicate locale logic. The component asks
    // `@/lib/share/openGraph` — the module that already owns BRAND for OG tags and metadata — so
    // the tab title and the share preview cannot drift apart.
    const src = require('node:fs').readFileSync('src/components/HtmlLangSync.tsx', 'utf8')
    expect(src).toMatch(/from '@\/lib\/share\/openGraph'/)
    // Comments stripped first: the file's documentation NAMES `localStorage` when explaining why
    // the locale is client-only, and a guard that fails on an accurate explanation would push the
    // next person to delete the explanation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('TappyAI –')
    expect(code).not.toMatch(/localStorage|tappy_lang/)
  })
})
