import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import robots, { DISALLOWED_PATHS } from '@/app/robots'
import sitemap from '@/app/sitemap'
import { llmsTxt } from './llmsTxt'
import { HUB_DOMAINS } from './domainHubs'
import { SCAM_KB_PATH, scenarioPages } from '@/lib/scam-shield/knowledgePages'
import { GET as getAssetLinks } from '@/app/.well-known/assetlinks.json/route'
import { GET as getAasa } from '@/app/.well-known/apple-app-site-association/route'
import { GET as getIndexNowKey } from '@/app/.well-known/indexnow/[key]/route'
import { GET as getOpenSearch } from '@/app/opensearch.xml/route'
import { GET as getFeed } from '@/app/feed.xml/route'
import { GET as getLlms } from '@/app/llms.txt/route'

// ─────────────────────────────────────────────────────────────────────────────
// The cross-check the release task asks for: every public acquisition surface
// is in the sitemap, none is disallowed for crawlers, the env-gated
// association files stay silent until configured, and the private surfaces
// are disallowed. One place to read the whole crawlable set.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/share/sharedResultStore', () => ({
  listPublicSharedResults: vi.fn(async () => []),
  getPublicSharedResult: vi.fn(async () => null),
}))

const ORIGIN = 'https://www.tappyai.com'
const INDEXABLE_STATIC = ['/', '/about', '/startup', ...HUB_DOMAINS.map((d) => `/${d}`), '/scam-shield', SCAM_KB_PATH, ...scenarioPages().map((p) => p.path), '/extension', '/extension/privacy', '/how-to-use', '/privacy', '/terms']
const NOT_IN_SITEMAP_BY_DESIGN = ['/extension/welcome']

describe('public acquisition surfaces — the crawlable set', () => {
  it('every indexable static surface is in the sitemap; the post-install welcome page is not', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const p of INDEXABLE_STATIC) expect(urls, p).toContain(`${ORIGIN}${p}`)
    for (const p of NOT_IN_SITEMAP_BY_DESIGN) expect(urls).not.toContain(`${ORIGIN}${p}`)
    expect(urls.some((u) => u.includes('?'))).toBe(false)
  })

  it('no indexable surface is disallowed for crawlers, and the private ones are', () => {
    const disallowed = [...DISALLOWED_PATHS]
    for (const p of [...INDEXABLE_STATIC, '/r/AbCdEfGh12', '/llms.txt', '/feed.xml', '/opensearch.xml', '/.well-known/assetlinks.json']) {
      expect(disallowed.some((d) => p === d || p.startsWith(d)), `${p} must be crawlable`).toBe(false)
    }
    for (const p of ['/api/x', '/admin', '/chat', '/profile', '/login', '/age-check', '/controller', '/share-target']) {
      expect(disallowed.some((d) => p === d || p.startsWith(d)), `${p} must be disallowed`).toBe(true)
    }
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`)
  })

  it('the env-gated association files are 404 until the owner configures them (nothing invented)', () => {
    for (const k of ['ANDROID_APP_LINKS_SHA256', 'IOS_UNIVERSAL_LINKS_APP_ID', 'INDEXNOW_KEY']) delete process.env[k]
    expect(getAssetLinks().status).toBe(404)
    expect(getAasa().status).toBe(404)
    expect(getIndexNowKey(new Request('https://x'), { params: { key: 'deadbeefdeadbeef.txt' } }).status).toBe(404)
  })

  it('the machine-readable surfaces answer and list only public pages', async () => {
    expect(getOpenSearch().status).toBe(200)
    expect((await getFeed()).status).toBe(200)
    const llms = await getLlms().text()
    expect(llms).toContain(`${ORIGIN}${SCAM_KB_PATH}`)
    expect(llms).toContain(`${ORIGIN}/extension`)
    for (const d of DISALLOWED_PATHS) expect(llms).not.toContain(`${ORIGIN}${d}`)
    expect(llmsTxt({ NEXT_PUBLIC_SITE_URL: ORIGIN } as unknown as NodeJS.ProcessEnv)).toBe(llms)
  })

  it('the canonical origin is one host everywhere (www), and no real secret is in the env example', () => {
    expect(readFileSync('src/lib/share/openGraph.ts', 'utf8')).toContain("const FALLBACK_SITE_URL = 'https://www.tappyai.com'")
    expect(readFileSync('src/components/landing/config.ts', 'utf8')).toContain("export const SITE_URL = 'https://www.tappyai.com'")
    const example = readFileSync('.env.local.example', 'utf8')
    for (const k of ['INDEXNOW_KEY', 'ORGANIZATION_SAME_AS', 'NEXT_PUBLIC_EXTENSION_URL_CHROME', 'ANDROID_APP_LINKS_SHA256']) {
      expect(example).toMatch(new RegExp(`^${k}=\\s*$`, 'm'))
    }
  })
})
