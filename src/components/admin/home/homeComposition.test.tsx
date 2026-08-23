// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ControllerHome } from './ControllerHome'
import type { ControllerHomeData } from './types'

// Controller V2.1 — the Home design pass. SCOPE: `/admin` Home only.
//
// 🔑 WHAT THIS FILE IS FOR. The Home is the one Controller surface whose job is
// hierarchy: an operator should answer "where am I / what is the platform doing
// / what needs me" without scrolling for it. Hierarchy is easy to assert badly
// — a screenshot test would pin pixels and fail on every copy edit — so this
// pins the two things that are actually contractual:
//
//   1. the ORDER of the sections, which is the hierarchy, and
//   2. that nothing gained a fake affordance or a fabricated number.
//
// It deliberately does NOT assert spacing, sizes or colours beyond the token
// rule below. Those are design, and design that a test freezes cannot be
// improved without a test edit — which is how assertions get "relaxed".

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
// The Home probes /api/health on mount; jsdom has no fetch server.
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
afterEach(cleanup)

const HOME_DIR = join(process.cwd(), 'src/components/admin/home')

const data = (over: Partial<ControllerHomeData> = {}): ControllerHomeData =>
  ({
    controllerVersion: 'bdbade4000',
    env: 'production',
    actor: { role: 'super_admin', isOwner: true, email: 'founder@tappyai.com' },
    mode: 'owner',
    platform: { modulesTotal: 12, modulesEnabled: 12, modulesAvailable: 12, hubsTotal: 6 },
    signals: { adminRoles: 2 },
    // `kpis` is HomeKpis and is NOT nullable — the server always returns the
    // envelope and expresses "no data" as status:'empty'. A `null` here crashed
    // BusinessKpis on `snapshotDate`, which was a fixture bug, not a product
    // bug: the type forbids null and `fetchHomeKpis` never returns one.
    kpis: { status: 'empty', snapshotDate: null, isFinal: true, ageDays: null, kpis: [] },
    attention: { recentAudit: [], alerts: [] },
    quickActions: [],
    scope: { isGlobal: true, departmentIds: [] },
    departments: [
      { id: 'ai_data', nameKey: 'admin.dept.aiData', status: 'defined', moduleCount: 3, inScope: true },
      { id: 'legal', nameKey: 'admin.dept.legal', status: 'placeholder', moduleCount: 0, inScope: true },
    ],
    ...over,
  }) as never

/**
 * The Home's section headings, in DOM order.
 *
 * 🔑 HEADINGS, NOT `indexOf` ON THE PAGE TEXT. The first version of this test
 * searched the flattened text for "Enterprise Overview" and matched the COMMAND
 * HEADER's scope label instead of the department grid's heading — so it read
 * the organization section as appearing before Platform Health. Searching
 * rendered prose finds whichever element happens to say the words first;
 * heading elements are the structure the hierarchy actually consists of.
 */
const headings = (el: HTMLElement) =>
  [...el.querySelectorAll('h1, h2')].map((h) => h.textContent?.trim() ?? '')

describe('Home hierarchy — the section order IS the design', () => {
  it('runs identity → platform state → organization → capability → attention', () => {
    const { container } = render(<ControllerHome data={data()} />)
    const h = headings(container)
    const idx = (needle: string) => h.findIndex((x) => x.includes(needle))

    const identity = idx('Enterprise Command Center')
    const health = idx('Platform Health')
    const org = idx('Enterprise Overview')
    const signals = idx('Platform Signals')

    expect(identity, `identity heading missing — got ${JSON.stringify(h)}`).toBeGreaterThanOrEqual(0)
    expect(health, `health heading missing — got ${JSON.stringify(h)}`).toBeGreaterThanOrEqual(0)
    expect(org, `organization heading missing — got ${JSON.stringify(h)}`).toBeGreaterThanOrEqual(0)
    expect(signals, `capability heading missing — got ${JSON.stringify(h)}`).toBeGreaterThanOrEqual(0)

    expect(identity).toBeLessThan(health)
    expect(health).toBeLessThan(org)
    expect(org).toBeLessThan(signals)
  })

  it('renders no raw i18n key anywhere on the Home', () => {
    const { container } = render(<ControllerHome data={data()} />)
    expect(container.textContent ?? '').not.toMatch(/\badmin\.[a-z]+\.[a-zA-Z.]+/)
  })

  it('renders no `undefined` or `NaN` on the Home', () => {
    const { container } = render(<ControllerHome data={data({ signals: { adminRoles: null } as never })} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bundefined\b/)
    expect(text).not.toMatch(/\bNaN\b/)
  })

  it('a `none` actor still gets the header, and no fabricated workspace', () => {
    const { container } = render(
      <ControllerHome data={data({ mode: 'none', departments: [], scope: { isGlobal: false, departmentIds: [] } as never })} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Enterprise Command Center')
    expect(text).not.toMatch(/Enterprise Overview|Your Workspace/)
  })
})

describe('Home uses the Controller theme tokens, not the consumer brand hex', () => {
  const sources = readdirSync(HOME_DIR)
    .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
    .map((f) => [f, readFileSync(join(HOME_DIR, f), 'utf8')] as const)

  it('🔑 no Home component hard-codes #007AFF', () => {
    // NOT an accessibility fix — MEASURED, #007AFF is 4.79:1 on #070E1F and
    // passes AA. It is the CONSUMER brand blue. The Controller's accent is the
    // `--ring` token (#4C9AFF, 6.75:1), and a surface that hard-codes a colour
    // stops following its own theme the next time the theme moves.
    const offenders = sources.filter(([, src]) => /#007AFF/i.test(src)).map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it('no Home component hard-codes a light-mode surface colour', () => {
    // bg-white / text-gray-900 etc. would punch a light hole in a dark surface.
    const offenders = sources
      .filter(([, src]) => /\b(bg-white|text-black|bg-gray-(50|100|200)|text-gray-(800|900))\b/.test(src))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })
})

describe('Home invents no affordance and no data', () => {
  it('department cards remain non-interactive after the design pass', () => {
    const { container } = render(<ControllerHome data={data()} />)
    const articles = [...container.querySelectorAll('article')]
    expect(articles.length).toBeGreaterThan(0)
    for (const a of articles) {
      expect(a.querySelector('a')).toBeNull()
      expect(a.querySelector('button')).toBeNull()
      expect(a.getAttribute('role')).not.toBe('button')
      expect(a.className).not.toContain('cursor-pointer')
    }
  })

  it('🔑 department cards do not react to hover either', () => {
    // The Owner reported trying to click a department card. It was never
    // clickable — but it carried `hover:border-interactive/30`, so it lit up
    // under the pointer. A non-interactive element that responds to hover is
    // promising something it cannot deliver, and that promise is what produced
    // the bug report. Removing the class is the fix; this keeps it removed.
    const { container } = render(<ControllerHome data={data()} />)
    for (const a of container.querySelectorAll('article')) {
      expect(a.className).not.toMatch(/\bhover:/)
      expect(a.className).not.toMatch(/\bgroup\b/)
    }
  })

  it('a department with no modules says so, rather than showing a zero', () => {
    // "0 modules" and "not configured yet" are different facts. The registry
    // says `placeholder`; the card must not render it as a metric.
    const { container } = render(<ControllerHome data={data()} />)
    expect(container.textContent).toContain('Foundation ready')
  })
})
