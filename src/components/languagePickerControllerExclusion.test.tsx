// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The first-visit language modal vs. a surface that owns its own language control.
//
// 🔑 FOUND BY REAL BROWSER E2E, NOT BY A UNIT TEST. `LanguagePicker` used to live in the ROOT
// layout, so it rendered over every page whenever no locale had been stored yet — including the
// Controller's public home, where the full-screen `z-[100]` overlay covered the approved design's
// own VI/EN toggle (`elementFromPoint` returned the modal). It was first fixed with a pathname
// list inside the picker.
//
// That list is gone. The picker is now mounted only by `src/app/(app)/layout.tsx`, and
// `/controller` lives outside `(app)`, so the modal cannot reach it — or any other public page —
// structurally (enforced by `src/app/publicBoundary.test.ts`). What remains for this suite is the
// picker's own behaviour wherever it IS mounted, and the Controller's placement.

async function renderPicker() {
  const { default: LanguagePicker } = await import('./LanguagePicker')
  return render(<LanguagePicker />)
}

describe('the first-visit language modal', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear() // first visit: nothing stored
  })
  afterEach(cleanup)

  it('opens on a first visit wherever the app mounts it — the behaviour being preserved', async () => {
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).not.toBeNull()
  })

  it('does not open once a locale has been stored', async () => {
    window.localStorage.setItem('tappy_lang', 'vi')
    await renderPicker()
    expect(screen.queryByText('Chọn ngôn ngữ')).toBeNull()
  })

  it('the Controller public home is outside the app layout, so the modal never covers its own toggle', () => {
    const app = join(process.cwd(), 'src', 'app')
    expect(() => readFileSync(join(app, 'controller', 'page.tsx'), 'utf8')).not.toThrow()
    expect(() => readFileSync(join(app, '(app)', 'controller', 'page.tsx'), 'utf8')).toThrow()
  })

  it('carries no pathname list of its own any more', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'LanguagePicker.tsx'), 'utf8')
    expect(src).not.toMatch(/usePathname/)
  })
})
