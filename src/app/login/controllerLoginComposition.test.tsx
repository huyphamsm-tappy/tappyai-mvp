// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// Controller V2.4 — PHASE 1 RED TESTS for the Controller login composition.
//
// WHY A SECOND FILE AND NOT AN EDIT OF `controllerLoginLayout.test.tsx`.
// That file is the V2.3 contract and it is GREEN. Rewriting it is how a
// `describe` block gets deleted in silence, and the security invariants it
// carries (no consumer provider, corporate-only, email + password) must keep
// running exactly as they are. This file adds only what V2.3 does NOT lock.
//
// THE APPROVED REFERENCE IS A COMPOSITION, NOT A PRODUCT.
// Large rounded outer container · TappyAI branding/logo artwork · a prominent
// TappyAI otter mascot · a large hero · Controller-oriented capability rows · a
// distinct authentication card · the footer inside that same container.
//
// 🔑 THE CONSUMER LOGIN IS NOT THE REFERENCE. It is a different product that
// happens to share a visual hierarchy. The Controller keeps its own identity —
// "TappyAI Controller", fixed dark theme, corporate login only, no Google, no
// Zalo, no Guest — and none of the consumer product's marketing claims. Nothing
// in this file is justified by "the consumer page does it this way"; the
// assertions describe the approved composition directly.
//
// WHAT V2.3 IS MISSING, STATED AS STRUCTURE.
// V2.3 built the right SKELETON — one rounded shell, a hero, capability rows,
// an auth panel, a footer inside the container. What it did not build is the
// BRAND PRESENCE the composition is organised around:
//
//   · the brand header shows a typographic `T` tile, not TappyAI artwork
//   · the otter is `hidden lg:block` — on a phone there is NO mascot at all
//   · the otter is `opacity-50` at an 80px box — a watermark, not the subject
//   · the otter is `alt=""` + `aria-hidden` — markup calling it decoration
//
// Every assertion is scoped to the LOGIN SHELL, never to the whole document.
// The app's first-visit language modal renders `/tappy/welcome.png` of its own;
// an unscoped "is there a mascot" query would be satisfied by that modal and
// would pass while the Controller had no mascot at all.

const replace = vi.fn()
const getUser = vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } }))
const signInWithPassword = vi.fn(async (_a: { email: string; password: string }) => ({ error: null }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser,
      signInWithPassword,
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInAnonymously: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

vi.mock('@/lib/analytics/authEvents', () => ({
  markAuthPending: vi.fn(),
  emitAuthLoginFailed: vi.fn(),
  getPendingMethod: () => null,
}))

const visitController = async (locale: 'en' | 'vi' = 'en') => {
  // Setting the language ALSO suppresses the first-visit language modal, which
  // renders a mascot of its own. Without this the mascot assertions below would
  // be measuring the modal.
  window.localStorage.setItem('tappy_lang', locale)
  window.history.replaceState({}, '', '/login?returnTo=%2Fadmin')
  const { default: LoginPage } = await import('./page')
  const r = render(<LoginPage />)
  await waitFor(() => expect(screen.getByTestId('controller-login-submit')).toBeTruthy())
  return r
}

const FOOTER = /©\s*\d{4}\s*TappyAI/

/**
 * The login SHELL: the smallest element that contains the sign-in control, the
 * hero heading AND the footer.
 *
 * That triple is the "large rounded outer container, footer inside it" half of
 * the approved composition written as one query. Found by walking up from the
 * submit button rather than by querying a utility class, so it keeps working
 * when the redesign changes the class list — which is the whole point of the
 * redesign.
 *
 * ⚠️ The triple matters. An earlier version of this helper asked only for the
 * hero, and it stopped at the two-column grid — a scope that excludes the brand
 * header and the footer, so every assertion below silently measured the wrong
 * subtree.
 */
const findShell = (container: HTMLElement): HTMLElement => {
  const h1 = container.querySelector('h1')
  expect(h1, 'no page-level h1 — there is no hero to compose around').toBeTruthy()
  let node: HTMLElement | null = screen.getByTestId('controller-login-submit')
  while (node && node !== container) {
    if (h1 && node.contains(h1) && FOOTER.test(node.textContent ?? '')) return node
    node = node.parentElement
  }
  throw new Error('the hero, the auth card and the footer share no container — this is not one composition')
}

/**
 * The auth CARD: the smallest ancestor of the submit control that also holds
 * both credential fields and the card's own heading.
 *
 * The heading is part of the definition on purpose. Without it the walk stops
 * at the `<form>`, and a `<form>` is not the card — the card's heading and its
 * corporate-security line sit outside the form element.
 */
const findCard = (): HTMLElement => {
  let node: HTMLElement | null = screen.getByTestId('controller-login-submit')
  while (node) {
    if (
      node.querySelector('input[type="email"]') &&
      node.querySelector('input[type="password"]') &&
      node.querySelector('h2')
    ) {
      return node
    }
    node = node.parentElement
  }
  throw new Error('the credential fields, the submit control and a card heading share no container')
}

/**
 * The official art already in this repository: the Owner's 18-pose otter
 * library, the Controller's otter logo, and the TappyAI logo files. Anything
 * outside this set is an invented mark, a stock glyph or a placeholder, and
 * fails.
 */
const APPROVED_BRAND_ART = /\/(?:tappy\/[a-z]+\.png|branding\/otter-logo\.png|logo\.(?:png|svg))/

/**
 * `next/image` rewrites `src` into `/_next/image?url=%2Ftappy%2Fwave.png&…`,
 * while `TappyMascot` emits a plain `<img src="/tappy/wave.png">`. Decoding
 * first means these tests accept either implementation and describe the ASSET,
 * not the delivery mechanism.
 */
const assetSrc = (img: HTMLImageElement): string => {
  const raw = img.getAttribute('src') ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

const brandArt = (shell: HTMLElement): HTMLImageElement[] =>
  [...shell.querySelectorAll('img')].filter((img) => APPROVED_BRAND_ART.test(assetSrc(img)))

/**
 * THE BRAND MARK — the identity image that introduces the page, i.e. approved
 * artwork positioned above the hero heading.
 */
const findBrandMark = (shell: HTMLElement): HTMLImageElement | undefined => {
  const h1 = shell.querySelector('h1')
  if (!h1) return undefined
  return brandArt(shell).find((img) => h1.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_PRECEDING)
}

/**
 * THE MASCOT — approved artwork that is NOT the brand mark.
 *
 * 🔑 THE TWO ROLES ARE SEPARATE ELEMENTS, ON PURPOSE. The approved composition
 * asks for branding/logo artwork AND a prominent otter mascot; one image doing
 * double duty satisfies neither well. Defining the mascot by exclusion means a
 * single header logo can never accidentally answer "where is the mascot" — it
 * would leave this list empty, and `requireMascots` below fails loudly on an
 * empty list rather than passing quietly.
 */
const mascots = (shell: HTMLElement): HTMLImageElement[] => {
  const mark = findBrandMark(shell)
  return brandArt(shell).filter((img) => img !== mark)
}

/**
 * ⚠️ THE VACUOUS-PASS GUARD. The assertions below iterate the mascots and check
 * a property of each. On an EMPTY list a `for` loop asserts nothing and the test
 * goes green — so deleting the mascot outright, the most obvious regression
 * there is, would have SATISFIED the tests written to protect it.
 */
const requireMascots = (shell: HTMLElement): HTMLImageElement[] => {
  const found = mascots(shell)
  expect(found.length, 'no official TappyAI mascot inside the login shell').toBeGreaterThan(0)
  return found
}

/**
 * The display width the markup DECLARES for an image, in CSS pixels.
 *
 * Tailwind's numeric scale is 0.25rem per step (`w-20` = 80px). A fluid width
 * (`w-full`, `w-auto`, a percentage) is unbounded and therefore never "tiny", so
 * it returns Infinity. Falling back to the `width` attribute covers a plain
 * `<img width=…>` with no sizing class.
 *
 * ⚠️ jsdom loads no stylesheet and runs no layout, so this reads the DECLARED
 * intent, not a measured box. Real geometry is a Phase 2 visual-QA gate.
 */
const declaredWidthPx = (img: HTMLImageElement): number => {
  const cls = img.getAttribute('class') ?? ''
  if (/(?:^|\s)w-(?:full|auto|screen|\[\d+%\])(?:\s|$)/.test(cls)) return Infinity
  const arbitrary = /(?:^|\s)w-\[(\d+)px\](?:\s|$)/.exec(cls)
  if (arbitrary) return Number(arbitrary[1])
  const scale = /(?:^|\s)w-(\d+)(?:\s|$)/.exec(cls)
  if (scale) return Number(scale[1]) * 4
  const attr = Number(img.getAttribute('width'))
  return Number.isFinite(attr) && attr > 0 ? attr : 0
}

/**
 * Rendered text with the node boundaries PRESERVED as spaces.
 *
 * 🔑 WHY NOT `textContent`. `textContent` concatenates adjacent nodes with no
 * separator, so a provider button next to the card heading reads as
 * `…GoogleSign in…` — and `\bGoogle\b` then finds no word boundary after the
 * `e` and does not match. That is not hypothetical: it is why the V2.3 suite's
 * `still refuses to offer any consumer provider` test stayed GREEN under a
 * mutation that rendered a working Google button (measured, this session).
 * Joining text nodes with a space restores the boundaries the regex needs.
 */
const visibleText = (root: HTMLElement): string => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  let n = walker.nextNode()
  while (n) {
    parts.push(n.nodeValue ?? '')
    n = walker.nextNode()
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Every name a control exposes: its text, plus the attributes AT can read. */
const accessibleNames = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], [role="link"]')]
    .map((el) =>
      [
        visibleText(el as HTMLElement),
        el.getAttribute('aria-label') ?? '',
        el.getAttribute('title') ?? '',
        [...el.querySelectorAll('img')].map((i) => i.getAttribute('alt') ?? '').join(' '),
      ].join(' ')
    )

/**
 * Hidden at the BASE (narrowest) breakpoint.
 *
 * Deliberately mechanism-agnostic: whether the layout is built from CSS grid,
 * grid areas, flexbox or anything else, removing an element from a phone still
 * means `display: none` at the base breakpoint — Tailwind's bare `hidden` token
 * or an inline style. A breakpoint-prefixed `lg:hidden` is a different
 * statement and is not matched here.
 */
const hiddenOnMobile = (el: Element): boolean =>
  /(?:^|\s)hidden(?:\s|$)/.test(el.getAttribute('class') ?? '') ||
  /display:\s*none/.test(el.getAttribute('style') ?? '')

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  window.localStorage.clear()
})
afterEach(cleanup)

// ── A. BRANDING ────────────────────────────────────────────────────────────
describe('V2.4 — Controller login carries TappyAI branding', () => {
  it('🔑 opens with TappyAI brand ARTWORK, not a typographic stand-in', async () => {
    // RED against V2.3: the header mark is `<span>T</span>` — a letter in a
    // gradient box. That is an invented mark, not TappyAI's, and the approved
    // composition opens with real branding/logo artwork.
    //
    // Expressed as DOM ORDER rather than as a class or a wrapper, so it says "a
    // brand image introduces the page" without dictating the markup.
    const { container } = await visitController()
    const shell = findShell(container)
    expect(
      findBrandMark(shell),
      'no approved TappyAI brand artwork appears above the hero heading'
    ).toBeTruthy()
  })

  it('the TappyAI Controller identity is visible as text', async () => {
    const { container } = await visitController()
    const text = findShell(container).textContent ?? ''
    expect(text).toMatch(/TappyAI/)
    expect(text).toMatch(/Controller/)
  })

  it('🔑 the brand mark and the mascot are DIFFERENT elements', async () => {
    // The composition asks for branding artwork AND a prominent mascot. One
    // image cannot be both: a lone header logo would leave the hero with no
    // subject, and a lone hero mascot would leave the page with no mark.
    const { container } = await visitController()
    const shell = findShell(container)
    const mark = findBrandMark(shell)
    const subjects = mascots(shell)
    expect(mark, 'no brand mark to distinguish').toBeTruthy()
    expect(subjects.length, 'the only approved artwork is the brand mark — the hero has no mascot').toBeGreaterThan(0)
    expect(subjects.includes(mark as HTMLImageElement)).toBe(false)
  })
})

// ── B. MASCOT ──────────────────────────────────────────────────────────────
describe('V2.4 — the official otter mascot is a prominent subject', () => {
  it('renders the mascot from the official art library, never a stand-in', async () => {
    // Locks out an emoji, a lucide glyph, an inline SVG or a newly invented
    // mascot: the source must be a file the Owner shipped.
    const { container } = await visitController()
    requireMascots(findShell(container))
  })

  it('🔑 the mascot is presented at a size that reads as the subject', async () => {
    // RED against V2.3: `h-20 w-20` — an 80px circle. "Prominent otter mascot"
    // and a thumbnail tucked under the capability rows are not the same
    // instruction. A fluid width counts as prominent; a small fixed box does
    // not.
    const { container } = await visitController()
    for (const img of requireMascots(findShell(container))) {
      expect(
        declaredWidthPx(img),
        `mascot ${assetSrc(img)} is declared at a thumbnail size`
      ).toBeGreaterThanOrEqual(128)
    }
  })

  it('🔑 the mascot is at full strength, not a faded watermark', async () => {
    // RED against V2.3: `opacity-50`.
    const { container } = await visitController()
    for (const img of requireMascots(findShell(container))) {
      const cls = img.getAttribute('class') ?? ''
      expect(cls, `mascot ${assetSrc(img)} is rendered faded`).not.toMatch(
        /(?:^|\s)opacity-(?:[0-5]?\d)(?:\s|$)/
      )
    }
  })

  it('🔑 the mascot is content, not decoration', async () => {
    // RED against V2.3: `alt=""` + `aria-hidden`. A mascot the composition is
    // organised around is part of what the page SAYS. Marking it decorative is
    // the markup admitting it is an afterthought — and it also tells a screen
    // reader the Controller has no brand imagery at all.
    const { container } = await visitController()
    const described = requireMascots(findShell(container)).filter(
      (img) => (img.getAttribute('alt') ?? '').trim().length > 0 && img.getAttribute('aria-hidden') !== 'true'
    )
    expect(
      described.length,
      'every mascot is aria-hidden with an empty alt — none is presented as content'
    ).toBeGreaterThan(0)
  })
})

// ── C + H. OUTER COMPOSITION AND FOOTER ────────────────────────────────────
describe('V2.4 — one unified login composition', () => {
  it('the hero, the auth card and the footer live in one shell', async () => {
    // `findShell` throws unless a single element holds all three. The extra
    // check is that the shell is a bounded container and not simply `<body>` —
    // a footer "inside the composition" only because the composition is the
    // whole document would satisfy the query while satisfying nothing else.
    const { container } = await visitController()
    const shell = findShell(container)
    expect(shell.tagName.toLowerCase(), 'the shell is the document body').not.toBe('body')
    expect(shell.textContent ?? '').toMatch(FOOTER)
  })

  it('the shell is a single large rounded container', async () => {
    // `rounded-[28px]`, `rounded-3xl` and up. A 4px-radius box is a panel, not
    // the elevated container the approved composition is.
    const { container } = await visitController()
    const shell = findShell(container)
    const radiusCarrier = [shell, ...shell.querySelectorAll('*')].find((el) =>
      /(?:^|\s)rounded-(?:3xl|\[(?:2[0-9]|[3-9]\d)px\])(?:\s|$)/.test(el.getAttribute('class') ?? '')
    )
    expect(radiusCarrier, 'no large-radius container wraps the login').toBeTruthy()
  })
})

// ── E. FEATURE ROWS ────────────────────────────────────────────────────────
describe('V2.4 — the hero states Controller capabilities', () => {
  it('presents the capabilities as a real list of rows', async () => {
    const { container } = await visitController()
    expect(
      findShell(container).querySelectorAll('ul li').length,
      'fewer than three capability rows'
    ).toBeGreaterThanOrEqual(3)
  })

  it('🔑 states Controller capabilities, never consumer marketing', async () => {
    // The Controller is an internal corporate back-office. These three strings
    // are the consumer product's promises (`login.f1Title`/`f2Title`/`f4Title`)
    // and it does not make them. This is the guard that keeps a shared visual
    // hierarchy from turning into shared copy.
    const { container } = await visitController()
    const text = findShell(container).textContent ?? ''
    for (const claim of ['All-in-One AI Assistant', 'Explore Everything', 'Always with You']) {
      expect(text, `consumer marketing claim leaked into the Controller: ${claim}`).not.toContain(claim)
    }
  })
})

// ── F. AUTH CARD ───────────────────────────────────────────────────────────
describe('V2.4 — the auth card is distinct and states the corporate rule', () => {
  it('the corporate-only rule is inside the CARD, not merely somewhere on the page', async () => {
    // Scoped deliberately. `admin.login.subtitle` is rendered twice — once as a
    // header badge, once in the card — so a page-wide `toMatch(/@tappyai\.com/)`
    // stays green even if the card's own line is deleted.
    await visitController()
    expect(
      findCard().textContent ?? '',
      'the auth card carries no corporate security messaging'
    ).toMatch(/@tappyai\.com/)
  })
})

// ── G. CONTROLLER AUTH OPTIONS ─────────────────────────────────────────────
//
// ⚠️ THIS IS NOT DUPLICATE COVERAGE. V2.3's `still refuses to offer any
// consumer provider` uses `container.textContent` with `\b`-anchored provider
// names, and `textContent` drops the boundaries those anchors need. Under a
// mutation that rendered a real `<button>Google</button>` on the Controller
// login, that test PASSED — measured this session, twice, reproducibly. The
// invariant is a security-adjacent one and it was not actually being enforced.
// The V2.3 file is left exactly as it is; this restates the rule so that it
// holds. Repairing the V2.3 assertion is proposed as separate work.
const CONSUMER_PROVIDERS = /\b(?:Google|Zalo|Guest|Facebook)\b|Khách/i

describe('V2.4 — the Controller offers no consumer sign-in', () => {
  it('🔑 names no consumer provider anywhere in the composition', async () => {
    const { container } = await visitController()
    expect(visibleText(findShell(container))).not.toMatch(CONSUMER_PROVIDERS)
  })

  it('🔑 no control is a consumer provider, even without a visible label', async () => {
    // Catches the icon-only variant a text scan cannot see: a provider button
    // whose only name is an `aria-label`, a `title`, or an image `alt`.
    const { container } = await visitController()
    for (const name of accessibleNames(findShell(container))) {
      expect(name, `a control is named for a consumer provider: ${name}`).not.toMatch(CONSUMER_PROVIDERS)
    }
  })

  it('offers exactly one credential path: corporate email + password', async () => {
    const { container } = await visitController()
    const shell = findShell(container)
    const types = [...shell.querySelectorAll('input')].map((i) => i.getAttribute('type'))
    expect(types.filter((t) => t === 'email')).toHaveLength(1)
    expect(types.filter((t) => t === 'password')).toHaveLength(1)
    expect(
      shell.querySelectorAll('button[type="submit"]'),
      'more than one submit path on the Controller login'
    ).toHaveLength(1)
  })
})

// ── I. DARK CONTROLLER THEME ───────────────────────────────────────────────
describe('V2.4 — the Controller theme stays fixed dark', () => {
  it('declares no light-consumer surface and no light/dark switching', async () => {
    // ⚠️ A CLASS IS NOT A RENDERED THEME. jsdom loads no stylesheet, so this
    // cannot prove the page paints dark — it proves the two constructs that
    // made a Controller surface render WHITE before are absent: an opaque
    // `bg-white` surface, and `dark:` variants (which make the theme follow the
    // consumer app's toggle instead of being fixed). Rendered theme is a
    // Phase 2 visual-QA gate.
    const { container } = await visitController()
    const shell = findShell(container)
    for (const el of [shell, ...shell.querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? ''
      expect(cls, `opaque light surface on ${el.tagName}`).not.toMatch(/(?:^|\s)bg-white(?:\s|$)/)
      expect(cls, `theme-switching variant on ${el.tagName}`).not.toMatch(/(?:^|\s)dark:/)
    }
  })
})

// ── J. MOBILE ──────────────────────────────────────────────────────────────
//
// 🔑 BEHAVIOURAL, NOT PRESCRIPTIVE (Owner correction, Phase 1 review). An
// earlier draft required a literal `order-*` / `flex-col` / `flex-row`
// declaration. That named ONE mechanism; grid areas, grid template changes,
// flex ordering and others are all valid ways to re-arrange for a narrow
// viewport, and the test must not pick the winner. What is asserted here is the
// OUTCOME: the mascot survives on a phone, the composition declares some
// narrow-viewport change, and nothing forces a horizontal scrollbar.
//
// ⚠️ jsdom loads no stylesheet and runs no layout engine, so true geometry —
// measured widths, stacking, tap-target size, real visibility — CANNOT be
// asserted here. Those are a PHASE 2 VISUAL-QA GATE at 375px, 768px and 1280px
// in a real browser. Everything below is the structural half.
describe('V2.4 — the composition works on a phone', () => {
  it('🔑 the mascot is present on mobile, not only on a wide desktop', async () => {
    // RED against V2.3: `hidden … lg:block`. Below 1024px the Controller login
    // has no mascot whatsoever — confirmed against the production DOM at a
    // 375px viewport, where the element computes to `display: none`.
    //
    // `hiddenOnMobile` asks only "is it removed at the base breakpoint", which
    // is true of every layout mechanism, so this constrains the outcome and not
    // the technique.
    const { container } = await visitController()
    for (const img of requireMascots(findShell(container))) {
      expect(hiddenOnMobile(img), `mascot ${assetSrc(img)} is removed at the base breakpoint`).toBe(false)
    }
  })

  it('the brand mark is present on mobile too', async () => {
    const { container } = await visitController()
    const mark = findBrandMark(findShell(container))
    expect(mark, 'no brand mark at all').toBeTruthy()
    expect(hiddenOnMobile(mark as HTMLImageElement), 'the brand mark is removed at the base breakpoint').toBe(false)
  })

  it('the composition declares a narrow-viewport arrangement change', async () => {
    // Mechanism-agnostic: ANY breakpoint-prefixed layout utility counts —
    // `md:grid-cols-*`, `lg:flex-row`, `sm:order-*`, `lg:grid-areas-*`, a
    // responsive gap or template. What it refuses is a composition with no
    // responsive layout declaration anywhere, which would mean the desktop
    // arrangement is the only arrangement.
    const { container } = await visitController()
    const shell = findShell(container)
    const declaresResponsiveLayout = [shell, ...shell.querySelectorAll('*')].some((el) =>
      /(?:^|\s)(?:sm|md|lg|xl):(?:grid|flex|order|col|row|gap|place|justify|items|self)[\w-]*/.test(
        el.getAttribute('class') ?? ''
      )
    )
    expect(
      declaresResponsiveLayout,
      'the composition declares no responsive layout change — the desktop arrangement is the only one'
    ).toBe(true)
  })

  it('nothing inside the shell forces a horizontal scrollbar at 375px', async () => {
    // Structural, not measured: jsdom cannot report overflow. What it CAN see is
    // the construct that causes it — a declared width or min-width wider than
    // the narrowest supported viewport.
    const { container } = await visitController()
    const shell = findShell(container)
    for (const el of [shell, ...shell.querySelectorAll('*')]) {
      const style = el.getAttribute('style') ?? ''
      const inline = /(?:^|;)\s*(?:min-)?width:\s*(\d+)px/.exec(style)
      if (inline) {
        expect(Number(inline[1]), `inline width ${inline[1]}px on ${el.tagName}`).toBeLessThanOrEqual(375)
      }
      const cls = el.getAttribute('class') ?? ''
      const arbitrary = /(?:^|\s)(?:min-)?w-\[(\d+)px\]/.exec(cls)
      if (arbitrary) {
        expect(Number(arbitrary[1]), `w-[${arbitrary[1]}px] on ${el.tagName}`).toBeLessThanOrEqual(375)
      }
    }
  })
})
