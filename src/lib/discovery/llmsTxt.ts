// ─────────────────────────────────────────────────────────────────────────────
// /llms.txt — a plain-text map of the public site for AI answer engines.
//
// The llms.txt convention (llmstxt.org): a Markdown file at the site root that
// says what the site is and lists its canonical public pages with one-line
// descriptions. Nothing here is a claim that any engine reads it — it is a
// FREE, deterministic index of pages that already exist, built from the same
// dictionary the pages render from, so it cannot describe a page differently
// from the page itself. Private surfaces are not listed. No model, no fetch.
// ─────────────────────────────────────────────────────────────────────────────

import { BRAND, absoluteUrl } from '@/lib/share/openGraph'
import { HUB_DOMAINS, hubCopy } from '@/lib/discovery/domainHubs'
import { hubText } from '@/lib/i18n/discovery'
import { SCAM_KB_PATH } from '@/lib/scam-shield/knowledgePages'

/** Pages an answer engine may cite. Exactly the crawlable set in sitemap.ts, minus the per-share pages. */
export function llmsTxt(env: NodeJS.ProcessEnv = process.env): string {
  const lines: string[] = [
    `# ${BRAND.name}`,
    '',
    `> ${hubText('en', 'about.description')}`,
    '',
    `${hubText('en', 'about.intro')}`,
    '',
    '## Domains',
    '',
    ...HUB_DOMAINS.map((d) => {
      const copy = hubCopy(d, 'en')
      return `- [${copy.h1}](${absoluteUrl(`/${d}`, env)}): ${copy.description}`
    }),
    '',
    '## Tools',
    '',
    `- [Scam Shield](${absoluteUrl('/scam-shield', env)}): ${hubText('en', 'seo.scamShield.description')}`,
    `- [25 scam scenarios of 2026](${absoluteUrl(SCAM_KB_PATH, env)}): ${hubText('en', 'kb.index.description')}`,
    `- [Browser extension](${absoluteUrl('/extension', env)}): ${hubText('en', 'ext.description')}`,
    '',
    '## About',
    '',
    `- [About TappyAI](${absoluteUrl('/about', env)}): ${hubText('en', 'about.whoBody').replace('{email}', 'support@tappyai.com')}`,
    `- [How to use](${absoluteUrl('/how-to-use', env)})`,
    `- [Privacy policy](${absoluteUrl('/privacy', env)})`,
    `- [Terms of service](${absoluteUrl('/terms', env)})`,
    '',
    '## Optional',
    '',
    `- [Sitemap](${absoluteUrl('/sitemap.xml', env)}): includes the newest public shared results (/r/<slug>), each a frozen question-and-answer page.`,
    '',
  ]
  return lines.join('\n')
}
