// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

// The picture of a message: server link while it exists (and a saved copy is made), the browser's own copy after the retention period, otherwise a plain placeholder.

const h = vi.hoisted(() => ({ save: vi.fn(async () => true), load: vi.fn(async (): Promise<string | null> => null) }))
vi.mock('@/lib/messaging/photoCache', () => ({ savePhotoCopy: h.save, loadPhotoCopy: h.load }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

import { MessagePhoto } from './MessagePhoto'

const LINK = 'https://storage.example/signed/a?token=1'
const media = (over: Record<string, unknown> = {}) => ({ type: 'image' as const, url: LINK, width: 800, height: 600, ...over })

beforeEach(() => { h.save.mockClear(); h.load.mockReset(); h.load.mockResolvedValue(null) })
afterEach(cleanup)

describe('MessagePhoto', () => {
  it('with a server link: shows it (opening in a new tab without the opener) and saves this browser\'s copy by MESSAGE id', async () => {
    const { container } = render(<MessagePhoto messageId="m1" media={media()} hasText={false} />)
    const a = container.querySelector('[data-testid="message-photo"] a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe(LINK)
    expect(a.getAttribute('rel')).toContain('noopener')
    expect((container.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe(LINK)
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('m1', LINK))
    expect(h.load).not.toHaveBeenCalled()
  })

  it('expired and this browser holds a copy: the copy is shown (no link to open), nothing is saved', async () => {
    h.load.mockResolvedValue('blob:copy')
    const { container } = render(<MessagePhoto messageId="m1" media={media({ url: null, expired: true })} hasText />)
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
    expect((container.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('blob:copy')
    expect(container.querySelector('a')).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
  })

  it('expired and no copy: "expired" placeholder; link missing for another reason and no copy: "unavailable"', async () => {
    const a = render(<MessagePhoto messageId="m1" media={media({ url: null, expired: true })} hasText={false} />)
    await waitFor(() => expect(h.load).toHaveBeenCalled())
    expect(a.container.querySelector('[data-testid="message-photo-missing"]')!.textContent).toBe('v3.msg.photoExpired')
    cleanup()
    const b = render(<MessagePhoto messageId="m2" media={media({ url: null })} hasText={false} />)
    await waitFor(() => expect(h.load).toHaveBeenCalledTimes(2))
    expect(b.container.querySelector('[data-testid="message-photo-missing"]')!.textContent).toBe('v3.msg.photoUnavailable')
  })

  it('a link that is not https is never put in the page', () => {
    const { container } = render(<MessagePhoto messageId="m1" media={media({ url: 'javascript:alert(1)' })} hasText={false} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })
})
