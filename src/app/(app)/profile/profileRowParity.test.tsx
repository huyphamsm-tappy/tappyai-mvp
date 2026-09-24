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
  // The hub props. Deliberately NULL/empty here: this fixture stands for "the server sent no
  // social data", which is the case the honesty assertion below depends on.
  bio: null,
  joinedAt: null,
  followerCount: null,
  followingCount: null,
  isPremium: false,
  stats: { posts: 0, videos: 0, likes: 0, savedReviews: 0, savedPlaces: 0, conversations: 3 },
  following: [],
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
    // 🔑 THE RULE IS UNCHANGED; WHAT CHANGED IS WHERE IT BITES.
    //
    // This used to read "the server sends none of them, so none may appear". Follower and
    // following counts are now REAL trigger-maintained columns on `profiles`, and the hub renders
    // them — but only when the server actually sends a number. This fixture sends null for both,
    // which is the "no data" case the original assertion was protecting, so the same expectation
    // still holds and now tests the harder half: a null must render NOTHING, not a zero.
    expect(text).not.toMatch(/follower|người theo dõi/i)
  })

  it('renders a social stat when — and only when — the server sent a number', () => {
    // The other half of the pair above. Given real counts, they appear; given null, they do not.
    const { container } = render(<ProfileView {...USER} followerCount={12} followingCount={0} />)
    const hero = container.querySelector('[data-profile-hero]')!
    expect(hero.querySelector('[data-stat="Người theo dõi"], [data-stat="Followers"]')).toBeTruthy()
    // 0 is a number the server sent, so it renders — it is only NULL that must draw nothing.
    expect(hero.querySelector('[data-stat="Đang theo dõi"], [data-stat="Following"]')).toBeTruthy()
  })
})
