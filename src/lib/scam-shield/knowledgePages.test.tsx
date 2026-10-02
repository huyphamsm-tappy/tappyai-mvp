// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as dictVi, en as dictEn } from '@/lib/i18n/discovery'
import { allScenarios, isOfficialSourceUrl } from './knowledge'
import { SCAM_KB_PATH, scenarioForParam, scenarioJsonLd, scenarioMeta, scenarioPages, scenarioPath } from './knowledgePages'
import ScamKnowledgeIndexPage, { metadata as indexMetadata } from '@/app/scam-shield/kich-ban/page'
import ScamScenarioPage, { generateMetadata, generateStaticParams } from '@/app/scam-shield/kich-ban/[id]/page'
import sitemap from '@/app/sitemap'
import { llmsTxt } from '@/lib/discovery/llmsTxt'

// ─────────────────────────────────────────────────────────────────────────────
// The official scam-scenario pages: 25 static, indexable pages from the
// authoritative dataset. The properties that make them legitimate rather
// than "SEO pages" are pinned here — official text and TappyAI guidance in
// separate, labelled blocks; the source link on the authority's own domain;
// exactly the dataset's ids and no more; no model anywhere on the path.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/share/sharedResultStore', () => ({
  listPublicSharedResults: vi.fn(async () => []),
  getPublicSharedResult: vi.fn(async () => null),
}))

const ROOT = process.cwd()
const ENV = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const jsonLdOf = (c: HTMLElement) => [...c.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? '{}') as Record<string, unknown>)

afterEach(() => { cleanup(); act(() => { setLocale('vi') }) })

describe('scenario pages — exactly the dataset, nothing generated', () => {
  it('there are 25 pages, one per official scenario, and generateStaticParams lists exactly them', () => {
    const pages = scenarioPages()
    expect(pages.length).toBe(25)
    expect(new Set(pages.map((p) => p.id)).size).toBe(25)
    expect(generateStaticParams().map((p) => p.id)).toEqual(pages.map((p) => p.id))
    for (const p of pages) expect(p.path).toMatch(/^\/scam-shield\/kich-ban\/bca-2026-\d{2}$/)
  })
  it('junk ids resolve to nothing (404), never to a guess', () => {
    for (const bad of ['', 'x', '../etc', 'bca-2026-99', 'BCA-2026-01', 'bca-2026-01/', 42, null]) expect(scenarioForParam(bad as string), String(bad)).toBeNull()
    expect(generateMetadata({ params: { id: 'nope-nope' } }).robots).toEqual({ index: false, follow: false })
  })
  it('every scenario cites a source on an official domain, and the Article JSON-LD is based on it', () => {
    for (const s of allScenarios()) {
      expect(isOfficialSourceUrl(s.source.url), s.id).toBe(true)
      const ld = scenarioJsonLd(s, ENV)
      expect(ld['@type']).toBe('Article')
      expect((ld.isBasedOn as { url: string }).url).toBe(s.source.url)
      expect(ld.url).toBe(`https://www.tappyai.com${scenarioPath(s.id)}`)
      expect(ld.inLanguage).toBe('vi')
    }
  })
})

describe('scenario page — render', () => {
  const s = allScenarios()[0]
  it('has canonical, index + Discover directive, article OG, and the dataset title', () => {
    const meta = generateMetadata({ params: { id: s.id } })
    expect(meta.alternates?.canonical).toBe(`https://www.tappyai.com${scenarioPath(s.id)}`)
    expect(meta.robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
    expect(meta.title).toBe(scenarioMeta(s).title)
    expect(String(meta.title)).toContain(s.official.title)
    expect((meta.openGraph as { type: string }).type).toBe('article')
  })
  it('renders official text and TappyAI guidance in separate labelled blocks, with the official source link', () => {
    const { container } = render(<ScamScenarioPage params={{ id: s.id }} />)
    expect(container.querySelector('h1')?.textContent).toBe(s.official.title)
    expect(container.querySelector('[data-kb-official]')).not.toBeNull()
    expect(container.querySelector('[data-kb-guidance]')).not.toBeNull()
    const link = container.querySelector('[data-kb-source-link]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(s.source.url)
    expect(link.getAttribute('rel')).toContain('noopener')
    // The guidance block says it is TappyAI's, not a quotation (the v3 dictionary's note).
    expect(container.querySelector('[data-kb-guidance]')?.textContent).toContain('TappyAI')
    const types = jsonLdOf(container).map((l) => l['@type'])
    expect(types).toEqual(['Article', 'BreadcrumbList'])
    const crumbs = (jsonLdOf(container)[1].itemListElement as Array<{ item: string }>).map((c) => c.item)
    expect(crumbs).toEqual(['https://www.tappyai.com/', 'https://www.tappyai.com/scam-shield', `https://www.tappyai.com${SCAM_KB_PATH}`, `https://www.tappyai.com${scenarioPath(s.id)}`])
  })
  it('links into Scam Shield, the extension and the index; siblings in the same group', () => {
    const { container } = render(<ScamScenarioPage params={{ id: s.id }} />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/scam-shield')
    expect(hrefs).toContain('/extension')
    expect(hrefs).toContain(SCAM_KB_PATH)
    expect(hrefs.filter((h) => h?.startsWith(`${SCAM_KB_PATH}/`)).length).toBeGreaterThan(0)
    expect(hrefs).not.toContain(scenarioPath(s.id)) // a page does not list itself
  })
  it('chrome reconciles to English while the official content stays as published', () => {
    const { container } = render(<ScamScenarioPage params={{ id: s.id }} />)
    act(() => { setLocale('en') })
    expect(container.textContent).toContain(dictEn['kb.page.checkTitle'])
    expect(container.querySelector('h1')?.textContent).toBe(s.official.title)
  })
})

describe('index page', () => {
  it('lists all 25 scenarios grouped under the five official groups, with ItemList + BreadcrumbList', () => {
    expect(indexMetadata.alternates?.canonical).toBe(`https://www.tappyai.com${SCAM_KB_PATH}`)
    const { container } = render(<ScamKnowledgeIndexPage />)
    expect(container.querySelectorAll('[data-kb-group]').length).toBe(5)
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h?.startsWith(`${SCAM_KB_PATH}/`))
    expect(new Set(links).size).toBe(25)
    const lds = jsonLdOf(container)
    expect(lds.map((l) => l['@type'])).toEqual(['ItemList', 'BreadcrumbList'])
    expect(lds[0].numberOfItems).toBe(25)
    expect(container.querySelector('h1')?.textContent).toBe(dictVi['kb.index.h1'])
  })
})

describe('discovery wiring', () => {
  it('the sitemap and llms.txt carry the index; the sitemap carries all 25 pages', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`https://www.tappyai.com${SCAM_KB_PATH}`)
    expect(urls.filter((u) => u.includes(`${SCAM_KB_PATH}/`)).length).toBe(25)
    expect(llmsTxt(ENV)).toContain(`https://www.tappyai.com${SCAM_KB_PATH}`)
  })
  it('the page layer imports nothing that can reach a model', () => {
    for (const f of ['src/app/scam-shield/kich-ban/page.tsx', 'src/app/scam-shield/kich-ban/[id]/page.tsx', 'src/app/scam-shield/kich-ban/[id]/ScenarioPageBody.tsx', 'src/app/scam-shield/kich-ban/KnowledgeIndexBody.tsx', 'src/lib/scam-shield/knowledgePages.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      expect(src, f).not.toMatch(/@\/lib\/ai\/|streamText|generateText|fetch\(|@\/lib\/memory|scam-shield\/engine|orchestrator/)
    }
  })
})
