import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ANALYTICS_SOURCES } from '@/lib/analytics/analytics-contract'
import { SOURCE_PARAM as WEB_SOURCE_PARAM } from '@/lib/analytics/attribution'
import { SCAM_SHIELD_URL_PARAM } from '@/lib/scam-shield/deepLink'
import {
  askUrl, askAboutPageUrl, scamCheckUrl, homeUrl, forwardablePageUrl, cleanText,
  SOURCE, SOURCE_PARAM, MAX_SELECTION_CHARS, DEFAULT_ORIGIN,
} from '../../../extensions/browser/src/links.js'
import { MENU, destinationFor } from '../../../extensions/browser/src/menu.js'
import { normalizeSettings } from '../../../extensions/browser/src/settings.js'

// ─────────────────────────────────────────────────────────────────────────────
// The browser extension (extensions/browser) is plain MV3 JavaScript with no
// build step, so the web repo's suite is where its contract is pinned:
//   · the permission model can only shrink, never grow, without this failing;
//   · every deep link it opens is one the web app attributes and prefills;
//   · nothing non-http(s), no credentials, no query/fragment ever leaves.
// ─────────────────────────────────────────────────────────────────────────────

const EXT_DIR = join(process.cwd(), 'extensions', 'browser')
const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf8')) as Record<string, unknown>

/** The whole allow-list. Adding to it is a privacy decision, not a convenience. */
const ALLOWED_PERMISSIONS = new Set(['activeTab', 'contextMenus', 'storage'])
const FORBIDDEN_ANYWHERE = ['tabs', 'history', 'webNavigation', 'webRequest', 'cookies', 'bookmarks', 'downloads', 'scripting', 'declarativeNetRequest', 'management', 'identity', 'geolocation', 'clipboardRead']

describe('browser extension — manifest and permission model', () => {
  it('is Manifest V3 with a module service worker and a popup, no content scripts', () => {
    expect(manifest.manifest_version).toBe(3)
    expect((manifest.background as { service_worker: string; type: string }).type).toBe('module')
    expect((manifest.action as { default_popup: string }).default_popup).toBe('popup.html')
    expect(manifest.content_scripts).toBeUndefined()
  })

  it('requests only activeTab, contextMenus and storage — and no host permissions', () => {
    const perms = manifest.permissions as string[]
    expect(new Set(perms)).toEqual(ALLOWED_PERMISSIONS)
    expect(manifest.host_permissions).toEqual([])
    expect(manifest.optional_permissions).toBeUndefined()
    expect(manifest.optional_host_permissions).toBeUndefined()
    for (const p of FORBIDDEN_ANYWHERE) expect(JSON.stringify(manifest)).not.toContain(`"${p}"`)
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>')
  })

  it('ships every referenced file, and the extension code never touches history or a network API', () => {
    for (const f of ['background.js', 'popup.html', 'popup.js', 'popup.css', 'src/links.js', 'src/menu.js', 'src/settings.js']) {
      expect(() => readFileSync(join(EXT_DIR, f))).not.toThrow()
    }
    for (const [, icon] of Object.entries(manifest.icons as Record<string, string>)) expect(() => readFileSync(join(EXT_DIR, icon))).not.toThrow()
    const code = ['background.js', 'popup.js', 'src/links.js', 'src/menu.js', 'src/settings.js'].map(f => readFileSync(join(EXT_DIR, f), 'utf8')).join('\n')
    expect(code).not.toMatch(/chrome\.history|chrome\.webNavigation|chrome\.webRequest|chrome\.cookies|chrome\.scripting|tabs\.onUpdated|fetch\(|XMLHttpRequest|sendBeacon|localStorage/)
  })

  it('has complete vi and en locale tables that reference every __MSG__ key the manifest and popup use', () => {
    const dirs = readdirSync(join(EXT_DIR, '_locales'))
    expect(dirs.sort()).toEqual(['en', 'vi'])
    const vi = JSON.parse(readFileSync(join(EXT_DIR, '_locales/vi/messages.json'), 'utf8')) as Record<string, { message: string }>
    const en = JSON.parse(readFileSync(join(EXT_DIR, '_locales/en/messages.json'), 'utf8')) as Record<string, { message: string }>
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort())
    for (const k of Object.keys(vi)) { expect(vi[k].message.trim()).not.toBe(''); expect(en[k].message.trim()).not.toBe('') }
    const used = new Set<string>()
    for (const m of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) used.add(m[1])
    for (const m of readFileSync(join(EXT_DIR, 'popup.html'), 'utf8').matchAll(/data-i18n="(\w+)"/g)) used.add(m[1])
    for (const m of readFileSync(join(EXT_DIR, 'background.js'), 'utf8').matchAll(/getMessage\('(\w+)'\)/g)) used.add(m[1])
    for (const m of readFileSync(join(EXT_DIR, 'popup.js'), 'utf8').matchAll(/getMessage\('(\w+)'\)/g)) used.add(m[1])
    for (const k of used) expect(vi, `missing locale key ${k}`).toHaveProperty(k)
    expect(manifest.default_locale).toBe('vi')
  })
})

describe('browser extension — deep links match the web app contract', () => {
  it('uses the source value and parameter the web analytics contract accepts', () => {
    expect(SOURCE).toBe('browser_extension')
    expect(ANALYTICS_SOURCES).toContain(SOURCE)
    expect(SOURCE_PARAM).toBe(WEB_SOURCE_PARAM)
    expect(DEFAULT_ORIGIN).toBe('https://www.tappyai.com')
  })

  it('a selection becomes /chat?q=…&src=browser_extension', () => {
    const u = new URL(askUrl('  quán bún bò   ngon quận 1 ')!)
    expect(u.origin + u.pathname).toBe('https://www.tappyai.com/chat')
    expect(u.searchParams.get('q')).toBe('quán bún bò ngon quận 1')
    expect(u.searchParams.get('src')).toBe('browser_extension')
    expect(askUrl('')).toBeNull()
    expect(askUrl(undefined)).toBeNull()
  })

  it('a page becomes a question naming its title and stripped URL, in the chosen language', () => {
    const vi = new URL(askAboutPageUrl({ url: 'https://shopee.vn/item?x=1#frag', title: 'Máy hút bụi' })!)
    expect(vi.searchParams.get('q')).toBe('Cho mình biết về: Máy hút bụi\nhttps://shopee.vn/item')
    const en = new URL(askAboutPageUrl({ url: 'https://shopee.vn/item?x=1', title: 'Vacuum' }, { lang: 'en' })!)
    expect(en.searchParams.get('q')).toBe('Tell me about: Vacuum\nhttps://shopee.vn/item')
    expect(new URL(askAboutPageUrl({ url: 'https://a.vn/p' })!).searchParams.get('q')).toBe('Cho mình biết về link này: https://a.vn/p')
  })

  it('a scam check becomes /scam-shield?url=…&src=… using the parameter the page prefills from', () => {
    const u = new URL(scamCheckUrl('https://bad.example/login?token=abc#x')!)
    expect(u.pathname).toBe('/scam-shield')
    expect(u.searchParams.get(SCAM_SHIELD_URL_PARAM)).toBe('https://bad.example/login')
    expect(u.searchParams.get('src')).toBe('browser_extension')
  })

  it('the home entry is attributed too', () => {
    expect(homeUrl()).toBe('https://www.tappyai.com/?src=browser_extension')
    expect(homeUrl({ origin: 'https://staging.example/' })).toBe('https://staging.example/?src=browser_extension')
  })
})

describe('browser extension — URL handling never forwards what it should not', () => {
  it('forwards only http(s) pages, and never chrome://, file://, about:, extension pages, javascript: or localhost', () => {
    expect(forwardablePageUrl('https://vnexpress.net/a?b=1#c')).toBe('https://vnexpress.net/a')
    expect(forwardablePageUrl('http://example.com/x')).toBe('http://example.com/x')
    for (const bad of ['chrome://extensions', 'chrome-extension://abc/popup.html', 'file:///C:/secret.txt', 'about:blank', 'javascript:alert(1)', 'data:text/html,hi', 'edge://settings', 'http://localhost:3000/', '', 'not a url', 'ftp://x.vn/f']) {
      expect(forwardablePageUrl(bad), bad).toBeNull()
      expect(scamCheckUrl(bad), bad).toBeNull()
      expect(askAboutPageUrl({ url: bad, title: 't' }), bad).toBeNull()
    }
    expect(forwardablePageUrl(42)).toBeNull()
  })

  it('strips credentials, query strings and fragments — a page URL is never a token carrier', () => {
    expect(forwardablePageUrl('https://user:pass@bank.vn/login?session=abc#top')).toBe('https://bank.vn/login')
  })

  it('caps selected text and removes control characters', () => {
    expect(cleanText('a\u0000b\u0007c\td')).toBe('a b c d')
    const long = 'x'.repeat(MAX_SELECTION_CHARS + 500)
    const out = cleanText(long)
    expect(out.length).toBe(MAX_SELECTION_CHARS)
    expect(out.endsWith('…')).toBe(true)
    expect(new URL(askUrl(long)!).searchParams.get('q')!.length).toBe(MAX_SELECTION_CHARS)
  })
})

describe('browser extension — context menu decisions', () => {
  const settings = { lang: 'vi', origin: DEFAULT_ORIGIN }
  it('maps each menu item to the right destination from click info alone', () => {
    expect(destinationFor(MENU.askSelection, { selectionText: 'giá iPhone 15' }, undefined, settings)).toContain('/chat?q=gi%C3%A1+iPhone+15')
    expect(destinationFor(MENU.askPage, { pageUrl: 'https://a.vn/p?x=1' }, { title: 'P' }, settings)).toContain('/chat?q=')
    expect(destinationFor(MENU.checkLink, { linkUrl: 'https://b.vn/l' }, undefined, settings)).toContain('/scam-shield?url=https%3A%2F%2Fb.vn%2Fl')
    expect(destinationFor(MENU.checkPage, { pageUrl: 'https://c.vn/' }, undefined, settings)).toContain('/scam-shield?url=https%3A%2F%2Fc.vn%2F')
  })
  it('opens nothing for an empty selection, a non-web page or an unknown id', () => {
    expect(destinationFor(MENU.askSelection, { selectionText: '   ' }, undefined, settings)).toBeNull()
    expect(destinationFor(MENU.checkPage, { pageUrl: 'chrome://newtab' }, undefined, settings)).toBeNull()
    expect(destinationFor('something-else', { selectionText: 'x' }, undefined, settings)).toBeNull()
  })
  it('settings are coerced: unknown language → vi, non-https origin → production', () => {
    expect(normalizeSettings(null)).toEqual({ lang: 'vi', origin: DEFAULT_ORIGIN })
    expect(normalizeSettings({ lang: 'fr', origin: 'http://evil.example' })).toEqual({ lang: 'vi', origin: DEFAULT_ORIGIN })
    expect(normalizeSettings({ lang: 'en', origin: 'https://staging.tappyai.com/' })).toEqual({ lang: 'en', origin: 'https://staging.tappyai.com' })
  })
})
