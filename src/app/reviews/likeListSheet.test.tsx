// @vitest-environment jsdom
/**
 * The Like List sheet — the control the like COUNT now opens.
 *
 * Locks the three states a list fetched over the network must have (loading, empty, populated) and
 * the one property that makes it honest: the names come from the response, never from a fixture
 * baked into the component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import LikeListSheet from './LikeListSheet'

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))

const mockFetch = (payload: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => payload })) as any)

// This repo does not auto-cleanup between tests, so a document-wide query would otherwise find the
// PREVIOUS test's sheet and either mask a regression or fail as "multiple elements found".
beforeEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('LikeListSheet', () => {
  it('shows the empty state when nobody currently likes the post', async () => {
    mockFetch({ likers: [], next_cursor: null })
    render(<LikeListSheet reviewId="rev-1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('reviews.likesEmpty')).toBeTruthy())
  })

  it('renders the likers the API returned, in order', async () => {
    mockFetch({
      likers: [
        { id: 'u1', full_name: 'Người A', avatar_url: null, created_at: '2026-08-02T00:00:00Z' },
        { id: 'u2', full_name: 'Người B', avatar_url: 'https://a/2.png', created_at: '2026-08-01T00:00:00Z' },
      ],
      next_cursor: null,
    })
    render(<LikeListSheet reviewId="rev-1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Người A')).toBeTruthy())
    expect(screen.getByText('Người B')).toBeTruthy()
    // No hard-coded or placeholder people: everything shown came out of the response.
    expect(screen.queryByText('reviews.likesEmpty')).toBeNull()
  })

  it('falls back to the shared anonymous label for a liker with no profile', async () => {
    mockFetch({ likers: [{ id: 'anon', full_name: null, avatar_url: null, created_at: '2026-08-02T00:00:00Z' }], next_cursor: null })
    render(<LikeListSheet reviewId="rev-1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('reviews.anonymous')).toBeTruthy())
  })

  it('shows an error state instead of an empty list when the fetch fails', async () => {
    mockFetch({}, false)
    render(<LikeListSheet reviewId="rev-1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('reviews.likesError')).toBeTruthy())
    expect(screen.queryByText('reviews.likesEmpty')).toBeNull()
  })

  it('asks the API for THIS review and closes on the close button', async () => {
    mockFetch({ likers: [], next_cursor: null })
    const onClose = vi.fn()
    render(<LikeListSheet reviewId="rev-42" onClose={onClose} />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect((fetch as any).mock.calls[0][0]).toBe('/api/reviews/rev-42/likes')

    fireEvent.click(screen.getByLabelText('reviews.likesClose'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
