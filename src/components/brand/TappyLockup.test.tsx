// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TappyWordmark } from './TappyLockup'
import PublicFooter from '@/components/discovery/PublicFooter'

afterEach(() => cleanup())

// Owner 28/11/2026: in the light theme the footer's "Tappy" was white on a near-white page and could not be read.
describe('TappyWordmark — follows the theme where the surface follows it', () => {
  it('on a dark-by-design surface (plan brochure, share card) "Tappy" stays literally white', () => {
    const { container } = render(<TappyWordmark fontSize={14} />)
    const el = container.querySelector('[data-tappy-wordmark]') as HTMLElement
    expect(el.style.color).toBe('rgb(255, 255, 255)')
  })

  it('adaptive: no inline colour, dark text in the light theme and white text in the dark theme; "AI" stays brand blue', () => {
    const { container } = render(<TappyWordmark fontSize={14} adaptive />)
    const el = container.querySelector('[data-tappy-wordmark]') as HTMLElement
    expect(el.style.color).toBe('')
    expect(el.className).toMatch(/text-gray-900/)
    expect(el.className).toMatch(/dark:text-white/)
    expect((container.querySelector('[data-tappy-wordmark-ai]') as HTMLElement).style.color).toBe('rgb(51, 145, 255)')
  })

  it('the public footer uses the adaptive wordmark', () => {
    const { container } = render(<PublicFooter />)
    const el = container.querySelector('[data-tappy-wordmark]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.color).toBe('')
    expect(el.className).toMatch(/dark:text-white/)
  })
})
