/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LoginLanguageChooser from './LoginLanguageChooser'
import { getStoredLocale } from '@/lib/i18n/useTranslation'

// Owner 18/11/2026: the language popup with flags is shown BEFORE signing in, once.
describe('LoginLanguageChooser', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
  })

  it('asks first, with a flag for each language, and stores the answer', () => {
    render(<LoginLanguageChooser />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Vietnam' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'United Kingdom' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /English/ }))
    expect(getStoredLocale()).toBe('en')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks only once: a stored language means no popup', () => {
    localStorage.setItem('tappy_lang', 'vi')
    render(<LoginLanguageChooser />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sends nothing to the server (no account yet)', () => {
    render(<LoginLanguageChooser />)
    fireEvent.click(screen.getByRole('button', { name: /Tiếng Việt/ }))
    expect(fetch).not.toHaveBeenCalled()
  })
})
