import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { type LegalDoc } from '@/components/legal/legalDoc'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'

// Public Terms of Service. Server component so the route keeps its metadata
// (a 'use client' module cannot export `metadata`); the localized body is
// rendered by LegalDocument, which reads the site-wide locale through
// useTranslation, so this page follows the LanguagePicker like every other
// screen. Previously this route had no metadata at all and existed only in
// Vietnamese.

const PAGE_URL = `${SITE_URL}/terms`
const TITLE = 'Terms of Service — TappyAI'
const DESCRIPTION =
  'The terms that apply when you use TappyAI, covering your account, the reference nature of AI-provided information, acceptable use, and how these terms change.'

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

// Document structure only — every string lives in src/lib/i18n/legal.ts.
const TERMS: LegalDoc = {
  titleKey: 'legal.terms.title',
  effectiveKey: 'legal.terms.effective',
  sections: [
    {
      id: 'introduction',
      headingKey: 'legal.terms.s1.heading',
      blocks: [{ kind: 'p', key: 'legal.terms.s1.p1' }],
    },
    {
      id: 'your-account',
      headingKey: 'legal.terms.s2.heading',
      blocks: [{ kind: 'p', key: 'legal.terms.s2.p1' }],
    },
    {
      id: 'information-provided-by-the-ai',
      headingKey: 'legal.terms.s3.heading',
      blocks: [{ kind: 'p', key: 'legal.terms.s3.p1' }],
    },
    {
      id: 'acceptable-use',
      headingKey: 'legal.terms.s4.heading',
      blocks: [{ kind: 'p', key: 'legal.terms.s4.p1' }],
    },
    {
      id: 'changes-to-these-terms',
      headingKey: 'legal.terms.s5.heading',
      blocks: [{ kind: 'p', key: 'legal.terms.s5.p1' }],
    },
    {
      id: 'contact',
      headingKey: 'legal.terms.s6.heading',
      blocks: [{ kind: 'contact' }],
    },
  ],
}

export default function TermsPage() {
  return <LegalDocument doc={TERMS} />
}
