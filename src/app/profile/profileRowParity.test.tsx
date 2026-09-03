// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(),
}))

import ProfileView from './ProfileView'
import GuestProfileView from './GuestProfileView'
import { accountRows, settingsRows, signInHref } from './ProfileRows'

// V3 Web redesign · §8. The guest Profile screen exists so a signed-out visitor sees "your
// account, not set up yet" instead of a wall — which only works while it shows THE SAME ROWS IN
// THE SAME ORDER as the signed-in screen. Those two lists used to be hand-written twice, each
// with its own copy of both product-flag gates; the restyle collapsed them into one inventory,
// and this pins the property that collapse was for.

afterEach(cleanup)

const USER = {
  userId: 'u1',
  userInfo: { full_name: 'Huy', avatar_url: null, email: 'huy@example.com' },
  firstName: 'Huy',
  conversationCount: 3,
}

/** The row destinations rendered inside the two account/settings panels, in document order. */
function rowHrefs(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.v3-panel li a[href]')].map(a => a.getAttribute('href')!)
}

describe('guest and signed-in Profile show the same rows', () => {
  it('renders every row from the shared inventory, in order', () => {
    const { container } = render(<ProfileView {...USER} />)
    expect(rowHrefs(container)).toEqual([...accountRows(), ...settingsRows()].map(r => r.href))
  })

  it('the guest screen mirrors it row for row, each locked behind sign-in', () => {
    const { container } = render(<GuestProfileView />)
    const expected = [...accountRows(), ...settingsRows()].map(r => signInHref(r.href))
    expect(rowHrefs(container)).toEqual(expected)
  })

  it('every guest row carries the real destination in returnTo', () => {
    // The point of returnTo is that signing in from a locked row lands on THAT row. A guest list
    // that all pointed at plain /login would still look right and be useless.
    const { container } = render(<GuestProfileView />)
    for (const href of rowHrefs(container)) {
      const returnTo = new URLSearchParams(href.split('?')[1]).get('returnTo')
      expect(returnTo, `${href} must carry a destination`).toBeTruthy()
      expect(returnTo!.startsWith('/'), 'returnTo stays relative').toBe(true)
      expect(returnTo).not.toBe('/login')
    }
  })

  it('the inventory is non-trivial', () => {
    // Guards the guard: an empty inventory would make all three cases above pass vacuously.
    expect(accountRows().length).toBeGreaterThanOrEqual(9)
  })
})

describe('the signed-in Profile invents no account facts', () => {
  it('shows only the count the server actually sent', () => {
    const { container } = render(<ProfileView {...USER} />)
    const text = container.textContent ?? ''
    expect(text).toContain('3')
    // The V3 reference shows post/follower/following counts. The server sends none of them, so
    // none may appear — a fabricated "0 followers" is a claim about the user's account.
    expect(text).not.toMatch(/follower|người theo dõi/i)
  })
})
