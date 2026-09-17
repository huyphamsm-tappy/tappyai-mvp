// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/boi',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
// The legacy chrome is not what this file guards.
vi.mock('@/components/Header', () => ({
  __esModule: true,
  default: ({ title, showBack, backHref }: { title?: string; showBack?: boolean; backHref?: string }) => (
    <header data-testid="header" data-back={showBack ? backHref : ''}>{title}</header>
  ),
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))

import BoiLandingView from './BoiLandingView'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/w3/fortune'
// The harness renders in English; rendered text is asserted against `en`, key coverage against both.
const copy = enCopy

// ── Xem bói hub — the V3 cosmic skin over the SAME three destinations ──────
//
// The reference drew Tarot topics ("Tình yêu / Công việc / Hướng đi") and a
// "Công danh" reading that this product does not have. What exists: Tarot draws
// 1 or 3 cards in a Past / Present / Future spread, and both birth-date readings
// render Love / Career / Money / Health. The chips say that and only that.

// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
afterEach(cleanup)

const renderHub = () => render(<BoiLandingView user={undefined} />)
const feature = (href: string) => document.querySelector(`[data-boi-feature="${href}"]`) as HTMLAnchorElement | null

describe('the chrome it keeps', () => {
  it('renders the existing back-bar with the same title and back target, and the bottom nav', () => {
    renderHub()
    const header = screen.getByTestId('header')
    expect(header.textContent).toMatch(/xem bói|fortune telling/i)
    expect(header.getAttribute('data-back')).toBe('/')
    expect(screen.getByTestId('bottom-nav')).toBeTruthy()
  })
})

describe('the hero', () => {
  it('is a labelled section with an h1 built from the existing copy keys', () => {
    renderHub()
    const hero = document.querySelector('[data-boi-hero]') as HTMLElement
    expect(hero.tagName).toBe('SECTION')
    const h1 = within(hero).getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain(copy['fortune.heroTitleLine1'])
    expect(h1.textContent).toContain(copy['fortune.heroTitleLine2'])
    expect(within(hero).getByText(copy['fortune.heroDesc'])).toBeTruthy()
    expect(within(hero).getByText(copy['fortune.heroEyebrow'])).toBeTruthy()
  })

  it('draws its scene with CSS, not an image asset', () => {
    renderHub()
    const hero = document.querySelector('[data-boi-hero]') as HTMLElement
    expect(hero.querySelector('img, video, picture')).toBeNull()
    expect(hero.querySelectorAll('.v3-boi-tarot')).toHaveLength(3)
    // Every decorative layer is hidden from assistive tech.
    for (const el of hero.querySelectorAll('.v3-boi-stars, .v3-boi-tarot, .v3-boi-ring, .v3-boi-planet')) {
      expect(el.closest('[aria-hidden="true"]')).toBeTruthy()
    }
  })
})

describe('three real destinations, unchanged', () => {
  it('links to /boi/tarot, /boi/tu-vi and /boi/cung-hoang-dao — in that order, nothing else', () => {
    renderHub()
    const links = [...document.querySelectorAll('[data-boi-features] a')].map(a => a.getAttribute('href'))
    expect(links).toEqual(['/boi/tarot', '/boi/tu-vi', '/boi/cung-hoang-dao'])
  })

  it('each card is ONE link carrying its title and description from the dictionary', () => {
    renderHub()
    const tarot = feature('/boi/tarot')!
    expect(tarot.tagName).toBe('A')
    expect(tarot.textContent).toContain(copy['fortune.tarotTitle'])
    expect(tarot.textContent).toContain(copy['fortune.tarotDesc'])
    expect(feature('/boi/tu-vi')!.textContent).toContain(copy['fortune.tuviTitle'])
    expect(feature('/boi/cung-hoang-dao')!.textContent).toContain(copy['fortune.zodiacTitle'])
    // No nested interactive element inside a link: the arrow and chips are spans.
    for (const href of ['/boi/tarot', '/boi/tu-vi', '/boi/cung-hoang-dao']) {
      expect(feature(href)!.querySelector('a, button, input')).toBeNull()
    }
  })

  it('names only readings the sub-pages really render', () => {
    renderHub()
    const chips = (href: string) => [...feature(href)!.querySelectorAll('.v3-boi-chip')].map(c => c.textContent)
    // Tarot: the 3-card spread positions (TarotDraw) — not topics.
    expect(chips('/boi/tarot')).toEqual([copy['fortune.tarotPast'], copy['fortune.tarotPresent'], copy['fortune.tarotFuture']])
    // Both birth-date readings: the four FortuneRow labels TuViForm / CungHoangDaoForm render.
    const readings = [copy['fortune.love'], copy['fortune.career'], copy['fortune.money'], copy['fortune.health']]
    expect(chips('/boi/tu-vi')).toEqual(readings)
    expect(chips('/boi/cung-hoang-dao')).toEqual(readings)
  })

  it('🚨 invents no mode the reference drew', () => {
    renderHub()
    const text = (document.querySelector('[data-boi-features]') as HTMLElement).textContent ?? ''
    for (const fake of ['Hướng đi', 'Công danh', 'Vận may', 'Tính cách', 'Tình yêu', 'Direction', 'Fame', 'Luck', 'Personality']) {
      expect(text, `"${fake}" is not a reading this product renders`).not.toContain(fake)
    }
  })

  it('uses the icon system, not emoji, for the tiles', () => {
    renderHub()
    const features = document.querySelector('[data-boi-features]') as HTMLElement
    expect(features.querySelectorAll('.v3-boi-tile svg').length).toBeGreaterThanOrEqual(3)
    expect(features.textContent ?? '').not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('the disclaimer', () => {
  it('shows the canonical shared disclaimer the sub-pages already use', () => {
    renderHub()
    const note = document.querySelector('[data-boi-disclaimer]') as HTMLElement
    expect(note.textContent).toContain(copy['fortune.disclaimer'])
  })
})

describe('i18n', () => {
  it('every key the hub renders exists in both dictionaries', () => {
    const src = readFileSync('src/app/boi/BoiLandingView.tsx', 'utf8')
    const keys = [...src.matchAll(/'(fortune\.[a-zA-Z0-9]+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(8)
    for (const key of keys) {
      expect(viCopy[key], `${key} missing from vi`).toBeTruthy()
      expect(enCopy[key], `${key} missing from en`).toBeTruthy()
    }
  })

  it('holds no hardcoded Vietnamese UI text', () => {
    const code = readFileSync('src/app/boi/BoiLandingView.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l))).toEqual([])
  })
})

describe('structure', () => {
  it('has one main landmark holding hero, features and note, and no fixed pixel width on the container', () => {
    renderHub()
    const main = document.querySelector('[data-boi-main]') as HTMLElement
    expect(main.tagName).toBe('MAIN')
    expect(main.querySelector('[data-boi-hero]')).toBeTruthy()
    expect(main.querySelector('[data-boi-features]')).toBeTruthy()
    expect(main.querySelector('[data-boi-disclaimer]')).toBeTruthy()
    expect(main.className).toMatch(/max-w-/)
    expect(main.getAttribute('style')).toBeNull()
  })
})
