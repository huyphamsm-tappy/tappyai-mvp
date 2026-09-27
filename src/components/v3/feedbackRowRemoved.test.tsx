// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import V3Shell from './V3Shell'

// UAT3 P2 (2026-09-27): the sidebar's "Feedback" row linked to `/profile` — there is no feedback
// form, route or table, so it opened the profile page. It is removed, not re-pointed.
afterEach(cleanup)

describe('sidebar has no Feedback row', () => {
  it('renders no "Feedback" label, and /profile is linked only by the Profile row', () => {
    const { container } = render(<V3Shell title="Trang chủ"><div /></V3Shell>)
    expect(screen.queryByText(/^feedback$/i)).toBeNull()
    const profileLinks = [...container.querySelectorAll('a')].filter(a => a.getAttribute('href') === '/profile')
    expect(profileLinks.every(a => !/feedback/i.test(a.textContent ?? ''))).toBe(true)
  })
})
