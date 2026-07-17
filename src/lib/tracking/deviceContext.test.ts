// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectDeviceContext, UNKNOWN_DEVICE_CONTEXT } from './deviceContext'

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true })
}
function setScreen(width: number, height: number) {
  Object.defineProperty(window, 'screen', { value: { width, height }, configurable: true })
}
function setPixelRatio(r: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value: r, configurable: true })
}
function setColorScheme(scheme: 'light' | 'dark' | 'none') {
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({ matches: scheme !== 'none' && q.includes(scheme), media: q }),
    configurable: true,
  })
}
function setConnection(conn: { effectiveType?: string; type?: string } | undefined) {
  Object.defineProperty(window.navigator, 'connection', { value: conn, configurable: true })
}
function setDisplayMode(mode: 'standalone' | 'browser') {
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({ matches: mode === 'standalone' && q.includes('display-mode: standalone'), media: q }),
    configurable: true,
  })
}
function clearMatchMedia() {
  Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true })
}

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const EDGE_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/604.1'

beforeEach(() => { setLanguage('en-US'); setScreen(1920, 1080) })
afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_VERSION
  delete process.env.NEXT_PUBLIC_BUILD_NUMBER
  delete process.env.NEXT_PUBLIC_ANALYTICS_SDK_VERSION
})

describe('detectDeviceContext — full contract shape', () => {
  it('returns all 19 required keys', () => {
    setUA(CHROME_WIN)
    const dc = detectDeviceContext()
    expect(Object.keys(dc).sort()).toEqual([
      'app_version', 'browser_name', 'browser_version', 'build_number', 'color_scheme',
      'device_model', 'device_type', 'is_pwa', 'locale', 'manufacturer', 'network_type',
      'os_name', 'os_version', 'pixel_ratio', 'platform', 'screen_height', 'screen_width',
      'sdk_version', 'timezone',
    ])
  })
})

describe('detectDeviceContext — desktop Chrome on Windows', () => {
  it('detects os/browser/device_type/screen/locale/timezone', () => {
    setUA(CHROME_WIN)
    const dc = detectDeviceContext()
    expect(dc.platform).toBe('web')
    expect(dc.os_name).toBe('Windows')
    expect(dc.browser_name).toBe('Chrome')
    expect(dc.browser_version).toBe('120.0.0.0')
    expect(dc.device_type).toBe('desktop')
    expect(dc.screen_width).toBe(1920)
    expect(dc.screen_height).toBe(1080)
    expect(dc.locale).toBe('en-US')
    expect(typeof dc.timezone).toBe('string')
    expect(dc.timezone.length).toBeGreaterThan(0)
    expect(dc.device_model).toBe('unknown') // web desktop has no model
  })
})

describe('detectDeviceContext — iPhone Safari', () => {
  it('detects iOS + Safari + phone', () => {
    setUA(IPHONE_SAFARI)
    const dc = detectDeviceContext()
    expect(dc.os_name).toBe('iOS')
    expect(dc.os_version).toBe('17.2')
    expect(dc.browser_name).toBe('Safari')
    expect(dc.device_type).toBe('phone')
  })
})

describe('detectDeviceContext — iPad → tablet', () => {
  it('classifies iPad as tablet', () => {
    setUA(IPAD)
    expect(detectDeviceContext().device_type).toBe('tablet')
  })
})

describe('detectDeviceContext — Android Chrome with model', () => {
  it('detects Android + Chrome + phone + model', () => {
    setUA(ANDROID_CHROME)
    const dc = detectDeviceContext()
    expect(dc.os_name).toBe('Android')
    expect(dc.os_version).toBe('14')
    expect(dc.browser_name).toBe('Chrome')
    expect(dc.device_type).toBe('phone')
    expect(dc.device_model).toBe('SM-S911B')
  })
})

describe('detectDeviceContext — browser precedence', () => {
  it('classifies Edge (whose UA contains "Chrome") as Edge, not Chrome', () => {
    setUA(EDGE_WIN)
    expect(detectDeviceContext().browser_name).toBe('Edge')
  })
})

describe('detectDeviceContext — honest unknowns (never fabricate)', () => {
  it('unrecognized UA → string fields "unknown", not guessed', () => {
    setUA('SomeUnknownAgent/1.0')
    const dc = detectDeviceContext()
    expect(dc.os_name).toBe('unknown')
    expect(dc.browser_name).toBe('unknown')
    expect(dc.device_model).toBe('unknown')
  })
  it('unavailable screen dims → null (not a fabricated 0)', () => {
    setUA(CHROME_WIN)
    setScreen(0, 0)
    const dc = detectDeviceContext()
    expect(dc.screen_width).toBeNull()
    expect(dc.screen_height).toBeNull()
  })
})

describe('detectDeviceContext — app_version projection', () => {
  it('reads NEXT_PUBLIC_APP_VERSION when set, else "unknown"', () => {
    setUA(CHROME_WIN)
    process.env.NEXT_PUBLIC_APP_VERSION = '3.4.5'
    expect(detectDeviceContext().app_version).toBe('3.4.5')
  })
})

describe('detectDeviceContext — manufacturer (factual inference, else unknown)', () => {
  it('infers Apple from an iPhone UA', () => {
    setUA(IPHONE_SAFARI)
    expect(detectDeviceContext().manufacturer).toBe('Apple')
  })
  it('infers Samsung from an SM- model UA', () => {
    setUA(ANDROID_CHROME)
    expect(detectDeviceContext().manufacturer).toBe('Samsung')
  })
  it('is "unknown" for a generic desktop UA (no OEM signal)', () => {
    setUA(CHROME_WIN)
    expect(detectDeviceContext().manufacturer).toBe('unknown')
  })
})

describe('detectDeviceContext — pixel_ratio', () => {
  it('reads window.devicePixelRatio', () => {
    setUA(CHROME_WIN)
    setPixelRatio(2)
    expect(detectDeviceContext().pixel_ratio).toBe(2)
  })
})

describe('detectDeviceContext — color_scheme', () => {
  it('detects dark preference', () => {
    setUA(CHROME_WIN)
    setColorScheme('dark')
    expect(detectDeviceContext().color_scheme).toBe('dark')
  })
  it('detects light preference', () => {
    setUA(CHROME_WIN)
    setColorScheme('light')
    expect(detectDeviceContext().color_scheme).toBe('light')
  })
  it('is "unknown" when matchMedia gives no preference', () => {
    setUA(CHROME_WIN)
    setColorScheme('none')
    expect(detectDeviceContext().color_scheme).toBe('unknown')
  })
})

describe('detectDeviceContext — network_type (stable contract, else unknown)', () => {
  it('maps physical type "wifi"', () => {
    setUA(CHROME_WIN); setConnection({ type: 'wifi' })
    expect(detectDeviceContext().network_type).toBe('wifi')
  })
  it('maps physical type "cellular"', () => {
    setUA(CHROME_WIN); setConnection({ type: 'cellular', effectiveType: '4g' })
    expect(detectDeviceContext().network_type).toBe('cellular')
  })
  it('falls back to effectiveType speed class when no physical type', () => {
    setUA(CHROME_WIN); setConnection({ effectiveType: '4g' })
    expect(detectDeviceContext().network_type).toBe('4g')
  })
  it('is "unknown" when navigator.connection is unavailable', () => {
    setUA(CHROME_WIN); setConnection(undefined)
    expect(detectDeviceContext().network_type).toBe('unknown')
  })
})

describe('detectDeviceContext — is_pwa (true/false/unknown, never fabricated)', () => {
  it('true in standalone display mode', () => {
    setUA(CHROME_WIN); setDisplayMode('standalone')
    expect(detectDeviceContext().is_pwa).toBe(true)
  })
  it('false in normal browser display mode', () => {
    setUA(CHROME_WIN); setDisplayMode('browser')
    expect(detectDeviceContext().is_pwa).toBe(false)
  })
  it('"unknown" when display mode cannot be determined (no matchMedia)', () => {
    setUA(CHROME_WIN); clearMatchMedia()
    Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true })
    expect(detectDeviceContext().is_pwa).toBe('unknown')
  })
})

describe('detectDeviceContext — build_number / sdk_version (env-sourced, else unknown)', () => {
  it('reads NEXT_PUBLIC_BUILD_NUMBER / NEXT_PUBLIC_ANALYTICS_SDK_VERSION when set', () => {
    setUA(CHROME_WIN)
    process.env.NEXT_PUBLIC_BUILD_NUMBER = '4200'
    process.env.NEXT_PUBLIC_ANALYTICS_SDK_VERSION = '1.0.0'
    const dc = detectDeviceContext()
    expect(dc.build_number).toBe('4200')
    expect(dc.sdk_version).toBe('1.0.0')
  })
  it('is "unknown" when env vars are unset', () => {
    setUA(CHROME_WIN)
    const dc = detectDeviceContext()
    expect(dc.build_number).toBe('unknown')
    expect(dc.sdk_version).toBe('unknown')
  })
})

describe('UNKNOWN_DEVICE_CONTEXT constant', () => {
  it('is an all-unknown reference shape with the 19 contract keys', () => {
    expect(UNKNOWN_DEVICE_CONTEXT.platform).toBe('unknown')
    expect(UNKNOWN_DEVICE_CONTEXT.screen_width).toBeNull()
    expect(UNKNOWN_DEVICE_CONTEXT.pixel_ratio).toBeNull()
    expect(UNKNOWN_DEVICE_CONTEXT.color_scheme).toBe('unknown')
    expect(UNKNOWN_DEVICE_CONTEXT.network_type).toBe('unknown')
    expect(UNKNOWN_DEVICE_CONTEXT.is_pwa).toBe('unknown')
    expect(Object.keys(UNKNOWN_DEVICE_CONTEXT)).toHaveLength(19)
  })
})
