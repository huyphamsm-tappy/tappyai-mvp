// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
// RED: neither module exists yet. D14 authorizes both.
import { WorkspaceChooser } from './WorkspaceChooser'
import { ControllerLoginCard } from './ControllerLoginCard'

// Controller V2.2 — Owner Decision D14. The entry surfaces.
//
// 🔑 THE CENTRAL DISTINCTION THIS FILE EXISTS TO ENFORCE.
//
// The Home's DepartmentCard is DISPLAY-ONLY, and V2.1 had to strip its hover
// state because merely lighting up under the pointer made the Owner try to
// click it. The chooser's cards are the exact opposite: they ARE navigation
// controls, so every affordance the Home card must not have, these must have.
//
// Two components that look similar and behave oppositely is precisely how a
// codebase drifts into one being reused for the other, so these tests assert
// the interactive contract explicitly rather than trusting the file name.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
afterEach(cleanup)

const dept = (id: string, nameKey: string, moduleCount = 0) => ({ id, nameKey, moduleCount })

const departments = [
  dept('marketing', 'admin.dept.marketing', 0),
  dept('finance', 'admin.dept.finance', 0),
  dept('ai_data', 'admin.dept.aiData', 3),
]

describe('D14 — the chooser states the question plainly', () => {
  it('names the product and the task', () => {
    const { container } = render(<WorkspaceChooser departments={departments as never} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Choose your workspace|Chọn không gian làm việc/i)
    expect(text).toMatch(/Controller/)
  })

  it('lists every department the actor may enter, and no others', () => {
    render(<WorkspaceChooser departments={departments as never} />)
    expect(screen.getByText(/Marketing/i)).toBeTruthy()
    expect(screen.getByText(/Finance/i)).toBeTruthy()
    expect(screen.getByText(/AI \/ Data/i)).toBeTruthy()
  })

  it('renders no raw i18n key and no undefined/NaN', () => {
    const { container } = render(<WorkspaceChooser departments={departments as never} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\badmin\.[a-z]+\.[a-zA-Z.]+/)
    expect(text).not.toMatch(/\bundefined\b/)
    expect(text).not.toMatch(/\bNaN\b/)
  })

  it('does not fabricate a metric for a department that owns no modules', () => {
    // Same honesty rule the Home follows: "0 modules" and "nothing configured"
    // are different facts, and only one of them is true here.
    const { container } = render(<WorkspaceChooser departments={[dept('marketing', 'admin.dept.marketing', 0)] as never} />)
    expect(container.textContent).not.toMatch(/\b0\s*(modules|mô-đun)/i)
  })
})

describe('🔑 D14 — chooser cards are REAL controls (the opposite of the Home card)', () => {
  it('each department is a link or a button, not an <article>', () => {
    const { container } = render(<WorkspaceChooser departments={departments as never} />)
    const controls = container.querySelectorAll('a[href], button')
    expect(controls.length).toBeGreaterThanOrEqual(departments.length)
    expect(container.querySelectorAll('article').length).toBe(0)
  })

  it('each carries the department in the URL as ?dept=<id> — the only storage D14 allows', () => {
    const { container } = render(<WorkspaceChooser departments={departments as never} />)
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '')
    for (const id of ['marketing', 'finance', 'ai_data']) {
      expect(hrefs.some((h) => h.includes(`dept=${id}`)), `no link carries dept=${id}`).toBe(true)
    }
  })

  it('is keyboard reachable — every control is focusable', () => {
    const { container } = render(<WorkspaceChooser departments={departments as never} />)
    for (const el of container.querySelectorAll('a[href], button')) {
      const ti = el.getAttribute('tabindex')
      expect(ti === null || Number(ti) >= 0, 'a control was removed from the tab order').toBe(true)
    }
  })

  it('shows hover AND focus affordance — unlike the Home card, which must show neither', () => {
    const { container } = render(<WorkspaceChooser departments={departments as never} />)
    const cls = [...container.querySelectorAll('a[href], button')].map((e) => e.className).join(' ')
    expect(cls, 'no hover state').toMatch(/hover:/)
    expect(cls, 'no visible focus state').toMatch(/focus-visible:|focus:/)
    expect(cls, 'no pointer cursor').toMatch(/cursor-pointer/)
  })

  it('stores nothing — no cookie, no localStorage, no persistence (D11 still binds)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<WorkspaceChooser departments={departments as never} />)
    expect(setItem).not.toHaveBeenCalled()
    expect(document.cookie).not.toMatch(/dept/)
    setItem.mockRestore()
  })
})

describe('D14 — the redesigned Controller login keeps its security contract', () => {
  const noop = async () => ({ ok: true as const })

  it('states the product and its purpose', () => {
    const { container } = render(<ControllerLoginCard signIn={noop} onAuthenticated={() => {}} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Welcome to Controller|Chào mừng .*Controller/i)
    expect(text).toMatch(/enterprise command center|trung tâm điều hành/i)
  })

  it('still says who may enter, and still asks for email + password', () => {
    const { container } = render(<ControllerLoginCard signIn={noop} onAuthenticated={() => {}} />)
    expect(container.textContent).toMatch(/@tappyai\.com/)
    expect(container.querySelector('input[type="email"], input[name="email"]')).toBeTruthy()
    expect(container.querySelector('input[type="password"]')).toBeTruthy()
  })

  it('🔑 offers NO consumer provider — the Controller card must never grow Google/Zalo/Guest', () => {
    const { container } = render(<ControllerLoginCard signIn={noop} onAuthenticated={() => {}} />)
    expect(container.textContent ?? '').not.toMatch(/Google|Zalo|Guest|Khách/i)
  })

  it('renders no raw i18n key', () => {
    const { container } = render(<ControllerLoginCard signIn={noop} onAuthenticated={() => {}} />)
    expect(container.textContent ?? '').not.toMatch(/\badmin\.[a-z]+\.[a-zA-Z.]+/)
  })
})
