// Cross-platform device-context detection — the ONE place the Web client
// derives device signals (Analytics envelope §3). Android & iOS implement the
// SAME DeviceContext contract natively and send it identically; this module is
// the Web implementation of that shared contract, not a second tracking system.
//
// Honesty rule (spec): undetectable STRING fields are 'unknown' (never
// fabricated); undetectable NUMERIC fields (screen dims) are null — a number
// cannot truthfully hold the string 'unknown', and a fabricated 0 would imply a
// real 0×0 screen. null = "not available", which is the honest JSON encoding.
//
// This is the SINGLE source of device detection: the envelope projects its flat
// fields (platform/os_*/device_type/app_version/locale→language) FROM the object
// this returns, so there is exactly one detection path (no duplicated logic).

export interface DeviceContext {
  platform: string        // 'web' | 'android' | 'ios' | 'unknown'
  os_name: string
  os_version: string
  browser_name: string
  browser_version: string
  device_type: string     // 'phone' | 'tablet' | 'desktop' | 'unknown'
  manufacturer: string    // 'Apple' | 'Samsung' | … | 'unknown' (native fills via Build.MANUFACTURER)
  device_model: string
  screen_width: number | null
  screen_height: number | null
  pixel_ratio: number | null   // devicePixelRatio (null = unknown)
  color_scheme: string    // 'light' | 'dark' | 'unknown'
  locale: string
  timezone: string
  app_version: string
  build_number: string
  sdk_version: string     // analytics SDK/contract version (env on Web, native SDK version on Android/iOS)
  network_type: string    // 'wifi'|'cellular'|'ethernet'|'none'|'2g'|'3g'|'4g'|'5g'|'other'|'unknown'
  is_pwa: boolean | 'unknown'  // installed/standalone display mode (true/false/unknown — never fabricated)
}

const UNKNOWN = 'unknown'

// Canonical "all unknown" context. Used for SSR / non-browser contexts and as
// the reference shape Android/iOS fill. platform/app_version are still known
// even without a navigator, so callers may override those two.
export const UNKNOWN_DEVICE_CONTEXT: DeviceContext = {
  platform: UNKNOWN,
  os_name: UNKNOWN,
  os_version: UNKNOWN,
  browser_name: UNKNOWN,
  browser_version: UNKNOWN,
  device_type: UNKNOWN,
  manufacturer: UNKNOWN,
  device_model: UNKNOWN,
  screen_width: null,
  screen_height: null,
  pixel_ratio: null,
  color_scheme: UNKNOWN,
  locale: UNKNOWN,
  timezone: UNKNOWN,
  app_version: UNKNOWN,
  build_number: UNKNOWN,
  sdk_version: UNKNOWN,
  network_type: UNKNOWN,
  is_pwa: UNKNOWN,
}

function getUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
}

function detectDeviceType(ua: string): string {
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'phone'
  if (typeof window !== 'undefined') return 'desktop'
  return UNKNOWN
}

function detectOs(ua: string): { name: string; version: string } {
  if (/Android/i.test(ua)) return { name: 'Android', version: (ua.match(/Android ([\d.]+)/) || [])[1] || UNKNOWN }
  if (/iPhone|iPad|iPod/i.test(ua)) return { name: 'iOS', version: ((ua.match(/OS ([\d_]+)/) || [])[1] || '').replace(/_/g, '.') || UNKNOWN }
  if (/Windows/i.test(ua)) return { name: 'Windows', version: (ua.match(/Windows NT ([\d.]+)/) || [])[1] || UNKNOWN }
  if (/Mac OS X/i.test(ua)) return { name: 'macOS', version: ((ua.match(/Mac OS X ([\d_]+)/) || [])[1] || '').replace(/_/g, '.') || UNKNOWN }
  if (/CrOS/i.test(ua)) return { name: 'ChromeOS', version: UNKNOWN }
  if (/Linux/i.test(ua)) return { name: 'Linux', version: UNKNOWN }
  return { name: UNKNOWN, version: UNKNOWN }
}

function detectBrowser(ua: string): { name: string; version: string } {
  // Order matters: Edge/Opera/Samsung UAs contain "Chrome"; Chrome contains "Safari".
  const rules: Array<{ name: string; re: RegExp }> = [
    { name: 'Edge', re: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
    { name: 'Opera', re: /(?:OPR|Opera)\/([\d.]+)/ },
    { name: 'Samsung Internet', re: /SamsungBrowser\/([\d.]+)/ },
    { name: 'Firefox', re: /(?:Firefox|FxiOS)\/([\d.]+)/ },
    { name: 'Chrome', re: /(?:Chrome|CriOS)\/([\d.]+)/ },
    { name: 'Safari', re: /Version\/([\d.]+).*Safari/ },
  ]
  for (const { name, re } of rules) {
    const m = ua.match(re)
    if (m) return { name, version: m[1] || UNKNOWN }
  }
  return { name: UNKNOWN, version: UNKNOWN }
}

function detectModel(ua: string): string {
  // The Web rarely exposes a device model. Best-effort for Android UAs
  // ("...; <model> Build/..."); default unknown (never fabricate).
  const m = ua.match(/;\s*([^;]+?)\s+Build\//)
  return (m && m[1].trim()) || UNKNOWN
}

function detectManufacturer(ua: string): string {
  // The Web has no hardware-manufacturer API (navigator.vendor is the BROWSER
  // vendor, not the device maker). This is factual INFERENCE from UA tokens
  // (an iPhone is made by Apple), not fabrication — default unknown otherwise.
  // Android/iOS fill this natively (Build.MANUFACTURER / 'Apple').
  if (/iPhone|iPad|iPod|Macintosh/i.test(ua)) return 'Apple'
  if (/SM-|SAMSUNG|Samsung/.test(ua)) return 'Samsung'
  if (/Pixel/.test(ua)) return 'Google'
  if (/HUAWEI|Honor/i.test(ua)) return 'Huawei'
  if (/Xiaomi|Redmi|POCO/i.test(ua)) return 'Xiaomi'
  if (/OnePlus/i.test(ua)) return 'OnePlus'
  if (/OPPO/i.test(ua)) return 'OPPO'
  if (/vivo/i.test(ua)) return 'vivo'
  return UNKNOWN
}

function detectPixelRatio(): number | null {
  try {
    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0) {
      return window.devicePixelRatio
    }
  } catch { /* ignore */ }
  return null
}

function detectColorScheme(): string {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
    }
  } catch { /* ignore */ }
  return UNKNOWN
}

function detectScreen(): { width: number | null; height: number | null } {
  try {
    if (typeof window !== 'undefined' && window.screen) {
      const w = window.screen.width
      const h = window.screen.height
      return {
        width: typeof w === 'number' && w > 0 ? w : null,
        height: typeof h === 'number' && h > 0 ? h : null,
      }
    }
  } catch { /* ignore */ }
  return { width: null, height: null }
}

function detectLocale(): string {
  return (typeof navigator !== 'undefined' && navigator.language) || UNKNOWN
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UNKNOWN
  } catch { return UNKNOWN }
}

function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || UNKNOWN
}

function getBuildNumber(): string {
  return process.env.NEXT_PUBLIC_BUILD_NUMBER || UNKNOWN
}

function getSdkVersion(): string {
  // Web has no separate versioned analytics SDK (the tracker is inline); this is
  // env-sourced, else 'unknown' (never fabricated). Android/iOS set the real
  // native analytics SDK version.
  return process.env.NEXT_PUBLIC_ANALYTICS_SDK_VERSION || UNKNOWN
}

function detectNetworkType(): string {
  try {
    if (typeof navigator === 'undefined') return UNKNOWN
    const conn = (navigator as Navigator & {
      connection?: { effectiveType?: string; type?: string }
    }).connection
    if (conn) {
      // Prefer the PHYSICAL medium (matches Android/iOS connectivity APIs) — the
      // most stable, cross-platform-comparable axis.
      const type = typeof conn.type === 'string' ? conn.type.toLowerCase() : ''
      if (type === 'wifi') return 'wifi'
      if (type === 'cellular') return 'cellular'
      if (type === 'ethernet') return 'ethernet'
      if (type === 'none') return 'none'
      if (type === 'bluetooth' || type === 'wimax' || type === 'other' || type === 'mixed') return 'other'
      // Fallback: effective speed class (Chrome commonly exposes only this).
      const eff = typeof conn.effectiveType === 'string' ? conn.effectiveType.toLowerCase() : ''
      if (eff === 'slow-2g' || eff === '2g' || eff === '3g' || eff === '4g' || eff === '5g') return eff
    }
  } catch { /* ignore */ }
  return UNKNOWN
}

function detectIsPwa(): boolean | 'unknown' {
  try {
    const nav = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { standalone?: boolean })
      : undefined
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      // matchMedia is available → we can positively determine standalone vs not.
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        nav?.standalone === true // iOS "Add to Home Screen"
      )
    }
    // Very old iOS Safari (no matchMedia) still exposes navigator.standalone.
    if (nav && typeof nav.standalone === 'boolean') return nav.standalone
  } catch { /* ignore */ }
  return 'unknown'
}

// Detect the full device context for the Web client. Every field is populated
// where detectable; undetectable fields are 'unknown' (strings) / null (numbers).
export function detectDeviceContext(): DeviceContext {
  if (typeof navigator === 'undefined' && typeof window === 'undefined') {
    // SSR / non-browser: platform + the env-sourced versions are still known.
    return {
      ...UNKNOWN_DEVICE_CONTEXT,
      platform: 'web',
      app_version: getAppVersion(),
      build_number: getBuildNumber(),
      sdk_version: getSdkVersion(),
    }
  }
  const ua = getUserAgent()
  const os = detectOs(ua)
  const browser = detectBrowser(ua)
  const screen = detectScreen()
  return {
    platform: 'web',
    os_name: os.name,
    os_version: os.version,
    browser_name: browser.name,
    browser_version: browser.version,
    device_type: detectDeviceType(ua),
    manufacturer: detectManufacturer(ua),
    device_model: detectModel(ua),
    screen_width: screen.width,
    screen_height: screen.height,
    pixel_ratio: detectPixelRatio(),
    color_scheme: detectColorScheme(),
    locale: detectLocale(),
    timezone: detectTimezone(),
    app_version: getAppVersion(),
    build_number: getBuildNumber(),
    sdk_version: getSdkVersion(),
    network_type: detectNetworkType(),
    is_pwa: detectIsPwa(),
  }
}
