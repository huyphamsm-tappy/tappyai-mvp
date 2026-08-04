import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { bullets, type LegalDoc } from '@/components/legal/legalDoc'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'

// Public Privacy Policy — the URL published to the Google Play Console, so it
// must stay reachable without auth. The page itself is a server component so it
// keeps route metadata (a 'use client' module cannot export `metadata`); the
// localized body is rendered by LegalDocument, which reads the site-wide locale
// through useTranslation so this page follows the LanguagePicker like every
// other screen instead of carrying its own switcher.

const PAGE_URL = `${SITE_URL}/privacy`
const TITLE = 'Privacy Policy — TappyAI'
const DESCRIPTION =
  'How TappyAI collects, uses, stores, and protects your information, including Google account data, conversation history, personalization, usage analytics, and the third-party providers we rely on.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    siteName: 'TappyAI',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}${OG_IMAGE}` }],
    locale: 'en_US',
    alternateLocale: ['vi_VN'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}${OG_IMAGE}`],
  },
  robots: { index: true, follow: true },
}

// Document structure only — every string lives in src/lib/i18n/legal.ts, so the
// English and Vietnamese editions share one shape by construction.
const PRIVACY: LegalDoc = {
  titleKey: 'legal.privacy.title',
  effectiveKey: 'legal.privacy.effective',
  sections: [
    {
      id: 'information-we-collect',
      headingKey: 'legal.privacy.s1.heading',
      blocks: [
        { kind: 'lead', key: 'legal.privacy.s1.lead' },
        { kind: 'bullets', keys: bullets('legal.privacy.s1.b', 8) },
        { kind: 'note', key: 'legal.privacy.s1.note' },
      ],
    },
    {
      id: 'how-we-use-your-information',
      headingKey: 'legal.privacy.s2.heading',
      blocks: [
        { kind: 'lead', key: 'legal.privacy.s2.lead' },
        { kind: 'bullets', keys: bullets('legal.privacy.s2.b', 7) },
        { kind: 'note', key: 'legal.privacy.s2.note' },
      ],
    },
    {
      id: 'third-party-services',
      headingKey: 'legal.privacy.s3.heading',
      blocks: [
        { kind: 'lead', key: 'legal.privacy.s3.lead' },
        { kind: 'bullets', keys: bullets('legal.privacy.s3.b', 7) },
        { kind: 'p', key: 'legal.privacy.s3.p1' },
        { kind: 'p', key: 'legal.privacy.s3.p2' },
      ],
    },
    {
      id: 'data-storage-and-security',
      headingKey: 'legal.privacy.s4.heading',
      blocks: [
        { kind: 'p', key: 'legal.privacy.s4.p1' },
        { kind: 'p', key: 'legal.privacy.s4.p2' },
      ],
    },
    {
      id: 'your-rights',
      headingKey: 'legal.privacy.s5.heading',
      blocks: [
        { kind: 'lead', key: 'legal.privacy.s5.lead' },
        { kind: 'bullets', keys: bullets('legal.privacy.s5.b', 3) },
      ],
    },
    {
      id: 'changes-to-this-policy',
      headingKey: 'legal.privacy.s6.heading',
      blocks: [
        { kind: 'p', key: 'legal.privacy.s6.p1' },
        { kind: 'p', key: 'legal.privacy.s6.p2' },
      ],
    },
    {
      id: 'contact',
      headingKey: 'legal.privacy.s7.heading',
      blocks: [{ kind: 'contact' }],
    },
  ],
}

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} />
}
