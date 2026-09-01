// @vitest-environment jsdom
/**
 * BUG-001 / BUG-003 — an optimistic flip that a refused request never took back.
 *
 * ============================================================================
 * THE DEFECT CLASS
 * ============================================================================
 * `fetch` REJECTS only on a network failure. 401, 403 and 500 all RESOLVE. Both controls below
 * flipped their state first and then awaited the request bare, so the only rollback they had —
 * a `catch`, where one existed at all — could not run for any HTTP failure. The UI then claimed
 * an action the server had refused, and kept claiming it until a reload.
 *
 * Every test here drives the REAL component and asserts on what a user would see afterwards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ReviewSaveButton from './[id]/ReviewSaveButton'

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))

/** The save control — labelled by whichever state it believes it is in. */
const saveBtn = (c: HTMLElement) =>
  c.querySelector('button[aria-label="Lưu"], button[aria-label="Bỏ lưu"]') as HTMLButtonElement

/** The amber fill is the ONLY thing a user reads as "this is saved". */
const looksSaved = (c: HTMLElement) => /fill-amber/.test(c.querySelector('svg')?.getAttribute('class') ?? '')

const respond = (init: { ok: boolean; body?: unknown }) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: init.ok, json: async () => init.body ?? {} })) as any)

beforeEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('BUG-001 — Post Detail save button', () => {
  it('a successful save takes the SERVER’s answer, not the optimistic guess', async () => {
    respond({ ok: true, body: { saved: true } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(true))
    expect(saveBtn(container).getAttribute('aria-label')).toBe('Bỏ lưu')
  })

  it('a successful unsave clears it', async () => {
    respond({ ok: true, body: { saved: false } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(false))
  })

  it('🚨 401 rolls back — the reproduced production bug', async () => {
    // Reproduced live on www.tappyai.com: POST returned 401 and the bookmark still went amber.
    respond({ ok: false, body: { error: 'unauthorized' } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(false))
    expect(saveBtn(container).getAttribute('aria-label')).toBe('Lưu')
  })

  it('🚨 403 (anonymous session, B17) rolls back', async () => {
    respond({ ok: false, body: { error: 'account_required' } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(false))
  })

  it('🚨 500 rolls back', async () => {
    respond({ ok: false, body: { error: 'save_failed' } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(false))
  })

  it('🚨 the STATUS decides, even when a failure body happens to look like success', async () => {
    // Isolates the `res.ok` check. Without this case the other failure tests pass on the shape
    // guard alone, so deleting the status check would leave the suite green — which it did, until
    // this test existed.
    respond({ ok: false, body: { saved: true } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(saveBtn(container).getAttribute('aria-label')).toBe('Lưu'))
    expect(looksSaved(container)).toBe(false)
  })

  it('a network failure rolls back (the one case that always worked)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }) as any)
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(false))
  })

  it('a 200 with a body that is not the contract is treated as failure, not success', async () => {
    // A proxy or an error page can answer 200 with something else entirely; guessing "saved"
    // from it is how the same lie comes back through a different door.
    respond({ ok: true, body: { unexpected: true } })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(false))
  })

  it('an unsave that fails does not silently drop the save', async () => {
    respond({ ok: false, body: {} })
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved />)

    fireEvent.click(saveBtn(container))
    await waitFor(() => expect(looksSaved(container)).toBe(true))
  })

  it('a second click while one is in flight is ignored (existing pending guard)', async () => {
    let resolve!: (v: unknown) => void
    const gate = new Promise(r => { resolve = r })
    const f = vi.fn(async () => { await gate; return { ok: true, json: async () => ({ saved: true }) } })
    vi.stubGlobal('fetch', f as any)
    const { container } = render(<ReviewSaveButton reviewId="r1" initialSaved={false} />)

    fireEvent.click(saveBtn(container))
    fireEvent.click(saveBtn(container))
    fireEvent.click(saveBtn(container))
    expect(f).toHaveBeenCalledTimes(1)

    resolve(null)
    await waitFor(() => expect(looksSaved(container)).toBe(true))
  })
})
