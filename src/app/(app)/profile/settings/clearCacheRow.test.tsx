// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'

// Owner 21/11/2026: one button frees this device's copy of Messenger pictures; it says so afterwards; nothing else is touched.

const h = vi.hoisted(() => ({ clear: vi.fn(async () => {}) }))
vi.mock('@/lib/messaging/photoCache', () => ({ clearPhotoCopies: h.clear }))

import ClearCacheRow from './ClearCacheRow'

beforeEach(() => { setLocale('vi'); h.clear.mockClear() })
afterEach(() => cleanup())

describe('ClearCacheRow', () => {
  it('shows the explanation, clears this device\'s photo copies on click, then confirms', async () => {
    const { container } = render(<ClearCacheRow />)
    expect(container.textContent).toContain('Xóa bộ nhớ đệm ảnh')
    expect(container.textContent).toContain('vẫn còn')
    fireEvent.click(container.querySelector('[data-clear-cache]') as HTMLButtonElement)
    await waitFor(() => expect(container.textContent).toContain('Đã xóa bộ nhớ đệm ảnh'))
    expect(h.clear).toHaveBeenCalledTimes(1)
  })
})
