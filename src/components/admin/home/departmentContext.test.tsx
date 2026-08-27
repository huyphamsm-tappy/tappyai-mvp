// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CommandHeader } from './CommandHeader'
import { DepartmentCard } from './DepartmentCard'
import type { ControllerHomeData } from './types'

// Controller V2.1 — Owner Decision D11: the Home makes department context
// VISIBLE, and it is DERIVED from membership. Never selected.
//
// 🔑 THE DISTINCTION THIS FILE DEFENDS. Making context visible and offering a
// choice look similar in a screenshot and are opposite in architecture. D12
// removed the switcher because "nothing in the repository ever defined what
// SELECTING a department should do"; D11 makes that permanent for V2.1. So
// every assertion that adds visible context is paired with one that refuses a
// control — otherwise this change would quietly reintroduce the thing that was
// deleted, wearing different markup.
//
// The header is driven ONLY by `data`, which the server derives via
// `homeMode()`. No test here supplies a "selected department", because no such
// input exists and none may be added (D11).

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
afterEach(cleanup)

const dept = (id: string, nameKey: string, moduleCount = 0) =>
  ({ id, nameKey, status: moduleCount > 0 ? 'defined' : 'placeholder', moduleCount, inScope: true }) as never

const data = (over: Partial<ControllerHomeData> = {}): ControllerHomeData =>
  ({
    controllerVersion: 'abcdef1234',
    // `env` is a plain union ('production' | 'preview' | 'local'), NOT an object.
    // An object here renders the raw key `admin.home.env.[object Object]`, which
    // is how this fixture was caught being wrong.
    env: 'production',
    actor: { role: 'admin', isOwner: false, email: 'ops@tappyai.com' },
    mode: 'department',
    platform: { modulesTotal: 12, modulesEnabled: 12, modulesAvailable: 12, hubsTotal: 6 },
    signals: { adminRoles: null },
    kpis: null,
    attention: { recentAudit: null, alerts: [] },
    quickActions: [],
    scope: { isGlobal: false, departmentIds: ['marketing'] },
    departments: [dept('marketing', 'admin.dept.marketing')],
    ...over,
  }) as never

describe('D11 — the Home states WHERE the actor is', () => {
  it('every mode carries the Enterprise Command Center identity', () => {
    // The product identity is constant; only the CONTEXT under it changes. An
    // operator must never have to infer which product they are looking at.
    for (const mode of ['owner', 'department'] as const) {
      cleanup()
      const { container } = render(<CommandHeader data={data({ mode })} />)
      expect(container.textContent, mode).toMatch(/Enterprise Command Center|Trung tâm điều hành doanh nghiệp/i)
    }
  })

  it('renders no raw i18n key in any mode', () => {
    // This fixture already caught one: an object `env` produced
    // `admin.home.env.[object Object]` on screen.
    for (const mode of ['owner', 'department', 'none'] as const) {
      cleanup()
      const { container } = render(<CommandHeader data={data({ mode })} />)
      expect(container.textContent ?? '', mode).not.toMatch(/\badmin\.[a-z]+\.[a-zA-Z.]+/)
    }
  })

  it('a member sees their department NAME, not just the word "workspace"', () => {
    // The pre-V2.1 header rendered only the mode label ("Department Workspace"),
    // so an operator in Marketing and an operator in Finance saw identical text.
    render(<CommandHeader data={data()} />)
    expect(screen.getByText(/Marketing/i)).toBeTruthy()
  })

  it('a member is told it is THEIR workspace', () => {
    render(<CommandHeader data={data()} />)
    expect(document.body.textContent).toMatch(/Your Workspace|Không gian làm việc của bạn/i)
  })

  it('the Owner sees the enterprise framing, not a single department', () => {
    const { container } = render(
      <CommandHeader data={data({ mode: 'owner', actor: { role: 'super_admin', isOwner: true, email: 'founder@tappyai.com' } as never, scope: { isGlobal: true, departmentIds: [] } as never, departments: [] })} />
    )
    expect(container.textContent).toMatch(/Enterprise Command Center|Trung tâm điều hành/i)
    expect(container.textContent).toMatch(/All departments|Tất cả phòng ban|Enterprise Overview|Tổng quan doanh nghiệp/i)
  })

  it('🔑 multiple memberships are NOT collapsed into an invented "primary" department', () => {
    // D11: if an actor ever holds more than one membership, no behaviour is to
    // be invented. Picking departments[0] as "the" department would be exactly
    // that invention — and it is what the removed switcher existed to avoid.
    const { container } = render(
      <CommandHeader data={data({
        scope: { isGlobal: false, departmentIds: ['marketing', 'finance'] } as never,
        departments: [dept('marketing', 'admin.dept.marketing'), dept('finance', 'admin.dept.finance')],
      })} />
    )
    const text = container.textContent ?? ''
    const namesShown = [/Marketing/i, /Finance/i].filter((re) => re.test(text)).length
    // Either both are named, or neither is singled out. Exactly one = invented.
    expect(namesShown === 2 || namesShown === 0).toBe(true)
  })

  it('an actor with no membership is not given a fabricated context', () => {
    const { container } = render(
      <CommandHeader data={data({ mode: 'none', scope: { isGlobal: false, departmentIds: [] } as never, departments: [] })} />
    )
    expect(container.textContent).not.toMatch(/Your Workspace|Không gian làm việc của bạn/i)
  })
})

describe('D11 — visible context, but still NO choice', () => {
  it.each(['owner', 'department', 'none'] as const)('renders no selector in %s mode', (mode) => {
    const { container } = render(<CommandHeader data={data({ mode })} />)
    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('the header offers no department control of any kind', () => {
    const { container } = render(<CommandHeader data={data()} />)
    // A switcher rebuilt as buttons would pass the <select> check above.
    const controls = [...container.querySelectorAll('button, a[href]')]
    const departmental = controls.filter((el) => /marketing|finance|department|phòng ban/i.test(el.textContent ?? ''))
    expect(departmental.map((el) => el.textContent)).toEqual([])
  })
})

describe('D11 — DepartmentCard stays display-only', () => {
  it('is not a link, a button, or clickable', () => {
    const { container } = render(<DepartmentCard dept={dept('marketing', 'admin.dept.marketing', 2) as never} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[role="button"]')).toBeNull()
    expect(container.querySelector('[role="link"]')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
    expect(container.innerHTML).not.toContain('cursor-pointer')
  })
})
