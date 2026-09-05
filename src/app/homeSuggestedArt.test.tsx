// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

import HomeV3, { assignCardArt } from './HomeV3'

// V3 Web Home — the art on the "Suggested for you" cards.
//
// The picture on these cards is PRESENTATION ONLY. A card is a conversation starter: picture ->
// category -> prompt -> /chat. It is not a listing, so nothing on it may look like commerce.
//
// 🚨🚨 THE DEFECT THIS FILE EXISTS FOR, AND THE WAY IT ESCAPED.
//
// The art used to be `CATEGORY_ART[category]` — one immutable picture per category. The live
// generator is free to emit the same category twice, and it did: two `travel` prompts in one row,
// so two cards rendered the SAME picture. Plainly visible in the browser, and green in the tests.
//
// It was green because the old suite fed five DISTINCT categories. With one category per card a
// per-category lookup cannot collide, so the test proved a property of its own fixture rather than
// a property of the page. Every case below that matters therefore feeds REPEATED categories —
// that is the input shape the real data produces, and the only one that can catch this.
//
// Two lifespans are pinned here, deliberately kept apart:
//
//   · THE PERMANENT RULES — one picture per card, never repeated in a row, stable across renders,
//     and no fabricated commerce claim. These outlive every art change.
//
//   · THE TEMPORARY STATE — today's pictures are authored gradient placeholders, because the
//     repository contains no lifestyle photography (audited across the full git history; see the
//     comment above ART_POOL in HomeV3.tsx for the inventory and for why the existing
//     public/tappy/ character set does not substitute). The last block FAILS ON PURPOSE once that
//     stops being true, so the stand-in cannot quietly become permanent.

afterEach(cleanup)

type Sugg = { text: string; textEn: string; category: string; emoji: string; gradient: string; imageUrl?: string }

const sugg = (text: string, category: string, extra: Partial<Sugg> = {}): Sugg => ({
  text, textEn: text, category, emoji: 'x', gradient: 'from-red-100 to-orange-100', ...extra,
})

/** Five distinct categories — the shape that USED to be the only one tested. Kept, because it is
 *  still a real case, but it is no longer the case that carries the weight. */
const DISTINCT = [
  sugg('Dinner nearby', 'food'),
  sugg('Weekend trip', 'travel'),
  sugg('Quiet coffee', 'shopping'),
  sugg('Book a spa', 'spa'),
  sugg('Something to watch', 'entertainment'),
]

/** 🚨 THE CASE THAT MATTERS: three of the five cards share a category. This is what the live
 *  generator produced, and it is what the old abstraction could not survive. */
const REPEATED = [
  sugg('A resort near the city', 'travel'),
  sugg('A staycation this weekend', 'travel'),
  sugg('Dinner nearby', 'food'),
  sugg('Something to watch', 'entertainment'),
  sugg('A long trip next month', 'travel'),
]

function renderHome(suggestions: Sugg[]) {
  return render(
    <HomeV3 user userInfo={undefined} firstName="Huy" suggestions={suggestions} conversations={[]} />,
  )
}

/** The Suggested strip, found by the section marker the page already carries. */
function suggested(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-home-section="for-you"]')
  expect(el, 'Home must render the Suggested section').toBeTruthy()
  return el!
}

const cardsIn = (container: HTMLElement) => [...suggested(container).querySelectorAll('a')]
const artIn = (container: HTMLElement) =>
  [...suggested(container).querySelectorAll('img')].map(i => i.getAttribute('src') ?? '')

describe('every card gets its own picture, whatever the categories do', () => {
  it('gives five cards five different pictures when the categories REPEAT', () => {
    // 🚨 THE REGRESSION TEST. Three `travel` cards in one row, and three different pictures.
    const { container } = renderHome(REPEATED)
    const art = artIn(container)
    expect(art.length, 'all five cards carry art').toBe(5)
    expect(new Set(art).size, `two cards are showing the same picture: ${art.join(', ')}`).toBe(5)
  })

  it('still does when they are all distinct', () => {
    const { container } = renderHome(DISTINCT)
    const art = artIn(container)
    expect(art.length).toBe(5)
    expect(new Set(art).size).toBe(5)
  })

  it('holds for every arrangement of one repeated category', () => {
    // Position matters to the fallback, so the duplicate is walked through every slot rather than
    // tested once where it happens to be convenient.
    for (let dup = 0; dup < 5; dup++) {
      const cards = DISTINCT.map((s, i) => (i === dup ? sugg(`dup ${i}`, 'travel') : s))
      const art = assignCardArt(cards)
      expect(new Set(art).size, `duplicate at index ${dup} collided: ${art.join(', ')}`).toBe(5)
    }
  })

  it('survives five identical categories', () => {
    const art = assignCardArt(Array.from({ length: 5 }, () => ({ category: 'travel' })))
    expect(new Set(art).size, 'one category five times must still yield five pictures').toBe(5)
  })

  it('does not repeat itself between renders', () => {
    // 🚨 STABILITY IS A REQUIREMENT, NOT AN ACCIDENT. A row that reshuffles its own artwork on each
    // render looks broken while it hydrates and unfamiliar on a revisit. The assignment must be a
    // pure function of the cards — no clock, no randomness.
    const first = renderHome(REPEATED)
    const a = artIn(first.container)
    cleanup()
    const second = renderHome(REPEATED)
    const b = artIn(second.container)
    expect(b, 'the same suggestions must produce the same pictures').toEqual(a)
    expect(assignCardArt(REPEATED)).toEqual(assignCardArt(REPEATED))
  })

  it('is decided by order and category alone, never by the words on the card', () => {
    // Guards against a future "smart" assignment that reads the prompt text. The prompt is the
    // semantic content; the picture is decoration and must not start interpreting it.
    const reworded = REPEATED.map(s => sugg(`${s.text} (reworded)`, s.category))
    expect(assignCardArt(reworded)).toEqual(assignCardArt(REPEATED))
  })
})

describe('the art is decoration, and says so', () => {
  it('hides it from assistive technology', () => {
    // The link text already says where it goes. An announced decorative picture is noise, and an
    // alt string describing it would be a second, competing name for the same link.
    const { container } = renderHome(REPEATED)
    for (const img of suggested(container).querySelectorAll('img')) {
      expect(img.getAttribute('alt'), 'decorative art takes an empty alt').toBe('')
      expect(img.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('points at files that actually exist', () => {
    // The whole point of art-as-files is that swapping one is a path change. A typo in that path
    // renders a broken image on the most visible surface in the product. jsdom loads nothing, so
    // the asset is checked on disk — that is what the browser will ask the server for.
    const { container } = renderHome(REPEATED)
    for (const src of artIn(container)) {
      expect(src, 'card art must be a local asset, not a remote URL').toMatch(/^\//)
      expect(existsSync(join(process.cwd(), 'public', src)), `${src} is not in public/`).toBe(true)
    }
  })
})

describe('the picture never touches the meaning', () => {
  it('leaves category metadata exactly as the generator sent it', () => {
    // 🚨 The art is now assigned independently of category, which makes exactly one new mistake
    // possible: deriving the visible category FROM the picture. The label and the `category`
    // parameter must still be the generator's own value, in the generator's own order.
    const { container } = renderHome(REPEATED)
    const sent = REPEATED.map(s => s.category)
    const rendered = cardsIn(container).map(
      a => new URLSearchParams(a.getAttribute('href')!.split('?')[1]).get('category'),
    )
    expect(rendered, 'category metadata must survive the art assignment untouched').toEqual(sent)
  })

  it('keeps the prompt as the semantic content, and it opens Chat', () => {
    const { container } = renderHome(REPEATED)
    const links = cardsIn(container)
    expect(links.length).toBe(5)
    links.forEach((link, i) => {
      const href = link.getAttribute('href')!
      expect(href, 'a card must open Chat').toMatch(/^\/chat\?q=/)
      expect(decodeURIComponent(href), 'carrying its own prompt').toContain(REPEATED[i].text)
      expect((link.textContent ?? '').trim().length, 'a card must say something').toBeGreaterThan(0)
    })
  })

  it('shows no price, discount, rating or sales count', () => {
    // 🚨 THE PERMANENT RULE. There is no recommendation or deal data behind these cards — they are
    // conversation starters. Anything that reads as a fact about a merchant is invented, and an
    // invented fact on the first screen of the product is the most expensive kind.
    //
    // Note this checks RENDERED CHROME, not the prompt wording: a prompt may say "deal" the way a
    // person would ("any deals today?"), because a question is not a claim.
    const { container } = renderHome(REPEATED)
    const text = suggested(container).textContent ?? ''
    const fabrications: [RegExp, string][] = [
      [/\d+\s*%/, 'a discount'],
      [/\bOFF\b/i, 'a discount'],
      [/[\d.,]+\s*(?:VND|USD)\b/i, 'a price'],
      [/\$\s*[\d.,]+/, 'a price'],
      [/\b\d[\d.,]*\s*(?:sold|reviews?)\b/i, 'a sales or review count'],
      [/\b[0-5](?:\.\d)?\s*(?:stars?|\/\s*5)\b/i, 'a rating'],
      [/\bbest price\b|\btop rated\b|\bends (?:tonight|today)\b/i, 'a promotional claim'],
    ]
    for (const [pattern, what] of fabrications) {
      expect(text, `a Suggested card is showing ${what}, which no real data backs`).not.toMatch(pattern)
    }
  })
})

describe('real imagery, when it exists, wins', () => {
  it('renders a recommendation photograph instead of a placeholder', () => {
    // The seam for real data. Nothing sets `imageUrl` today; this pins that the presentation layer
    // is ready for it rather than needing another rewrite when it arrives.
    const withPhoto = REPEATED.map((s, i) =>
      i === 1 ? sugg(s.text, s.category, { imageUrl: '/branding/hero-bg.webp' }) : s)
    const { container } = renderHome(withPhoto)
    const art = artIn(container)
    expect(art[1], 'a real photograph must beat the stand-in').toBe('/branding/hero-bg.webp')
    expect(new Set(art).size, 'and the other four must still differ').toBe(5)
  })

  it('does not mark a real photograph as a placeholder', () => {
    const withPhoto = REPEATED.map((s, i) =>
      i === 1 ? sugg(s.text, s.category, { imageUrl: '/branding/hero-bg.webp' }) : s)
    const { container } = renderHome(withPhoto)
    const imgs = [...suggested(container).querySelectorAll('img')]
    expect(imgs[1].getAttribute('data-art-placeholder'), 'a real picture is not a stand-in').toBeNull()
    expect(imgs[0].getAttribute('data-art-placeholder'), 'the rest still are').toBeTruthy()
  })

  it('does not let a real photograph consume a slot in the placeholder pool', () => {
    // If real imagery were drawn from the same pool, the card next to it would lose a scene it
    // could have had. Real pictures come from outside the pool and take nothing from it.
    const art = assignCardArt([
      { category: 'travel', imageUrl: '/branding/hero-bg.webp' },
      { category: 'travel' },
    ])
    expect(art[1], 'the placeholder card keeps the travel scene').toBe('/home/inspire/travel.svg')
  })
})

describe('the placeholder cannot be forgotten', () => {
  it('is marked in the DOM for exactly as long as it is a placeholder', () => {
    // 🚧 WHEN CURATED IMAGERY LANDS: delete `data-art-placeholder` from HomeV3.tsx and delete this
    // block. It exists so a temporary visual cannot quietly become the permanent one — the brief
    // asked for real lifestyle imagery and this is not it.
    const { container } = renderHome(REPEATED)
    for (const img of suggested(container).querySelectorAll('img')) {
      expect(
        img.getAttribute('data-art-placeholder'),
        'the stand-in art must stay marked until it is replaced',
      ).toBeTruthy()
    }
  })

  it('records WHY it is a placeholder where the next person will look', () => {
    // A bare marker attribute invites deletion by someone who reads it as lint. The reasoning —
    // what was audited, and why the obvious substitute is wrong — lives next to the paths.
    const src = readFileSync(join(process.cwd(), 'src/app/HomeV3.tsx'), 'utf8')
    const anchor = src.indexOf('const ART_POOL')
    expect(anchor, 'ART_POOL must exist for this assertion to mean anything').toBeGreaterThan(0)
    const block = src.slice(0, anchor)
    expect(block, 'the placeholder must explain itself').toContain('PLACEHOLDER ART')
    expect(block, 'and must say what would replace it').toContain('public/home/inspire/')
  })
})
