// @vitest-environment jsdom
// Owner's layout (20/11/2026, picture 1): the partner banner sits in the header row. It is an ad (labelled), links ONLY to the tracked Agoda link the Deals page uses, and draws nothing without one.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import HeaderPartnerBanner from './HeaderPartnerBanner'

beforeEach(() => setLocale('vi'))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const respond = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))

describe('HeaderPartnerBanner', () => {
  it('shows the Agoda banner, labelled as an ad, with the tracked link opened as a sponsored link', async () => {
    respond({ partners: [{ providerId: 'vexere', url: 'https://v.example/x' }, { providerId: 'agoda', url: 'https://www.agoda.com/vi-vn/?cid=1974819' }] })
    const { container } = render(<HeaderPartnerBanner />)
    await waitFor(() => expect(container.querySelector('[data-testid="header-partner-banner"]')).toBeTruthy())
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('https://www.agoda.com/vi-vn/?cid=1974819')
    expect(a.getAttribute('rel')).toContain('sponsored')
    expect(container.textContent).toContain('Quảng cáo')
    expect(container.textContent).not.toMatch(/\d+\s*%/) // no discount is claimed
  })
  it('draws nothing without an Agoda link, or when the call fails', async () => {
    respond({ partners: [{ providerId: 'vexere', url: 'https://v.example/x' }] })
    const a = render(<HeaderPartnerBanner />)
    await new Promise(r => setTimeout(r, 20))
    expect(a.container.querySelector('[data-testid="header-partner-banner"]')).toBeNull()
    cleanup()
    respond({}, false)
    const b = render(<HeaderPartnerBanner />)
    await new Promise(r => setTimeout(r, 20))
    expect(b.container.querySelector('[data-testid="header-partner-banner"]')).toBeNull()
  })
})
