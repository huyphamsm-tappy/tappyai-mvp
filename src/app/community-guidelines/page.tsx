import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { bullets, type LegalDoc } from '@/components/legal/legalDoc'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'
import { RULE_GROUP_IDS } from '@/lib/safety/communityRules'
import PublishedGuidelines from '@/components/legal/PublishedGuidelines'
import { communityGuidelinesConfig, publishedGuidelines } from '@/lib/legal/communityGuidelinesConfig'

/**
 * Community Guidelines (owner 01/10) — the written rules every moderation decision is made against. Public, no sign-in.
 * Document structure only: every string lives in src/lib/i18n/communityGuidelines.ts (merged into legal.ts) and the numbers
 * (severity, penalties, expiry, the ladder) come from src/lib/safety/communityRules.ts, the same table the reviewers' desk uses.
 * DRAFT wording: the effective line says so until the product owner approves the text.
 */

const PAGE_URL = `${SITE_URL}/community-guidelines`
const TITLE = 'Community Guidelines — TappyAI'
const DESCRIPTION = 'The rules for posts, comments, profiles and messages on TappyAI: how reports are reviewed, the penalties, and how to appeal.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: { type: 'website', url: PAGE_URL, siteName: 'TappyAI', title: TITLE, description: DESCRIPTION, images: [{ url: `${SITE_URL}${OG_IMAGE}` }], locale: 'en_US', alternateLocale: ['vi_VN'] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}${OG_IMAGE}`] },
  robots: { index: true, follow: true },
}

const DOC: LegalDoc = {
  titleKey: 'legal.community.title',
  effectiveKey: 'legal.community.effective',
  sections: [
    { id: 'why', headingKey: 'legal.community.intro.heading', blocks: [{ kind: 'p', key: 'legal.community.intro.p1' }] },
    {
      id: 'reports', headingKey: 'legal.community.reports.heading',
      blocks: [{ kind: 'lead', key: 'legal.community.reports.lead' }, { kind: 'bullets', keys: bullets('legal.community.reports.b', 5) }, { kind: 'note', key: 'legal.community.reports.note' }],
    },
    { id: 'public-interest', headingKey: 'legal.community.exceptions.heading', blocks: [{ kind: 'p', key: 'legal.community.exceptions.p1' }] },
    { id: 'rules', headingKey: 'legal.community.rules.heading', blocks: [{ kind: 'p', key: 'legal.community.rules.p1' }] },
    ...RULE_GROUP_IDS.map((id) => ({
      id: `rule-${id.replace(/_/g, '-')}`,
      headingKey: `legal.community.r.${id}.heading`,
      blocks: [
        { kind: 'lead' as const, key: `legal.community.r.${id}.lead` },
        { kind: 'bullets' as const, keys: bullets(`legal.community.r.${id}.b`, 3) },
        { kind: 'note' as const, key: `legal.community.r.${id}.note` },
      ],
    })),
    {
      id: 'penalties', headingKey: 'legal.community.ladder.heading',
      blocks: [{ kind: 'lead', key: 'legal.community.ladder.lead' }, { kind: 'steps', keys: bullets('legal.community.ladder.b', 4) }, { kind: 'note', key: 'legal.community.ladder.note' }],
    },
    { id: 'appeals', headingKey: 'legal.community.appeal.heading', blocks: [{ kind: 'p', key: 'legal.community.appeal.p1' }] },
    { id: 'contact', headingKey: 'legal.community.contact.heading', blocks: [{ kind: 'p', key: 'legal.community.contact.p1' }, { kind: 'contact' }] },
  ],
}

// Phase 7 CP6: the canonical published document once the three legal facts are configured (never a placeholder); until then the
// current page stays. Read per request so the owner's env change takes effect on the next deploy without code changes.
export const dynamic = 'force-dynamic'

export default function CommunityGuidelinesPage() {
  const facts = communityGuidelinesConfig()
  if (facts) {
    const doc = publishedGuidelines(facts)
    return <PublishedGuidelines meta={doc.meta} sections={doc.sections} />
  }
  return <LegalDocument doc={DOC} />
}
