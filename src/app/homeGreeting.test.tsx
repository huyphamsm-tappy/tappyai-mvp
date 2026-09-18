// @vitest-environment jsdom
//
// The V3 Home hero greets like production and the App — not with a static line.
//
// Before: "Hi {name}! 👋 / Bạn muốn làm gì hôm nay?" at every hour of every day, while
// production Web and Android rotated seven time-of-day slots with weekend pools. Now
// HomeV3 renders the two lines `heroGreeting` picks from the server's Vietnam-clock
// facts, in the client's language, with the display name on its own line above —
// and nothing here reads the clock, so server and client markup agree.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import HomeV3 from './HomeV3'
import { setLocale } from '@/lib/i18n/useTranslation'
import { heroGreeting, type HeroClock } from '@/lib/home/heroGreeting'

// The product default is Vietnamese (ADR-027); a case that reads the EN catalogue states it.
beforeEach(() => setLocale('en'))
afterEach(() => { cleanup(); setLocale('en') })

const clock = (hour: number, over: Partial<HeroClock> = {}): HeroClock => ({ hour, isWeekend: false, dayOfMonth: 1, ...over })
const line = (n: 1 | 2) => document.querySelector(`[data-home-greeting-line="${n}"]`)!.textContent
const nameLine = () => document.querySelector('[data-home-greet-name]')!.textContent?.replace(/\s+/g, ' ').trim()

function home(hero: HeroClock, over: Partial<React.ComponentProps<typeof HomeV3>> = {}) {
  return render(<HomeV3 user userInfo={undefined} firstName="Huy" suggestions={[]} conversations={[]} hero={hero} {...over} />)
}

describe('the hero greeting follows the clock the server rendered with', () => {
  it.each([
    ['weekday morning', clock(7), ['A new day begins —', 'Tappy is here to help! 🌅']],
    ['weekday morning, another day', clock(7, { dayOfMonth: 2 }), ['Good morning!', 'What sounds good today? ☀️']],
    ['weekday noon', clock(12), ['Lunch o’clock —', 'let Tappy pick for you 🥢']],
    ['weekday afternoon', clock(15), ['Afternoon slump?', 'Tappy’s got a few ideas 💡']],
    ['weekday evening', clock(18), ['Prime evening —', 'Tappy suggests a great spot! 🍜']],
    ['night', clock(22), ['End of the day —', 'let Tappy help you unwind! 🛁']],
    ['late night', clock(2), ['Late night —', 'but Tappy is ready 🌛']],
    ['Saturday morning', clock(7, { isWeekend: true, dayOfMonth: 2 }), ['Weekend morning!', 'Rest, or somewhere fun? ☀️']],
    ['Sunday evening', clock(18, { isWeekend: true, dayOfMonth: 4 }), ['Weekend evening!', 'Out, or something tasty? 🎊']],
  ])('%s (en)', (_label, hero, [l1, l2]) => {
    home(hero)
    expect(line(1)).toBe(l1)
    expect(line(2)).toBe(l2)
    expect([line(1), line(2)]).toEqual([...heroGreeting(hero, 'en')])
  })

  it('renders the Vietnamese pool for a Vietnamese session, from the same clock', () => {
    act(() => setLocale('vi'))
    home(clock(12, { dayOfMonth: 3 }))
    expect([line(1), line(2)]).toEqual(['12h rồi —', 'ra ngoài hay đặt đồ ăn? Tappy lo! 🛵'])
    home(clock(18, { isWeekend: true, dayOfMonth: 2 }))
    expect(document.querySelectorAll('[data-home-greeting-line="1"]')[1].textContent).toBe('Tối cuối tuần của bạn,')
  })

  it('switching language re-picks from the same slot, without a reload', () => {
    home(clock(9, { dayOfMonth: 5 }))
    expect(line(1)).toBe('Tappy here!')
    act(() => setLocale('vi'))
    expect(line(1)).toBe('Tappy đây!')
    act(() => setLocale('en'))
    expect(line(1)).toBe('Tappy here!')
  })

  it('the greeting is the page’s first heading, two lines, in the hero — the static line is gone', () => {
    const { container } = home(clock(7))
    const h2 = container.querySelector('[data-home-greeting]')!
    expect(h2.tagName).toBe('H2')
    expect(container.querySelectorAll('h2')[0]).toBe(h2)
    expect(container.querySelector('[data-home-section="hero"]')!.contains(h2)).toBe(true)
    expect(h2.querySelectorAll('[data-home-greeting-line]')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('What would you like to do today?')
    expect(document.body.textContent).not.toContain('Bạn muốn làm gì hôm nay?')
  })
})

describe('the display name keeps its own line, as production’s "Xin chào, {name} 👋"', () => {
  it('signed in with a name', () => {
    home(clock(7), { firstName: 'Huy' })
    expect(nameLine()).toBe('Hi Huy! 👋')
  })
  it('signed in without a name falls back to the dictionary word, never a literal', () => {
    home(clock(7), { firstName: '' })
    expect(nameLine()).toBe('Hi You! 👋')
    act(() => setLocale('vi'))
    expect(nameLine()).toBe('Hi Bạn! 👋')
  })
  it('signed out greets a guest', () => {
    home(clock(7), { user: false, firstName: '' })
    expect(nameLine()).toBe('Hello! 👋')
  })
  it('the contextual copy never carries the name — it is production’s verbatim text', () => {
    home(clock(7), { firstName: 'Huy' })
    expect(line(1)).not.toContain('Huy')
    expect(line(2)).not.toContain('Huy')
  })
})

describe('one engine, no clock on the client, no timer, no request', () => {
  const page = readFileSync('src/app/(home)/page.tsx', 'utf8')
  const v3 = readFileSync('src/app/HomeV3.tsx', 'utf8')
  const legacy = readFileSync('src/app/HomeView.tsx', 'utf8')

  it('the page computes the Vietnam clock once, on the server, and hands the facts down', () => {
    expect(page).toContain("import { vietnamHeroClock } from '@/lib/home/heroGreeting'")
    expect(page).toContain('const hero = vietnamHeroClock(nowMs)')
    expect(page).toContain('hero={hero}')
    // The inline Vietnamese pool that used to live here is gone — one copy, in the engine.
    expect(page).not.toContain('HERO_TEXTS')
    expect(page).not.toContain('Thức khuya à?')
  })

  it('HomeV3 resolves the lines from the props and never reads Date, sets a timer, or fetches for it', () => {
    expect(v3).toContain("import { heroGreeting, type HeroClock } from '@/lib/home/heroGreeting'")
    expect(v3).toMatch(/const \[heroLine1, heroLine2\] = heroGreeting\(hero, locale === 'en' \? 'en' : 'vi'\)/)
    expect(v3).not.toContain('vietnamHeroClock')
    expect(v3).not.toMatch(/new Date\(\)\.getHours|setInterval|setTimeout\([^)]*hero/)
    expect(v3).not.toContain('v3.home.askHeadline')
  })

  it('the retained pre-V3 view reads the same engine instead of its own English copy', () => {
    expect(legacy).toContain("import { heroGreeting, type HeroClock } from '@/lib/home/heroGreeting'")
    expect(legacy).not.toContain('HERO_EN')
    expect(legacy).not.toContain('dangerouslySetInnerHTML')
  })
})
