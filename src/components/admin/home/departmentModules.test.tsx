// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { DepartmentModules } from './DepartmentModules'
import { DepartmentCard } from './DepartmentCard'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'

// Controller V2.4 — the department FUNCTION cards, and the line between them and
// `DepartmentCard`.
//
// 🔑 THE POINT OF THIS FILE. V2.1 removed `DepartmentCard`'s click affordance
// because a display-only card that reacts to the pointer promises navigation it
// does not provide. Marketing V1 needs real navigation on the same screen. The
// resolution is two components, not one component with a mode — and two
// components that look alike is exactly how a codebase drifts into reusing one
// for the other, so the difference is pinned here rather than left to review.

const setLang = (l: 'vi' | 'en') => window.localStorage.setItem('tappy_lang', l)

const mod = (moduleId: string, label: string, route: string, icon = 'Megaphone') => ({
  moduleId, label, route, icon,
})

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
  setLang('en')
})
afterEach(cleanup)

describe('department function cards are real navigation', () => {
  it('renders one link per module, pointing at the module route', () => {
    const { container } = render(
      <DepartmentModules
        modules={[
          mod('tappy.hub.marketing.campaigns', 'admin.nav.campaigns', '/admin/marketing/campaigns'),
          mod('tappy.hub.marketing.analytics', 'admin.nav.marketingAnalytics', '/admin/marketing/analytics'),
        ]}
      />
    )
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/admin/marketing/campaigns', '/admin/marketing/analytics'])
  })

  it('🔑 each card is focusable and carries a visible focus state', () => {
    // The affordance DepartmentCard deliberately lacks. Keyboard reachability is
    // the half that a hover style alone would not give.
    const { container } = render(
      <DepartmentModules modules={[mod('m1', 'admin.nav.campaigns', '/admin/marketing/campaigns')]} />
    )
    const link = container.querySelector('a')!
    expect(link.getAttribute('href')).toBeTruthy()
    expect(link.className).toMatch(/focus-visible:/)
    expect(link.className).toMatch(/hover:/)
  })

  it('🔑 is a DIFFERENT component from DepartmentCard, which stays display-only', () => {
    // Rendered side by side: one navigates, the other cannot. If someone ever
    // makes DepartmentCard a link, this fails rather than the change passing
    // review as "consistent".
    const cards = render(
      <DepartmentModules modules={[mod('m1', 'admin.nav.campaigns', '/admin/marketing/campaigns')]} />
    )
    expect(cards.container.querySelector('a')).toBeTruthy()
    cleanup()

    const dept = render(
      <DepartmentCard dept={{ id: 'marketing', nameKey: 'admin.dept.marketing', status: 'defined', moduleCount: 5, inScope: true } as never} />
    )
    expect(dept.container.querySelector('a')).toBeNull()
    expect(dept.container.querySelector('button')).toBeNull()
    expect(dept.container.querySelector('[href]')).toBeNull()
    expect(dept.container.innerHTML).not.toContain('cursor-pointer')
  })
})

describe('the empty state uses the Owner-approved copy, verbatim', () => {
  // The strings are compared against the i18n maps rather than retyped, so a
  // reworded translation cannot drift from what the Owner approved without this
  // failing. The literals below ARE the approved sentences.
  it('EN — "No modules are available for this department yet."', () => {
    expect(enStrings['admin.home.modules.empty']).toBe('No modules are available for this department yet.')
    render(<DepartmentModules modules={[]} />)
    expect(screen.getByText('No modules are available for this department yet.')).toBeTruthy()
  })

  it('VI — "Phòng ban này chưa có chức năng nào."', async () => {
    expect(viStrings['admin.home.modules.empty']).toBe('Phòng ban này chưa có chức năng nào.')
    // The locale is read into a module store at import time, so the language has
    // to be set BEFORE the component module is loaded — hence resetModules plus
    // a fresh dynamic import, the same shape the login suites use. Setting
    // localStorage after a static import silently keeps the previous locale, and
    // the test would then assert English while claiming to check Vietnamese.
    setLang('vi')
    vi.resetModules()
    const { DepartmentModules: Fresh } = await import('./DepartmentModules')
    render(<Fresh modules={[]} />)
    expect(screen.getByText('Phòng ban này chưa có chức năng nào.')).toBeTruthy()
  })

  it('🔑 renders no link at all when there is nothing to offer', () => {
    // An empty grid with a stray link would be a door onto nothing — the exact
    // "pretend functionality" the contract forbids.
    const { container } = render(<DepartmentModules modules={[]} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('the Marketing foundation pages are guarded and claim nothing', () => {
  const PAGES = {
    campaigns: 'MARKETING_CAMPAIGNS_READ',
    content: 'MARKETING_CONTENT_READ',
    audience: 'MARKETING_AUDIENCE_READ',
    promotions: 'MARKETING_PROMOTIONS_READ',
    analytics: 'MARKETING_ANALYTICS_READ',
  } as const

  it.each(Object.entries(PAGES))('/admin/marketing/%s guards on PERMISSIONS.%s', (slug, permission) => {
    // Source-level because the guard's VALUE is the contract: a page that calls
    // `requirePagePermission` with the wrong permission would still "have a
    // guard". Asserted per page so one file cannot be left open.
    const src = readFileSync(`src/app/admin/marketing/${slug}/page.tsx`, 'utf8')
    expect(src).toContain('requirePagePermission')
    expect(src, `${slug} does not guard on ${permission}`).toContain(`PERMISSIONS.${permission}`)
  })

  it('🔑 no Marketing foundation page performs a read, a write, or a mutation', () => {
    // FOUNDATION ONLY. These pages exist so the routes are real and PDP-testable;
    // the moment one of them queries or writes, it has stopped being a
    // placeholder and this fails.
    for (const slug of Object.keys(PAGES)) {
      const src = readFileSync(`src/app/admin/marketing/${slug}/page.tsx`, 'utf8')
      for (const forbidden of ['createAdminClient', 'createClient', 'fetch(', '.from(', 'writeAuditLog', 'revalidate']) {
        expect(src, `${slug}/page.tsx does more than render a placeholder: ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})
