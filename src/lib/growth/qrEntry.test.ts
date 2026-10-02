import { describe, it, expect } from 'vitest'
import { QR_ENTRY_PATHS, buildQrEntryUrl, isQrEntryPath, renderQrEntrySvg } from './qrEntry'
import { parseLandingAttribution } from '@/lib/analytics/attribution'

const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv

describe('QR / POS entry', () => {
  it('only allow-listed public entries can be printed', () => {
    expect(QR_ENTRY_PATHS).toEqual(['/', '/food', '/shopping', '/entertainment', '/travel', '/spa'])
    expect(isQrEntryPath('/chat')).toBe(false)
    expect(isQrEntryPath('/admin')).toBe(false)
    expect(() => buildQrEntryUrl('/chat', env)).toThrow()
  })
  it('the encoded URL carries source=qr_pos and nothing else', () => {
    expect(buildQrEntryUrl('/food', env)).toBe('https://www.tappyai.com/food?src=qr_pos')
  })
  it('a scan lands with qr_pos attribution', () => {
    const u = new URL(buildQrEntryUrl('/', env))
    expect(parseLandingAttribution({ pathname: u.pathname, search: u.search }).source).toBe('qr_pos')
  })
  it('renders a deterministic SVG with no network', () => {
    const a = renderQrEntrySvg('/food', 256, env)
    expect(a.startsWith('<svg')).toBe(true)
    expect(renderQrEntrySvg('/food', 256, env)).toBe(a)
  })
})
