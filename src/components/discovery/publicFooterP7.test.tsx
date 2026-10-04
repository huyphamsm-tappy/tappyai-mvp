// @vitest-environment jsdom
// Phase 7 closeout CP7 — footer: Khám phá incl. "Khác"; Tải TappyAI with the truthful Android/iOS state; Community Guidelines;
// the global AI disclaimer as a UI contract (rendered by the product, never by the model).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import PublicFooter from './PublicFooter'

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('public footer', () => {
  it('Khám phá lists the five hubs and "Khác" (Tappy is not limited to five domains)', () => {
    const { container } = render(<PublicFooter />)
    const other = container.querySelector('[data-footer-other]') as HTMLAnchorElement
    expect(other.textContent).toBe('Khác')
    expect(other.getAttribute('href')).toBe('/chat')
    for (const h of ['/food', '/shopping', '/entertainment', '/travel', '/spa']) expect(container.querySelector(`a[href="${h}"]`)).toBeTruthy()
  })
  it('Tải TappyAI: no public listing → "Sắp có" for Android and iOS, and no store link at all', () => {
    const { container } = render(<PublicFooter />)
    const dl = container.querySelector('[data-footer-download]') as HTMLElement
    expect(dl.textContent).toContain('Tải TappyAI')
    expect(container.querySelector('[data-store="android"]')!.textContent).toBe('Android · Sắp có')
    expect(container.querySelector('[data-store="ios"]')!.textContent).toBe('iOS · Sắp có')
    expect(dl.querySelector('a')).toBeNull()
    expect(container.innerHTML).not.toMatch(/apps\.apple\.com|itunes\.apple\.com/)
  })
  it('links the Community Guidelines, Terms and Privacy', () => {
    const { container } = render(<PublicFooter />)
    for (const h of ['/community-guidelines', '/terms', '/privacy']) expect(container.querySelector(`a[href="${h}"]`)).toBeTruthy()
  })
  it('renders the global AI disclaimer', () => {
    const { getByTestId } = render(<PublicFooter />)
    expect(getByTestId('ai-disclaimer').textContent).toBe('Tappy có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.')
  })
})

describe('the disclaimer is a UI contract everywhere AI answers or the app footer appear', () => {
  it('under the chat composer and in the app footer (V3Footer)', () => {
    expect(readFileSync('src/components/ChatInterface.tsx', 'utf8')).toMatch(/<\/form>\s*<AiDisclaimer className="mt-1\.5" \/>/)
    expect(readFileSync('src/components/v3/V3Shell.tsx', 'utf8')).toMatch(/<AiDisclaimer className="!text-left" \/>/)
  })
})
