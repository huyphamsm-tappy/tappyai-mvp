// @vitest-environment jsdom
/**
 * ShareMenu → "Đã share" history (2026-09-15): `onShared(channel)` fires exactly once per share
 * that COMPLETED and never for one that did not — the boundary the persistent record depends on.
 *
 *  - copy: the clipboard write resolved → 'copy'; a rejected write → nothing.
 *  - native: `navigator.share()` resolved → 'native'; rejected (cancelled) → nothing.
 *  - hand-off (Facebook / Zalo): `window.open` returned a window → that target; blocked → nothing.
 *  - opening the menu records nothing.
 *
 * And the review sheets turn that callback into `POST /api/reviews/{id}/share` with the channel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ShareMenu from './ShareMenu'
import { recordReviewShare } from '@/lib/share/recordReviewShare'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }),
}))

const URL_OK = 'https://tappyai.com/reviews/rev-1'

function renderMenu(onShared = vi.fn()) {
  render(<ShareMenu url={URL_OK} title="Quán A" open onClose={vi.fn()} onShared={onShared} />)
  return onShared
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }, share: vi.fn().mockResolvedValue(undefined) })
  vi.stubGlobal('open', vi.fn().mockReturnValue({}))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ShareMenu → onShared (the history boundary)', () => {
  it('records nothing on open', () => {
    const onShared = renderMenu()
    expect(onShared).not.toHaveBeenCalled()
  })

  it('copy: fires with "copy" only when the clipboard write resolved', async () => {
    const onShared = renderMenu()
    fireEvent.click(screen.getByText('share.copyLink'))
    await waitFor(() => expect(onShared).toHaveBeenCalledWith('copy'))
    expect(onShared).toHaveBeenCalledTimes(1)
  })

  it('copy: a failed clipboard write records nothing', async () => {
    ;(navigator.clipboard.writeText as any).mockRejectedValueOnce(new Error('denied'))
    const onShared = renderMenu()
    fireEvent.click(screen.getByText('share.copyLink'))
    await screen.findByText('share.copyFailed')
    expect(onShared).not.toHaveBeenCalled()
  })

  it('native: fires with "native" when navigator.share resolved', async () => {
    const onShared = renderMenu()
    fireEvent.click(await screen.findByText('share.more'))
    await waitFor(() => expect(onShared).toHaveBeenCalledWith('native'))
  })

  it('native: a cancelled navigator.share records nothing', async () => {
    ;(navigator.share as any).mockRejectedValueOnce(new DOMException('cancel', 'AbortError'))
    const onShared = renderMenu()
    fireEvent.click(await screen.findByText('share.more'))
    await new Promise((r) => setTimeout(r, 10))
    expect(onShared).not.toHaveBeenCalled()
  })

  it('hand-off: fires with the target when the window opened, nothing when the popup was blocked', async () => {
    const onShared = renderMenu()
    fireEvent.click(screen.getByText('share.facebook'))
    await waitFor(() => expect(onShared).toHaveBeenCalledWith('facebook'))
    ;(window.open as any).mockReturnValueOnce(null)
    fireEvent.click(screen.getByText('share.zalo'))
    await screen.findByText('share.unavailable')
    expect(onShared).toHaveBeenCalledTimes(1)
  })
})

describe('recordReviewShare', () => {
  it('POSTs the channel to /api/reviews/{id}/share and reports whether it landed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    expect(await recordReviewShare('rev-1', 'copy')).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/rev-1/share', expect.objectContaining({ method: 'POST', body: JSON.stringify({ channel: 'copy' }) }))
  })

  it('never throws: a refused write (anonymous → 403) or a network failure resolves false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    expect(await recordReviewShare('rev-1', 'copy')).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await recordReviewShare('rev-1', 'copy')).toBe(false)
  })
})
