// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi as hubVi, en as hubEn, hubText } from './discovery'
import { setLocale, translate } from './useTranslation'
import { HUB_DOMAINS, HUB_EXAMPLE_COUNT, HUB_FAQ_COUNT, hubCopy } from '@/lib/discovery/domainHubs'
import HubBody from '@/app/(discovery)/[domain]/HubBody'

// ─────────────────────────────────────────────────────────────────────────────
// G1 Guard — the five public hubs speak from ONE dictionary, in BOTH languages.
//
// Same contract as shareI18n.test.ts: every key exists in vi and en, nothing is
// empty, and the page layer carries no literal text of its own. Plus what a
// dictionary test alone cannot see: the hub really renders English when the
// visitor's locale is English, and Vietnamese by default for crawlers.
// ─────────────────────────────────────────────────────────────────────────────

const VIETNAMESE = /[À-ưẠ-ỹ]/
const ROOT = join(__dirname, '..', '..', '..')

describe('discovery (hub) i18n — dictionary', () => {
  const viKeys = Object.keys(hubVi).sort()
  const enKeys = Object.keys(hubEn).sort()

  it('has identical key sets in Vietnamese and English', () => {
    expect(enKeys).toEqual(viKeys)
  })

  it('has no empty value, and no English value is still Vietnamese', () => {
    for (const k of viKeys) expect(hubVi[k].trim().length, k).toBeGreaterThan(0)
    for (const k of enKeys) {
      expect(hubEn[k].trim().length, k).toBeGreaterThan(0)
      // The English side may name a Vietnamese dish or place (bún bò, Đà Lạt); an
      // entire Vietnamese SENTENCE left in the English map is the regression.
      expect(hubEn[k].split(' ').filter((w) => VIETNAMESE.test(w)).length, `${k} looks untranslated`).toBeLessThan(3)
    }
  })

  it('covers every hub domain with the full content shape', () => {
    for (const d of HUB_DOMAINS) for (const locale of ['vi', 'en'] as const) {
      const c = hubCopy(d, locale)
      expect(c.title).not.toMatch(/^hub\./); expect(c.h1).not.toMatch(/^hub\./)
      expect(c.examples).toHaveLength(HUB_EXAMPLE_COUNT)
      expect(c.faq).toHaveLength(HUB_FAQ_COUNT)
      for (const e of c.examples) expect(e).not.toMatch(/^hub\./)
      for (const f of c.faq) { expect(f.q).not.toMatch(/^hub\./); expect(f.a).not.toMatch(/^hub\./) }
    }
  })

  it('is layered into the ONE client translation store, so t() resolves hub keys', () => {
    expect(translate('vi', 'hub.ui.tryNow')).toBe(hubVi['hub.ui.tryNow'])
    expect(translate('en', 'hub.ui.tryNow')).toBe(hubEn['hub.ui.tryNow'])
    expect(translate('en', 'hub.ui.askAbout', { domain: 'food' })).toBe('Ask Tappy about food')
    expect(hubText('en', 'hub.ui.askAbout', { domain: 'food' })).toBe('Ask Tappy about food')
  })

  it('the hub page layer owns no literal Vietnamese text (only dictionary keys)', () => {
    for (const f of ['src/app/(discovery)/[domain]/page.tsx', 'src/app/(discovery)/[domain]/HubBody.tsx', 'src/lib/discovery/domainHubs.ts']) {
      const code = readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
      expect(VIETNAMESE.test(code), `${f} carries hardcoded Vietnamese`).toBe(false)
    }
  })
})

describe('discovery (hub) i18n — rendering in both locales', () => {
  afterEach(() => { cleanup(); act(() => { setLocale('vi') }) })

  it('renders Vietnamese by default (what a crawler receives)', () => {
    act(() => { setLocale('vi') })
    const { container } = render(<HubBody domain="food" results={[]} />)
    expect(container.querySelector('h1')?.textContent).toBe(hubVi['hub.food.h1'])
    expect(container.textContent).toContain(hubVi['hub.ui.tryNow'])
    expect(container.textContent).toContain(hubVi['hub.food.faq1.q'])
  })

  it('renders English for an English visitor — headings, examples, FAQ and the CTA', () => {
    act(() => { setLocale('en') })
    const { container } = render(<HubBody domain="travel" results={[{ slug: 'AbCdEfGh12', title: 'T', query: 'q', domain: 'travel', locale: 'vi', created_at: '2026-09-13T00:00:00.000Z', image: null }]} />)
    const text = container.textContent ?? ''
    expect(container.querySelector('h1')?.textContent).toBe(hubEn['hub.travel.h1'])
    expect(text).toContain(hubEn['hub.ui.tryNow'])
    expect(text).toContain(hubEn['hub.ui.sharedResults'])
    expect(text).toContain(hubEn['hub.travel.example1'])
    expect(text).toContain(hubEn['hub.travel.faq1.q'])
    expect(text).toContain('Ask Tappy about travel')
    expect(text).not.toContain(hubVi['hub.travel.h1'])
  })

  it('keeps the crawlable structure in both locales: links into chat and to every hub', () => {
    for (const locale of ['vi', 'en'] as const) {
      act(() => { setLocale(locale) })
      const { container, unmount } = render(<HubBody domain="spa" results={[]} />)
      const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
      expect(hrefs.filter((h) => h.startsWith('/chat?category=spa&q=')).length).toBe(HUB_EXAMPLE_COUNT)
      for (const d of HUB_DOMAINS) expect(hrefs).toContain(`/${d}`)
      unmount()
    }
  })
})
