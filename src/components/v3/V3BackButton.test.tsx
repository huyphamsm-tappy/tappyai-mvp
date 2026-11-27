// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Owner screenshots 27/11/2026: /profile/account and /profile/settings had no way back (only the browser's own button) ──
// V3Shell takes an optional `backFallbackHref`; the pages name their parent. The button pops in-app history when there is
// some, else goes to the parent (lib/nav/inAppBack), exactly like the legacy Header's Back.

const h = vi.hoisted(() => ({ goBack: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, back: vi.fn(), replace: vi.fn() }), usePathname: () => '/profile/account' }))
vi.mock('@/lib/nav/inAppBack', () => ({ goBack: h.goBack }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => (k === 'common.back' ? 'Quay lại' : k) }) }))

import V3BackButton from './V3BackButton'

beforeEach(() => { h.goBack.mockClear() })

describe('V3BackButton', () => {
  it('is a labelled button that goes back in app history, falling back to the named parent', () => {
    render(<V3BackButton fallbackHref="/profile" />)
    const b = screen.getByRole('button', { name: 'Quay lại' })
    fireEvent.click(b)
    expect(h.goBack).toHaveBeenCalledTimes(1)
    expect(h.goBack.mock.calls[0][1]).toBe('/profile')
  })
})

describe('the pages that were missing a way back now ask for one', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('Account and Settings pass backFallbackHref="/profile" to the V3 shell', () => {
    for (const f of ['src/app/(app)/profile/account/AccountView.tsx', 'src/app/(app)/profile/settings/SettingsView.tsx']) {
      expect(read(f), f).toMatch(/backFallbackHref="\/profile"/)
    }
  })
  it('V3Shell renders the back button only when asked', () => {
    const src = read('src/components/v3/V3Shell.tsx')
    expect(src).toMatch(/backFallbackHref\?: string/)
    expect(src).toMatch(/\{backFallbackHref && <V3BackButton/)
  })
})
