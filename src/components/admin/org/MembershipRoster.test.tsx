// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MembershipRoster } from './MembershipRoster'

// The roster SURFACE (Owner Decision D6).
//
// Two properties this file exists for, and neither is visible in the service or
// route tests:
//
//   1. READ-ONLY IS ENFORCED BY THE ABSENCE OF CODE, not by a hidden button.
//      D6 keeps assign/suspend/remove in the API because destructive UAT is not
//      authorized. A test that only checked "no button rendered" would pass
//      against a component that had the mutation code behind a flag.
//
//   2. THE DEPARTMENT LABEL IS TRANSLATED THROUGH THE REGISTRY. `ai_data` lives
//      under `admin.dept.aiData`, so `admin.dept.${id}` misses — and `translate`
//      returns the KEY when it misses, which puts `admin.dept.ai_data` on
//      screen. That is exactly the class of defect Phase 7 found in the hub
//      nav-group headings.

const SOURCE = readFileSync(join(__dirname, 'MembershipRoster.tsx'), 'utf8')

const ROW = {
  userId: 'bafa6fc1-29b7-44aa-918c-74bc3af86b25',
  departmentId: 'ai_data',
  orgRole: 'DEPARTMENT_HEAD',
  scope: 'ai_data',
  status: 'active',
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
// Explicit: this project has no global auto-cleanup, so without it every render
// stays in the document and `screen` queries match across tests. The symptom is
// a "found multiple elements" failure in whichever test happens to run third —
// which reads like a bug in that test rather than leakage from the ones before.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const respond = (body: unknown, ok = true) =>
  fetchMock.mockResolvedValue({ ok, json: async () => body })

describe('D6 · the surface is read-only, structurally', () => {
  it('issues exactly one request, and it is a plain GET', async () => {
    respond({ data: [] })
    render(<MembershipRoster />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/org/memberships')
    // No second argument at all: no method, no body, no headers.
    expect(fetchMock.mock.calls[0][1]).toBeUndefined()
  })

  it('the source contains no mutating verb', () => {
    // The absence of code, asserted. A "no button rendered" check would pass
    // against a component that kept the mutation path behind a condition.
    for (const verb of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      expect(SOURCE, verb).not.toContain(`'${verb}'`)
    }
    expect(SOURCE).not.toMatch(/method:\s*['"]/)
  })

  it('renders no button at all', () => {
    respond({ data: [] })
    render(<MembershipRoster />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('D6 · what the roster renders', () => {
  it('shows the membership row', async () => {
    respond({ data: [ROW] })
    render(<MembershipRoster />)
    expect(await screen.findByText(ROW.userId)).toBeTruthy()
  })

  it('translates the department through the registry, not through the id', async () => {
    respond({ data: [ROW] })
    const { container } = render(<MembershipRoster />)
    await screen.findByText(ROW.userId)
    // The failure this catches: `admin.dept.ai_data` printed verbatim.
    expect(container.textContent).not.toContain('admin.dept')
    expect(container.textContent).toContain('AI')
  })

  it('translates the org role and the status — no raw enum on screen', async () => {
    respond({ data: [ROW] })
    const { container } = render(<MembershipRoster />)
    await screen.findByText(ROW.userId)
    expect(container.textContent).not.toContain('DEPARTMENT_HEAD')
    expect(container.textContent).not.toContain('admin.memberships.')
  })

  it('renders an UNKNOWN org role verbatim rather than as a missing key', async () => {
    // An unrecognised value is data, not a label. Printing `admin.memberships
    // .orgRole.WHATEVER` would be worse than printing what the row holds.
    respond({ data: [{ ...ROW, orgRole: 'WHATEVER' }] })
    const { container } = render(<MembershipRoster />)
    await screen.findByText(ROW.userId)
    expect(container.textContent).toContain('WHATEVER')
    expect(container.textContent).not.toContain('admin.memberships.orgRole')
  })
})

describe('D6 · failure is never dressed up as emptiness', () => {
  it('a non-OK response is an error, not "no memberships"', async () => {
    respond({}, false)
    const { container } = render(<MembershipRoster />)
    await waitFor(() => expect(container.textContent).toMatch(/Không đọc được|Could not read/))
  })

  it('a payload that is not a list is an error, not an empty roster', async () => {
    // "No memberships" is a claim an operator would act on.
    respond({ data: { nope: true } })
    const { container } = render(<MembershipRoster />)
    await waitFor(() => expect(container.textContent).toMatch(/Không đọc được|Could not read/))
  })

  it('a thrown fetch is an error state, not an unhandled rejection', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { container } = render(<MembershipRoster />)
    await waitFor(() => expect(container.textContent).toMatch(/Không đọc được|Could not read/))
  })

  it('a genuinely empty roster says so', async () => {
    respond({ data: [] })
    const { container } = render(<MembershipRoster />)
    await waitFor(() => expect(container.textContent).toMatch(/Chưa có thành viên|No department memberships/))
  })
})

describe('D6 · the page enforces before it renders', () => {
  const PAGE = readFileSync(join(__dirname, '../../../app/admin/org/memberships/page.tsx'), 'utf8')

  it('guards on the READ permission', () => {
    expect(PAGE).toMatch(/requirePagePermission\(PERMISSIONS\.SECURITY_MEMBERSHIP_READ\)/)
  })

  it('does not guard on the manage permission', () => {
    expect(PAGE).not.toContain('SECURITY_MEMBERSHIP_MANAGE')
  })
})
