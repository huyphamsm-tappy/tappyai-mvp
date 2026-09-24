// @vitest-environment jsdom
/**
 * BUG-002 — "your memory is cleared" was said before the server had agreed.
 *
 * ============================================================================
 * WHY THIS ONE IS NOT JUST ANOTHER OPTIMISTIC-UPDATE BUG
 * ============================================================================
 * This screen is a PRIVACY control. Its success message is a claim about what the server no
 * longer holds. `handleClear` awaited the DELETE bare, and `fetch` resolves on 401 (an expired
 * session) and on 500 — so the page hid the memory and announced `memory.cleared` while every
 * fact was still stored. A user acting on that message believes their data is gone.
 *
 * The rule these tests lock: the success state is reachable ONLY from a confirmed 2xx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import TappyKnowsPage from './page'

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }))

const MEMORY = {
  facts: ['thích bún bò'],
  preferred_style: { tone: 'friendly', length: 'short' },
  updated_at: '2026-08-01T00:00:00Z',
}

/**
 * GET /api/memory answers with a memory so the Clear control renders; the DELETE that follows is
 * whatever the test asks for.
 */
function mount(deleteResult: { ok: boolean } | 'network-error') {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'DELETE') {
      if (deleteResult === 'network-error') throw new Error('offline')
      return { ok: deleteResult.ok, json: async () => ({ ok: deleteResult.ok }) }
    }
    return { ok: true, json: async () => ({ memory: MEMORY }) }
  })
  vi.stubGlobal('fetch', fetchMock as any)
  return { ...render(<TappyKnowsPage />), fetchMock }
}

/** Click "clear", then confirm — the control is two-step by design. */
async function clearAndConfirm() {
  await waitFor(() => expect(screen.getByText('memory.clearButton')).toBeTruthy())
  fireEvent.click(screen.getByText('memory.clearButton'))
  await waitFor(() => expect(screen.getByText('memory.confirmClear')).toBeTruthy())
  fireEvent.click(screen.getByText('memory.confirmClear'))
}

beforeEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('BUG-002 — clearing AI memory tells the truth', () => {
  it('announces success only after a confirmed 2xx', async () => {
    mount({ ok: true })
    await clearAndConfirm()
    await waitFor(() => expect(screen.getByText('memory.cleared')).toBeTruthy())
    expect(screen.queryByText('memory.clearFailed')).toBeNull()
  })

  it('🚨 401 (expired session) must NOT claim the memory was cleared', async () => {
    mount({ ok: false })
    await clearAndConfirm()
    await waitFor(() => expect(screen.getByText('memory.clearFailed')).toBeTruthy())
    // The claim itself is the bug — it must be absent.
    expect(screen.queryByText('memory.cleared')).toBeNull()
  })

  it('🚨 500 must NOT claim the memory was cleared', async () => {
    mount({ ok: false })
    await clearAndConfirm()
    await waitFor(() => expect(screen.getByText('memory.clearFailed')).toBeTruthy())
    expect(screen.queryByText('memory.cleared')).toBeNull()
  })

  it('a network failure must NOT claim the memory was cleared', async () => {
    mount('network-error')
    await clearAndConfirm()
    await waitFor(() => expect(screen.getByText('memory.clearFailed')).toBeTruthy())
    expect(screen.queryByText('memory.cleared')).toBeNull()
  })

  it('on failure the memory stays on screen — nothing is hidden that still exists', async () => {
    mount({ ok: false })
    await clearAndConfirm()
    await waitFor(() => expect(screen.getByText('memory.clearFailed')).toBeTruthy())
    // `memory.empty` is what renders when there is nothing to show; seeing it would mean the page
    // had thrown the memory away locally while the server still holds it.
    expect(screen.queryByText('memory.empty')).toBeNull()
  })
})
