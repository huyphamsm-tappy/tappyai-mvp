// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as dictVi, en as dictEn } from '@/lib/i18n/discovery'
import { EXTENSION_PATH, EXTENSION_PRIVACY_PATH, EXTENSION_VERSION, EXTENSION_WELCOME_PATH, extensionJsonLd, extensionStoreLinks, extensionStoreUrl, extensionWelcomeUrl } from './extensionListing'
import { welcomeUrl } from '../../../extensions/browser/src/links.js'
import { EXTENSION_WELCOME_LANDING } from '@/lib/analytics/growthMetrics'
import ExtensionPage, { metadata as extMetadata } from '@/app/extension/page'
import ExtensionPrivacyPage, { metadata as privMetadata } from '@/app/extension/privacy/page'
import ExtensionWelcomePage, { metadata as welcomeMetadata } from '@/app/extension/welcome/page'
import sitemap from '@/app/sitemap'

// ─────────────────────────────────────────────────────────────────────────────
// The extension's acquisition chain, pinned:
//   web page (/extension, indexable) → store link (only when published) →
//   install → /extension/welcome (attributed, the install signal) → first query.
// Nothing here claims store presence: with no store URL configured the page
// says "awaiting review" and offers the web app.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/share/sharedResultStore', () => ({
  listPublicSharedResults: vi.fn(async () => []),
  getPublicSharedResult: vi.fn(async () => null),
}))

const ROOT = join(process.cwd())
const jsonLdOf = (c: HTMLElement) => [...c.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? '{}') as Record<string, unknown>)

afterEach(() => { cleanup(); act(() => { setLocale('vi') }) })

describe('store links — env-gated and host-checked', () => {
  const env = (o: Record<string, string>) => ({ NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com', ...o }) as unknown as NodeJS.ProcessEnv
  it('are empty until the owner pastes real store URLs', () => {
    expect(extensionStoreLinks(env({}))).toEqual([])
    expect(extensionStoreUrl('chrome', env({ NEXT_PUBLIC_EXTENSION_URL_CHROME: 'https://evil.example/x' }))).toBeNull()
    expect(extensionStoreUrl('chrome', env({ NEXT_PUBLIC_EXTENSION_URL_CHROME: 'http://chromewebstore.google.com/detail/x' }))).toBeNull()
  })
  it('accept each store on its own host only', () => {
    const e = env({
      NEXT_PUBLIC_EXTENSION_URL_CHROME: 'https://chromewebstore.google.com/detail/tappyai/abcdefghijklmnop',
      NEXT_PUBLIC_EXTENSION_URL_EDGE: 'https://microsoftedge.microsoft.com/addons/detail/tappyai/abcdefghijklmnop',
      NEXT_PUBLIC_EXTENSION_URL_FIREFOX: 'https://addons.mozilla.org/firefox/addon/tappyai/',
    })
    expect(extensionStoreLinks(e).map((l) => l.store)).toEqual(['chrome', 'edge', 'firefox'])
    const ld = extensionJsonLd({ name: 'n', description: 'd' }, e)
    expect(ld['@type']).toBe('SoftwareApplication')
    expect(ld.isAccessibleForFree).toBe(true)
    expect((ld.installUrl as string[]).length).toBe(3)
    expect(extensionJsonLd({ name: 'n', description: 'd' }, env({})).installUrl).toBeUndefined()
  })
})

describe('the install signal — welcome page contract shared by extension and web', () => {
  it('the extension opens exactly the attributed welcome URL the web app counts', () => {
    expect(welcomeUrl()).toBe('https://www.tappyai.com/extension/welcome?src=browser_extension')
    expect(extensionWelcomeUrl({ NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv)).toBe(welcomeUrl())
    expect(EXTENSION_WELCOME_LANDING).toBe(EXTENSION_WELCOME_PATH)
  })
  it('background.js opens it on a fresh install only', () => {
    const bg = readFileSync(join(ROOT, 'extensions/browser/background.js'), 'utf8')
    expect(bg).toMatch(/details\?\.reason === 'install'/)
    expect(bg).toContain('welcomeUrl(')
  })
  it('the manifest version, homepage and Firefox id match the web config', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'extensions/browser/manifest.json'), 'utf8')) as Record<string, unknown>
    expect(m.version).toBe(EXTENSION_VERSION)
    expect(m.homepage_url).toBe(`https://www.tappyai.com${EXTENSION_PATH}`)
    expect((m.browser_specific_settings as { gecko: { id: string } }).gecko.id).toBe('extension@tappyai.com')
  })
})

describe('/extension — the public landing page', () => {
  it('is indexable with a canonical, SoftwareApplication + BreadcrumbList, vi SSR → en', () => {
    expect(extMetadata.alternates?.canonical).toBe('https://www.tappyai.com/extension')
    expect(extMetadata.robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
    const { container } = render(<ExtensionPage />)
    expect(jsonLdOf(container).map((l) => l['@type'])).toEqual(['SoftwareApplication', 'BreadcrumbList'])
    expect(container.querySelector('h1')?.textContent).toBe(dictVi['ext.h1'])
    act(() => { setLocale('en') })
    expect(container.querySelector('h1')?.textContent).toBe(dictEn['ext.h1'])
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(EXTENSION_PRIVACY_PATH)
    expect(hrefs).toContain('/about')
  })
  it('with no store URL configured it never shows an install button and never claims store presence', () => {
    const { container } = render(<ExtensionPage />)
    expect(container.querySelector('[data-testid="extension-coming-soon"]')).not.toBeNull()
    expect(container.querySelector('a[data-store]')).toBeNull()
    expect(container.textContent).not.toMatch(/Featured|Editor|#1|Number One/i)
  })
  it('names the three permissions and nothing more', () => {
    const { container } = render(<ExtensionPage />)
    const dts = [...container.querySelectorAll('dt.font-mono')].map((d) => d.textContent)
    expect(dts).toEqual(['activeTab', 'contextMenus', 'storage'])
  })
})

describe('/extension/privacy and /extension/welcome', () => {
  it('the privacy policy is public, canonical and states the no-collection rule in both languages', () => {
    expect(privMetadata.alternates?.canonical).toBe('https://www.tappyai.com/extension/privacy')
    const { container } = render(<ExtensionPrivacyPage />)
    expect(container.textContent).toContain(dictVi['ext.privacyCollect'])
    expect(container.textContent).toContain('support@tappyai.com')
    act(() => { setLocale('en') })
    expect(container.textContent).toContain(dictEn['ext.privacyCollect'])
  })
  it('the welcome page is noindex and its CTA carries the extension attribution', () => {
    expect(welcomeMetadata.robots).toEqual({ index: false, follow: true })
    const { container } = render(<ExtensionWelcomePage />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/chat?src=browser_extension')
    expect(hrefs).toContain(EXTENSION_PATH)
  })
  it('the landing and privacy pages are in the sitemap; the welcome page is not', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain('https://www.tappyai.com/extension')
    expect(urls).toContain('https://www.tappyai.com/extension/privacy')
    expect(urls).not.toContain('https://www.tappyai.com/extension/welcome')
  })
})
