import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { bullets, type LegalDoc } from '@/components/legal/legalDoc'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'

// Public account-deletion page, required by Google Play: an app that offers
// in-app account deletion must also document the route on the open web, at a
// URL reachable without signing in. This page *describes* the existing in-app
// flow — it deliberately adds no web deletion path of its own.
//
// Server component so the route keeps its metadata (a 'use client' module
// cannot export `metadata`); the localized body is rendered by LegalDocument,
// which reads the site-wide locale through useTranslation, so the page follows
// the LanguagePicker and shows one language at a time — never both at once.

const PAGE_URL = `${SITE_URL}/delete-account`
const TITLE = 'Delete Your TappyAI Account — TappyAI'
const DESCRIPTION =
  'How to permanently delete your TappyAI account from inside the app, what deleting it removes, and which records may be retained where the law requires it.'

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
  // Must stay indexable: the Play Console listing points reviewers and users here.
  robots: { index: true, follow: true },
}

// Document structure only — every string lives in src/lib/i18n/legal.ts.
const DELETE_ACCOUNT: LegalDoc = {
  titleKey: 'legal.delete.title',
  effectiveKey: 'legal.delete.effective',
  sections: [
    {
      id: 'how-to-delete-your-account',
      headingKey: 'legal.delete.s1.heading',
      blocks: [
        { kind: 'lead', key: 'legal.delete.s1.lead' },
        { kind: 'steps', keys: bullets('legal.delete.s1.step', 4) },
      ],
    },
    {
      id: 'what-deleting-your-account-removes',
      headingKey: 'legal.delete.s2.heading',
      blocks: [
        { kind: 'lead', key: 'legal.delete.s2.lead' },
        { kind: 'bullets', keys: bullets('legal.delete.s2.b', 6) },
      ],
    },
    {
      id: 'data-we-may-retain',
      headingKey: 'legal.delete.s3.heading',
      blocks: [{ kind: 'p', key: 'legal.delete.s3.p1' }],
    },
    {
      id: 'contact',
      headingKey: 'legal.delete.s4.heading',
      blocks: [
        { kind: 'p', key: 'legal.delete.s4.p1' },
        { kind: 'contact' },
      ],
    },
  ],
}

export default function DeleteAccountPage() {
  return <LegalDocument doc={DELETE_ACCOUNT} />
}
