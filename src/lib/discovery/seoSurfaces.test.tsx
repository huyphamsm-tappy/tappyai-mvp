// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as hubVi, en as hubEn } from '@/lib/i18n/discovery'
import { organizationJsonLd, organizationId, siteJsonLd, breadcrumbJsonLd, homeCrumb, hubCrumb, aboutPageJsonLd } from './siteJsonLd'
import { HUB_DOMAINS } from './domainHubs'
import { DISALLOWED_PATHS } from '@/app/robots'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import AboutPage, { metadata as aboutMetadata } from '@/app/about/page'
import { metadata as scamMetadata } from '@/app/scam-shield/page'
import DomainHubPage, { generateMetadata as hubMetadata } from '@/app/(discovery)/[domain]/page'
import { ROUTE_TITLES } from '@/lib/share/openGraph'
import type { PublicSharedResult } from '@/lib/share/sharedResult'

// ─────────────────────────────────────────────────────────────────────────────
// G1 completion — Google Search / AI-search technical audit, pinned.
//
// Every public surface has one canonical, an explicit index/follow decision,
// server-rendered text and structured data that agrees across pages. The
// private surfaces are disallowed for crawlers. Nothing here calls a model or
// a database: the store is mocked to the empty list a fresh deployment has.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/share/sharedResultStore', () => ({
  listPublicSharedResults: vi.fn(async () => []),
  getPublicSharedResult: vi.fn(async () => null),
}))

const ROOT = join(__dirname, '..', '..', '..')
const ENV = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const jsonLdOf = (container: HTMLElement) =>
  [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? '{}') as Record<string, unknown>)

afterEach(() => { cleanup(); act(() => { setLocale('vi') }) })

describe('entity layer — ONE Organization node across /, /about and /startup', () => {
  it('has a stable @id, the brand facts, no user data and no unverified sameAs', () => {
    const org = organizationJsonLd(ENV)
    expect(org['@id']).toBe('https://www.tappyai.com/#organization')
    expect(org.name).toBe('TappyAI')
    expect(org.logo).toBe('https://www.tappyai.com/branding/otter-logo.png')
    expect(org.email).toBe('support@tappyai.com')
    expect(org.sameAs).toBeUndefined()
    expect(JSON.stringify(org)).not.toMatch(/user_id|anon|session|token/)
  })

  it('the WebSite node publishes through that same @id, and the home JSON-LD carries both', () => {
    const [site, org] = siteJsonLd(ENV)
    expect((site.publisher as { '@id': string })['@id']).toBe(organizationId(ENV))
    expect(org['@id']).toBe(organizationId(ENV))
  })

  it('/startup emits the shared node rather than its own definition', () => {
    const src = readFileSync(join(ROOT, 'src/app/startup/page.tsx'), 'utf8')
    expect(src).toContain("import { organizationJsonLd } from '@/lib/discovery/siteJsonLd'")
    expect(src).not.toMatch(/'@type':\s*'Organization'/)
  })

  it('/about renders the AboutPage + Organization + BreadcrumbList, server-side in Vietnamese, reconciled to English', () => {
    const { container } = render(<AboutPage />)
    const types = jsonLdOf(container).map((ld) => ld['@type'])
    expect(types).toEqual(['AboutPage', 'Organization', 'BreadcrumbList'])
    const about = jsonLdOf(container)[0]
    expect((about.mainEntity as { '@id': string })['@id']).toBe(organizationId())
    expect(container.querySelector('h1')?.textContent).toBe(hubVi['about.h1'])
    // Internal links: every hub, Scam Shield, the legal pages and the story — the crawl graph.
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const d of HUB_DOMAINS) expect(hrefs).toContain(`/${d}`)
    for (const p of ['/scam-shield', '/how-to-use', '/privacy', '/terms', '/startup', '/chat']) expect(hrefs).toContain(p)
    act(() => { setLocale('en') })
    expect(container.querySelector('h1')?.textContent).toBe(hubEn['about.h1'])
    expect(container.textContent).toContain('support@tappyai.com')
  })

  it('/about metadata: canonical, indexable, bilingual OG locales, title from the route table', () => {
    expect(aboutMetadata.alternates?.canonical).toBe('https://www.tappyai.com/about')
    expect(aboutMetadata.robots).toEqual({ index: true, follow: true })
    expect(aboutMetadata.title).toBe(ROUTE_TITLES['/about'].vi)
    expect(aboutPageJsonLd({ title: 't', description: 'd' }, ENV).url).toBe('https://www.tappyai.com/about')
  })
})

describe('Scam Shield — the highest-intent public entry finally has metadata', () => {
  it('has a canonical without the deep-link query, indexable, dictionary-backed description', () => {
    expect(scamMetadata.alternates?.canonical).toBe('https://www.tappyai.com/scam-shield')
    expect(scamMetadata.robots).toEqual({ index: true, follow: true })
    expect(scamMetadata.title).toBe(ROUTE_TITLES['/scam-shield'].vi)
    expect(scamMetadata.description).toBe(hubVi['seo.scamShield.description'])
    expect(ROUTE_TITLES['/scam-shield'].en).not.toBe(ROUTE_TITLES['/scam-shield'].vi)
  })
})

describe('home — one canonical, stated by the page, not the layout', () => {
  it('the home page declares canonical "/" and the root layout declares none', () => {
    const home = readFileSync(join(ROOT, 'src/app/(home)/page.tsx'), 'utf8')
    expect(home).toMatch(/alternates:\s*\{\s*canonical:\s*absoluteUrl\('\/'\)\s*\}/)
    const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8')
    expect(layout).not.toMatch(/canonical/)
  })
})

describe('hubs and public results — breadcrumbs (crawl depth ≤ 2)', () => {
  it('a hub renders FAQPage ×2 and a Home › hub BreadcrumbList', async () => {
    const el = await DomainHubPage({ params: { domain: 'food' } })
    const { container } = render(el)
    const lds = jsonLdOf(container)
    expect(lds.map((l) => l['@type'])).toEqual(['FAQPage', 'FAQPage', 'BreadcrumbList'])
    const crumbs = lds[2].itemListElement as Array<{ position: number; name: string; item: string }>
    expect(crumbs.map((c) => c.item)).toEqual(['https://www.tappyai.com/', 'https://www.tappyai.com/food'])
    expect(crumbs[1].name).toBe(hubVi['hub.food.h1'])
    const meta = hubMetadata({ params: { domain: 'food' } })
    expect(meta.alternates?.canonical).toBe('https://www.tappyai.com/food')
  })

  it('the trail helper is pure and absolute', () => {
    const ld = breadcrumbJsonLd([homeCrumb(), hubCrumb('travel'), { name: 'X', path: '/r/AbCdEfGh12' }], ENV)
    const items = ld.itemListElement as Array<{ position: number; item: string }>
    expect(items.map((i) => i.position)).toEqual([1, 2, 3])
    expect(items[2].item).toBe('https://www.tappyai.com/r/AbCdEfGh12')
  })

  it('a public result gets a trail only when it is listed (a real account owns it) and in a hub domain', () => {
    const src = readFileSync(join(ROOT, 'src/app/r/[slug]/page.tsx'), 'utf8')
    expect(src).toMatch(/row\.owner_is_anonymous !== true && isHubDomain\(domain\)/)
    const row = { owner_is_anonymous: false, payload: { domain: 'scam' } } as unknown as PublicSharedResult
    // The decision the page makes, replayed on data: a scam verdict has no hub, so no trail.
    expect(row.owner_is_anonymous !== true && (HUB_DOMAINS as readonly string[]).includes(row.payload.domain)).toBe(false)
  })
})

describe('robots and sitemap — the crawlable set', () => {
  it('disallows the private surfaces, including the age gate and the back-office door', () => {
    for (const p of ['/api/', '/admin', '/chat', '/profile', '/auth/', '/share-target', '/age-check', '/controller']) expect(DISALLOWED_PATHS).toContain(p)
    const r = robots()
    expect(r.rules).toEqual([{ userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] }])
    expect(r.sitemap).toBe('https://www.tappyai.com/sitemap.xml')
  })

  it('the sitemap lists home, /about, Scam Shield, the five hubs, help/legal, /startup — and nothing disallowed', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const p of ['/', '/about', '/scam-shield', '/how-to-use', '/privacy', '/terms', '/startup', ...HUB_DOMAINS.map((d) => `/${d}`)]) {
      expect(urls, p).toContain(`https://www.tappyai.com${p}`)
    }
    for (const u of urls) for (const p of DISALLOWED_PATHS) expect(u.replace('https://www.tappyai.com', '').startsWith(p), u).toBe(false)
    expect(urls.some((u) => u.includes('?'))).toBe(false)
  })

  it('llms.txt itself is not disallowed', () => {
    expect(DISALLOWED_PATHS.some((p) => '/llms.txt'.startsWith(p))).toBe(false)
  })
})
