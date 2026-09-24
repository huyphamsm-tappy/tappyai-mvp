// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as dictVi, en as dictEn } from '@/lib/i18n/discovery'
import { HUB_DOMAINS } from '@/lib/discovery/domainHubs'
import PublicFooter, { PUBLIC_FOOTER_ABOUT_LINKS } from './PublicFooter'
import AboutPage from '@/app/about/page'
import ExtensionPage from '@/app/extension/page'
import DomainHubPage from '@/app/(discovery)/[domain]/page'
import ScamKnowledgeIndexPage from '@/app/scam-shield/kich-ban/page'

vi.mock('@/lib/share/sharedResultStore', () => ({
  listPublicSharedResults: vi.fn(async () => []),
  getPublicSharedResult: vi.fn(async () => null),
}))

afterEach(() => { cleanup(); act(() => { setLocale('vi') }) })

describe('PublicFooter — the crawlable link block on discovery pages', () => {
  it('links every hub and every About surface, as plain internal hrefs with no parameters', () => {
    const { container } = render(<PublicFooter />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    for (const d of HUB_DOMAINS) expect(hrefs).toContain(`/${d}`)
    for (const p of PUBLIC_FOOTER_ABOUT_LINKS) expect(hrefs).toContain(p)
    expect(hrefs.every((h) => h.startsWith('/') && !h.includes('?') && !h.includes('#'))).toBe(true)
    expect(container.querySelectorAll('nav[aria-label]').length).toBe(2)
  })
  it('is bilingual and never hard-codes the labels', () => {
    const { container } = render(<PublicFooter />)
    expect(container.textContent).toContain(dictVi['footer.explore'])
    act(() => { setLocale('en') })
    expect(container.textContent).toContain(dictEn['footer.explore'])
    expect(container.textContent).toContain(dictEn['footer.aboutTappy'])
  })
  it('is mounted on /about, /extension, every hub, the scam index — and, by owner decision (2026-09-19, Option A), on Home', async () => {
    for (const el of [<AboutPage key="a" />, <ExtensionPage key="e" />, <ScamKnowledgeIndexPage key="k" />, await DomainHubPage({ params: { domain: 'food' } })]) {
      const { container } = render(el)
      expect(container.querySelector('[data-testid="public-footer"]')).not.toBeNull()
      cleanup()
    }
    // HOME_FOOTER_DECISION.md: exactly one import and one mount in HomeV3.tsx, below the last
    // section, inside the existing scroll container — nothing in the shell nav, nothing on page.tsx.
    const home = readFileSync('src/app/HomeV3.tsx', 'utf8')
    expect(home.match(/<PublicFooter \/>/g)).toHaveLength(1)
    expect(home).toContain("import PublicFooter from '@/components/discovery/PublicFooter'")
    expect(home).toMatch(/<\/section>\s*<PublicFooter \/>\s*<\/div>\s*<\/V3Shell>/)
    expect(readFileSync('src/app/(app)/(home)/page.tsx', 'utf8')).not.toContain('PublicFooter')
  })
})
