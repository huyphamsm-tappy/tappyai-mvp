// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// The first-visit language modal vs. a surface that owns its own language control.
//
// 🔑 FOUND BY REAL BROWSER E2E, NOT BY A UNIT TEST. `LanguagePicker` lives in the
// ROOT layout, so it renders over every page whenever no locale has been stored
// yet — which is, by definition, every first-time visitor. On the Controller's
// public home that put a full-screen `z-[100]` overlay on top of the
// Owner-approved design: the header's VI/EN toggle was visibly there and
// `document.elementFromPoint()` returned the modal instead, so clicking it did
// nothing at all. Every component test passed the whole time, because the modal
// is not part of the component under test.
//
// The Controller's public home already asks the language question in its header,
// exactly as the approved design does. Two language choosers on one screen is
// one too many — and the one that wins is the one covering the design.

const pathname = vi.fn(() => '/')

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
}))

async function renderPicker() {
  const { default: LanguagePicker } = await import('./LanguagePicker')
  return render(<LanguagePicker />)
}

describe('the first-visit language modal knows where it is', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear() // first visit: nothing stored
  })
  afterEach(cleanup)

  it('still opens on the consumer app — this is the behaviour being preserved', async () => {
    pathname.mockReturnValue('/')
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).not.toBeNull()
  })

  it('still opens on other consumer routes', async () => {
    pathname.mockReturnValue('/explore')
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).not.toBeNull()
  })

  it('stays out of the way on the Controller public home', async () => {
    pathname.mockReturnValue('/controller')
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).toBeNull()
  })

  it('does not open once a locale has been stored, anywhere', async () => {
    pathname.mockReturnValue('/')
    window.localStorage.setItem('tappy_lang', 'vi')
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).toBeNull()
  })

  it('the exclusion is exact — a route merely STARTING with /controller is not it', async () => {
    // `/controller-something` is not the Controller public home. Matching by
    // prefix would silently mute the picker on any future route that happens to
    // share the first eleven characters.
    pathname.mockReturnValue('/controller-guide')
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).not.toBeNull()
  })
})
