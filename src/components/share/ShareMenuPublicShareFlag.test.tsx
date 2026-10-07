// @vitest-environment jsdom
//
// A5 (PRIVACY-REVIEW-G1): the "public link" row follows the server's SHOW_PUBLIC_SHARE switch,
// read from GET /api/config → flags.publicShare. Off → hidden; on or missing (older server) → shown.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import ShareMenu from './ShareMenu'
import { parsePublicShareFlag, resetPublicShareFlagForTests } from '@/lib/config/usePublicShareFlag'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

let fetchMock: ReturnType<typeof vi.fn>
const config = (flags: Record<string, unknown>) => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ flags }) })

beforeEach(() => {
  resetPublicShareFlagForTests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const menu = () => render(<ShareMenu url="https://www.tappyai.com/r/AbCdEfGh12" title="T" open onClose={() => {}} onPublicLink={() => {}} />)

describe('ShareMenu — public link follows flags.publicShare', () => {
  it('shows the public-link row when the server allows publishing', async () => {
    config({ publicShare: true })
    menu()
    await waitFor(() => expect(screen.getByTestId('share-target-public-link')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/config')
  })

  it('hides the row when the server says publicShare: false', async () => {
    config({ publicShare: false })
    menu()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('share-target-public-link')).toBeNull()
    // The rest of the menu is untouched.
    expect(screen.getByTestId('share-target-copy')).toBeTruthy()
  })

  it('an older server without the field counts as ON', async () => {
    config({ showMusic: false })
    menu()
    await waitFor(() => expect(screen.getByTestId('share-target-public-link')).toBeTruthy())
  })

  it('a menu with no public-link action never asks /api/config', () => {
    render(<ShareMenu url="https://www.tappyai.com/r/AbCdEfGh12" title="T" open onClose={() => {}} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parsePublicShareFlag: only an explicit false turns it off', () => {
    expect(parsePublicShareFlag({ flags: { publicShare: false } })).toBe(false)
    expect(parsePublicShareFlag({ flags: { publicShare: true } })).toBe(true)
    expect(parsePublicShareFlag({ flags: {} })).toBe(true)
    expect(parsePublicShareFlag(null)).toBe(true)
  })
})
