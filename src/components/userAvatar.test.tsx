// @vitest-environment jsdom
//
// ── The Zalo avatar was a broken image on every surface ──────────────────────
//
// Owner report, iPhone Safari after a Zalo login: the Profile card showed a broken avatar and
// there was no way to change it.
//
// Measured on production 53052c9 — the optimizer itself answers the question:
//
//   /_next/image?url=https%3A%2F%2Fs120-ava-talk.zadn.vn%2F…   → HTTP 400
//   /_next/image?url=https%3A%2F%2Flh3.googleusercontent.com%2F… → HTTP 200
//
// A Zalo avatar lives on Zalo's CDN (*.zadn.vn), which was missing from
// `images.remotePatterns`, so next/image asked the optimizer for a host it refuses and the
// browser rendered a broken-image icon. Google's host was allowlisted, which is why only Zalo
// users saw it. (In production next/image does NOT throw for an unconfigured host — the check
// sits behind `NODE_ENV !== 'production'` — so this was always a broken image, never an
// exception.)
//
// Allowlisting the host fixes today's URL. It does NOT satisfy "don't depend on the Zalo avatar
// URL remaining accessible forever": a remote avatar can 404, expire, or be firewalled later.
// That is what this component is for — a failed load must land on the clean initial-letter state
// the app already uses when there is no avatar at all, never on a broken image.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import UserAvatar from './UserAvatar'

const ZALO = 'https://s120-ava-talk.zadn.vn/a/b/c/d/1/abcdef.jpg'

afterEach(cleanup)

describe('UserAvatar', () => {
  it('renders the avatar when one is available', () => {
    render(<UserAvatar src={ZALO} name="Huy Pham" size={80} />)
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('falls back to the clean initial when the remote avatar fails to load', () => {
    render(<UserAvatar src={ZALO} name="Huy Pham" size={80} />)
    fireEvent.error(screen.getByRole('img'))

    // The broken image is GONE — not merely hidden behind it.
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('H')).toBeTruthy()
  })

  it('shows the initial when there is no avatar at all', () => {
    render(<UserAvatar src={null} name="Huy Pham" size={80} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('H')).toBeTruthy()
  })

  it('recovers when a new avatar arrives after a failure', () => {
    // The exact upload flow: the old (broken) Zalo avatar has already errored, then the user
    // uploads one. If the failure latched, the fresh avatar would never be shown.
    const { rerender } = render(<UserAvatar src={ZALO} name="Huy Pham" size={80} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).toBeNull()

    rerender(<UserAvatar src="https://x.supabase.co/storage/v1/object/public/avatars/u-1.jpg" name="Huy Pham" size={80} />)
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('never renders an empty initial when the name is missing', () => {
    render(<UserAvatar src={null} name="" size={80} />)
    expect(screen.getByText('T')).toBeTruthy() // TappyAI's own default, not a blank circle
  })
})
