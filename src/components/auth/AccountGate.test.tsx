// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ status: 'visitor' as 'loading' | 'member' | 'visitor' }))
vi.mock('@/hooks/useAuthStatus', () => ({ useAuthStatus: () => h.status }))
vi.mock('next/navigation', () => ({ usePathname: () => '/split-bill' }))
import AccountGate from './AccountGate'

afterEach(() => { cleanup(); h.status = 'visitor' })

// Owner 28/11/2026: everything except the chat with Tappy needs an account. A visitor may look at a tool, not use it.
describe('AccountGate', () => {
  it('a visitor sees the tool but cannot use it: it is inert, and a sign-in link brings them back to the same page', () => {
    render(<AccountGate><button>Tính</button></AccountGate>)
    expect(screen.getByRole('button', { name: 'Tính' })).toBeTruthy() // visible
    const wrap = screen.getByTestId('account-gate-content')
    expect(wrap.hasAttribute('inert')).toBe(true)
    expect(wrap.getAttribute('aria-disabled')).toBe('true')
    expect(wrap.className).toMatch(/pointer-events-none/)
    expect(screen.getByRole('link', { name: /Đăng nhập/ }).getAttribute('href')).toBe('/login?returnTo=%2Fsplit-bill')
    expect(screen.getByTestId('account-gate-banner').textContent).toMatch(/chat với Tappy/)
  })

  it('a member gets the tool exactly as it is: no wrapper, no banner', () => {
    h.status = 'member'
    render(<AccountGate><button>Tính</button></AccountGate>)
    expect(screen.queryByTestId('account-gate-content')).toBeNull()
    expect(screen.queryByTestId('account-gate-banner')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tính' })).toBeTruthy()
  })

  it('while the session is still being read nothing is locked or flashed', () => {
    h.status = 'loading'
    render(<AccountGate><button>Tính</button></AccountGate>)
    expect(screen.queryByTestId('account-gate-content')).toBeNull()
  })
})
