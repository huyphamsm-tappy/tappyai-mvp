// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import V3Shell from './V3Shell'

// V3 Web · the visual polish pass.
//
// Three things this file pins, each of which was a real defect rather than a matter of taste:
//
//   1. THE BRAND MARK IS THE SHIPPED ASSET. The sidebar drew a `Sparkles` glyph beside hand-styled
//      text — a wordmark invented at the call site. The product has a logo; a component must not
//      draw its own.
//
//   2. THE LIGHT/DARK CONTROL EXISTS AND REALLY SWITCHES. Not "a button is present": the class the
//      whole palette keys off has to change, and the choice has to persist under the key the rest
//      of the app already uses. A toggle that renders but does not move `dark` is decoration.
//
//   3. THE SURFACE DOES NOT PIN ITSELF TO DARK. The shell used to carry a literal `dark` class, so
//      the control could exist and still do nothing on this surface. That class must stay off.
//
// The grid itself is checked by reading the stylesheet: jsdom does no layout, so asserting on
// measured positions here would be theatre. The real alignment was verified in a browser.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** 🪤 Source read as a string includes its COMMENTS. Both assertions below describe what they
 *  replaced ("this was a `Sparkles` icon…", "`.dark .v3-theme` is dark"), so matching the raw text
 *  matched the explanation rather than the code. Strip comments before asserting on source. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function matchMedia(dark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: dark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  matchMedia(false)
})
afterEach(cleanup)

const renderShell = () => render(<V3Shell title="Trang chủ"><div>content</div></V3Shell>)

/** The header's theme control, found the way a user would: by its role and its purpose. */
function themeControl(): HTMLButtonElement {
  const byLabel = screen.getAllByRole('button').filter(b =>
    /giao diện|theme/i.test(b.getAttribute('aria-label') ?? ''))
  expect(byLabel.length, 'exactly one theme control in the header').toBe(1)
  return byLabel[0] as HTMLButtonElement
}

describe('the brand mark is the approved asset, not a drawn one', () => {
  it('renders the shipped logo file by default', () => {
    const { container } = renderShell()
    const img = container.querySelector('img[src*="otter-logo"], img[srcset*="otter-logo"]')
      ?? [...container.querySelectorAll('img')].find(i => (i.getAttribute('src') ?? '').includes('otter-logo'))
    expect(img, 'the sidebar must render /branding/otter-logo.png — the app\'s established mark').toBeTruthy()
  })

  it('still renders the shipped asset in the DEFAULT lockup', () => {
    // 🚨 This assertion USED to be "the brand block contains no <Sparkles>", written when a
    // lucide glyph stood in for the logo. The glyph is gone and the rule outlived it in a more
    // durable form: every lockup - opted in or not - must render `/branding/otter-logo.png`, so
    // no future edit can quietly replace the product's mark with type on any destination.
    const { container } = render(<V3Shell title="Deals"><div /></V3Shell>)
    const img = [...container.querySelectorAll('img')]
      .find(i => (i.getAttribute('src') ?? '').includes('otter-logo'))
    expect(img, 'the default lockup must keep the shipped mark').toBeTruthy()
  })

  it('renders the shipped mark on HOME too, and never gates it behind a layout prop', () => {
    // 🚨 THIS RULE HAS MOVED THREE TIMES AND IS NOW PINNED TO THE BRAND, NOT TO A HOME
    // EXCEPTION.
    //
    // It asserted, in order: that Home rendered no mark; that Home rendered
    // `/branding/otter-logo.png` at 22px; then that Home's lockup contained NO IMAGE at all.
    // That last state is the one the owner reported as a regression - the Home sidebar showed
    // "TappyAI / Personal AI Agent" as type with an empty space where the brand mark had been.
    //
    // What is pinned now: Home renders the SHIPPED asset, at the same 32px every other V3
    // destination renders it. Nothing cropped, nothing redrawn, nothing substituted. And
    // `wordmarkOnly` - which is a TYPE SCALE - must not decide whether the mark exists, which is
    // exactly how it went missing. Passing the prop here is the point of the test.
    const { container } = render(<V3Shell title="Trang chủ" wordmarkOnly><div /></V3Shell>)
    const lockup = container.querySelector('a[href="/"]')!
    const img = [...lockup.querySelectorAll('img')]
      .find(i => (i.getAttribute('src') ?? '').includes('otter-logo'))
    expect(img, 'Home must render /branding/otter-logo.png - the shipped brand mark').toBeTruthy()
    expect(img!.getAttribute('width'), 'at the size it ships at everywhere else').toBe('32')

    // The wordmark itself is unchanged, and still two-tone: "Tappy" in the foreground colour,
    // "AI" in the accent. Restoring the picture must not disturb the type beside it.
    expect(lockup.textContent).toContain('TappyAI')
    const accent = [...lockup.querySelectorAll('span')]
      .find(s => s.textContent === 'AI' && /--v3-accent/.test(s.getAttribute('style') ?? ''))
    expect(accent, '"AI" must keep the brand accent').toBeTruthy()
  })

  it('keeps the app icon on the pages where an app icon is correct', () => {
    // The counterpart to the rule above, from the other side: Deals, Marketplace and Profile
    // ship the icon lockup at 32px, and an edit that drops the image from the default lockup
    // fails here just as dropping it from Home fails above.
    const { container } = render(<V3Shell title="Deals"><div /></V3Shell>)
    const img = [...container.querySelectorAll('a[href="/"] img')]
      .find(i => (i.getAttribute('src') ?? '').includes('otter-logo'))
    expect(img, 'the default lockup keeps the shipped icon').toBeTruthy()
    expect(img!.getAttribute('width'), 'at its own size, unchanged by the Home decision').toBe('32')
  })
})

describe('the Light/Dark control', () => {
  it('is a real, keyboard-reachable button', () => {
    renderShell()
    const btn = themeControl()
    expect(btn.tagName).toBe('BUTTON')
    // A <button> is focusable by default; an explicit negative tabIndex would take that away.
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0)
  })

  it('actually switches the class the whole palette keys off', () => {
    renderShell()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    fireEvent.click(themeControl())
    expect(document.documentElement.classList.contains('dark'), 'the toggle must move `dark` on <html>').toBe(true)
    fireEvent.click(themeControl())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists under the key the rest of the app already uses', () => {
    // Not a new storage key and not a new theme system — `Header.tsx` has always used `theme`.
    renderShell()
    fireEvent.click(themeControl())
    expect(localStorage.getItem('theme')).toBe('dark')
    fireEvent.click(themeControl())
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('adopts a stored choice over the OS preference', () => {
    localStorage.setItem('theme', 'dark')
    matchMedia(false) // OS says light; the stored choice must win
    renderShell()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('falls back to the OS preference when nothing is stored', () => {
    matchMedia(true)
    renderShell()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('reports its state to assistive technology', () => {
    renderShell()
    const btn = themeControl()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(themeControl().getAttribute('aria-pressed')).toBe('true')
  })
})

describe('the surface answers to the control', () => {
  it('does not pin itself to dark', () => {
    // 🚨 The shell used to render `className="v3-theme dark"`. With that literal in place the
    // toggle above could pass every test in this file and still change nothing on screen.
    const { container } = renderShell()
    const root = container.querySelector('.v3-theme')!
    expect(root.classList.contains('dark'), 'the shell must not force its own theme').toBe(false)
  })

  it('puts its header and its content on the same container', () => {
    // The header row and <main> both carry `.v3-container`, which is what makes the page title and
    // the content below it share a left edge. Two different paddings is what they had before.
    const { container } = renderShell()
    expect(container.querySelector('header .v3-container'), 'header content is on the grid').toBeTruthy()
    expect(container.querySelector('main.v3-container'), 'page content is on the same grid').toBeTruthy()
  })
})

describe('the grid is defined once, in tokens', () => {
  const css = read('src/app/globals.css')

  it('declares the layout tokens the pages read', () => {
    for (const token of ['--v3-sidebar-w', '--v3-header-h', '--v3-content-max', '--v3-gutter']) {
      expect(css, `${token} must be defined on .v3-theme`).toContain(token)
    }
    expect(css, 'the shared container must exist').toContain('.v3-container')
  })

  it('defines both palettes, so the control has something to switch between', () => {
    const code = stripComments(css)
    expect(code).toContain('.dark .v3-theme {')
    // The light palette lives on the bare class; without it the "light" state is unstyled.
    const lightBlock = code.slice(code.indexOf('.v3-theme {'), code.indexOf('.dark .v3-theme {'))
    expect(lightBlock).toContain('--v3-page')
    expect(lightBlock).toContain('--v3-fg:')
  })

  it('keeps the accent split into a text tint and a fill', () => {
    // 🚨 One `--v3-accent` could not be both readable ON a dark page and readable UNDER white text.
    // White on the old single value measured 3.17:1 — every filled button was below AA.
    expect(css).toContain('--v3-accent-fill')
    expect(css).toContain('--v3-on-accent')
  })

  it('no V3 page re-caps its own width inside the shared container', () => {
    // A second, narrower max-width inside `.v3-container` is what stranded Home in empty space.
    for (const page of ['src/app/HomeV3.tsx', 'src/app/deals/DealsView.tsx', 'src/app/profile/ProfileView.tsx']) {
      const src = read(page)
      const outerCap = /className="[^"]*mx-auto[^"]*max-w-\[\d+px\][^"]*"/.exec(src)
      expect(outerCap, `${page} must use the shell's container, not its own width`).toBeNull()
    }
  })
})

describe('the shell says words, not keys', () => {
  /**
   * 🚨 The Settings row was written `labelKey: 'nav.settings'` — no `v3.` prefix, no entry in any
   * dictionary — so it rendered the literal string "nav.settings" to users. It survived a design
   * pass, a responsive pass and a polish pass because it sits BELOW the sidebar's scroll fold:
   * every review looked at a screenshot, and the screenshot could not contain it.
   *
   * Asserting on that one key would only pin that one row. What actually failed was the class of
   * defect, so the assertion is the class: nothing the shell renders may be shaped like a
   * translation key. A new row with a typo'd key fails here without anyone thinking to add a case.
   */
  it('renders no raw i18n key as visible text', () => {
    const { container } = renderShell()

    const offenders: string[] = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim()
      // A whole text node that is exactly `word.word[.word…]` and nothing else. Prose containing a
      // full stop has spaces and does not match; a missed key has no spaces and always does.
      if (/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/.test(text)) offenders.push(text)
    }

    expect(offenders, 'these rendered their translation key instead of a translation').toEqual([])
  })
})
