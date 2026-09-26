import { describe, it, expect } from 'vitest'
import { readScamShieldPrefill, scamShieldDeepLink, SCAM_SHIELD_PREFILL_MAX } from './deepLink'

describe('Scam Shield deep link — prefill only, never a check', () => {
  it('reads an http(s) link from ?url= and strips credentials', () => {
    expect(readScamShieldPrefill('?url=https%3A%2F%2Fbad.example%2Flogin%3Ft%3D1')).toBe('https://bad.example/login?t=1')
    expect(readScamShieldPrefill('?url=https://u:p@bad.example/x')).toBe('https://bad.example/x')
    expect(readScamShieldPrefill('?src=browser_extension&url=http://a.vn')).toBe('http://a.vn/')
  })
  it('refuses anything that is not a web link', () => {
    for (const bad of ['?url=javascript:alert(1)', '?url=chrome://x', '?url=file:///etc/passwd', '?url=', '?url=%20', '?url=not-a-url', '?other=1', '', null, undefined]) {
      expect(readScamShieldPrefill(bad as string), String(bad)).toBeNull()
    }
    expect(readScamShieldPrefill(`?url=${encodeURIComponent('https://a.vn/' + 'x'.repeat(SCAM_SHIELD_PREFILL_MAX))}`)).toBeNull()
  })
  it('builds the in-app deep link with an optional source', () => {
    expect(scamShieldDeepLink('https://a.vn/x?y=1', 'share_out')).toBe('/scam-shield?url=https%3A%2F%2Fa.vn%2Fx%3Fy%3D1&src=share_out')
    expect(scamShieldDeepLink('javascript:1')).toBeNull()
  })
})
