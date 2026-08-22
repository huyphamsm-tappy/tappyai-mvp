import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { bullets, type LegalDoc } from '@/components/legal/legalDoc'
import { COPYRIGHT_AGENT_EMAIL, OG_IMAGE, SITE_URL } from '@/components/landing/config'

/**
 * Music copyright / notice-and-takedown policy for Original Sound.
 *
 * ============================================================================
 * WHY THIS WAS REBUILT — U04
 * ============================================================================
 * This route used to be a hand-written page with the whole policy hardcoded in Vietnamese, and no
 * connection to the localization system at all. Measured in a real browser with the app set to
 * English: `<html lang="en">`, the tab title "Music Copyright Policy — TappyAI", an English "Back"
 * control — and **197 of 237 words of the body in Vietnamese**.
 *
 * 🚨 The English chrome is what made it dangerous rather than merely untranslated. The page looked
 * localized, so nothing about it invited a second look. And of all the pages to leave in one
 * language, this is the notice-and-takedown policy: the terms a user accepts by uploading an
 * Original Sound, and the instructions a rights holder is told to follow.
 *
 * It now uses the same `LegalDocument` renderer as /privacy, /terms and /delete-account, so it
 * follows the LanguagePicker like every other screen and the two editions cannot drift apart
 * structurally — the page holds the document's SHAPE and `src/lib/i18n/legal.ts` holds every
 * string.
 *
 * The copyright agent address is deliberately NOT the `contact` block: that renders the general
 * support address, and a takedown notice sent to support is a notice in the wrong queue.
 */

const PAGE_URL = `${SITE_URL}/copyright`
const TITLE = 'Music Copyright Policy — TappyAI'
const DESCRIPTION =
  'How music uploaded to TappyAI as Original Sound is licensed, who is responsible for it, and how a rights holder sends a takedown notice.'

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
const COPYRIGHT: LegalDoc = {
  titleKey: 'legal.copyright.title',
  effectiveKey: 'legal.copyright.effective',
  sections: [
    {
      id: 'conditions-for-uploading-music',
      headingKey: 'legal.copyright.s1.heading',
      blocks: [{ kind: 'p', key: 'legal.copyright.s1.p1' }],
    },
    {
      id: 'responsibility',
      headingKey: 'legal.copyright.s2.heading',
      blocks: [{ kind: 'p', key: 'legal.copyright.s2.p1' }],
    },
    {
      id: 'reporting-infringement',
      headingKey: 'legal.copyright.s3.heading',
      blocks: [
        { kind: 'p', key: 'legal.copyright.s3.p1' },
        { kind: 'lead', key: 'legal.copyright.s3.lead' },
        { kind: 'bullets', keys: bullets('legal.copyright.s3.b', 3) },
        { kind: 'note', key: 'legal.copyright.s3.note' },
      ],
    },
    {
      id: 'copyright-agent',
      headingKey: 'legal.copyright.s4.heading',
      blocks: [
        { kind: 'p', key: 'legal.copyright.s4.p1' },
        { kind: 'email', labelKey: 'legal.copyright.agent', address: COPYRIGHT_AGENT_EMAIL },
      ],
    },
    {
      id: 'repeat-infringement',
      headingKey: 'legal.copyright.s5.heading',
      blocks: [{ kind: 'p', key: 'legal.copyright.s5.p1' }],
    },
  ],
}

export default function CopyrightPolicyPage() {
  return <LegalDocument doc={COPYRIGHT} />
}
