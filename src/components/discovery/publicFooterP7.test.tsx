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
  it('Tải ứng dụng: both listings are public (21/11/2026) → a QR code to each real store listing (owner: QR instead of a tag), and the banner badges link to them', () => {
    const { container } = render(<PublicFooter />)
    const dl = container.querySelector('[data-footer-download]') as HTMLElement
    expect(dl.textContent).toContain('Tải ứng dụng')
    for (const [key, host] of [['android', 'play.google.com'], ['ios', 'apps.apple.com']] as const) {
      const row = container.querySelector(`[data-store="${key}"]`)!
      const qr = row.querySelector('a[data-qr]') as HTMLAnchorElement
      expect(qr.getAttribute('href')).toContain(host)
      expect(qr.querySelector('svg')).toBeTruthy()
      expect(row.textContent).not.toContain('Sẵn có')
    }
    const links = [...container.querySelectorAll('a[data-badge]')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['https://play.google.com/store/apps/details?id=com.tappyai.app', expect.stringMatching(/^https:\/\/apps\.apple\.com\/vn\/app\/tappyai\/id\d+$/)])
    expect(container.querySelector('a[data-badge]')!.getAttribute('rel')).toContain('noopener')
  })
  it('switched off (listing taken down): "Sắp có", no store link and no "available" claim anywhere', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLAY_LISTING_LIVE', '0')
    vi.stubEnv('NEXT_PUBLIC_APP_STORE_URL', 'off')
    vi.resetModules()
    const { default: OffFooter } = await import('./PublicFooter')
    const { container } = render(<OffFooter />)
    expect(container.querySelector('[data-store="android"]')!.textContent).toBe('AndroidSắp có')
    expect(container.querySelector('[data-store="ios"]')!.textContent).toBe('iOSSắp có')
    expect(container.querySelector('a[data-badge]')).toBeNull()
    expect(container.querySelector('[data-qr]')).toBeNull()
    expect(container.textContent).not.toContain('Sẵn có')
    expect(container.innerHTML).not.toMatch(/apps\.apple\.com|play\.google\.com/)
  })
  it('social icons: the four official accounts link out; LinkedIn draws nothing until its link exists', () => {
    const { container } = render(<PublicFooter />)
    const hrefs = Object.fromEntries([...container.querySelectorAll('a[data-social]')].map((a) => [a.getAttribute('data-social'), a.getAttribute('href')]))
    expect(hrefs).toEqual({
      facebook: 'https://www.facebook.com/profile.php?id=61591106270254',
      tiktok: 'https://www.tiktok.com/@tappyaivietnam',
      instagram: 'https://www.instagram.com/tappyaivietnam/',
      threads: 'https://www.threads.com/@tappyaivietnam',
    })
    expect(container.querySelector('[data-social="linkedin"]')).toBeNull()
    expect(container.querySelector('a[data-social]')!.getAttribute('rel')).toContain('noopener')
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
