import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'
import { HOW_TO_USE_DOC } from './howToUseDoc'

// Feature usage guidance. Server component so the route keeps its metadata,
// exactly like /terms and /privacy; the localized body is rendered by
// LegalDocument, which reads the site-wide locale through useTranslation, so
// this page follows the language picker with no per-page wiring.
//
// Reusing the legal renderer rather than building a help subsystem is
// deliberate: this page needs a title, headed sections, prose, unordered lists
// and NUMBERED steps, and that renderer already does all five with the right
// semantics (`steps` emits a real <ol>, which is what a screen reader needs to
// announce "step 2 of 4"). A second renderer would only duplicate it and drift.

const PAGE_URL = `${SITE_URL}/how-to-use`
const TITLE = 'How to use TappyAI'
const DESCRIPTION =
  'What each part of TappyAI does, how to use it, and what to expect — including when a link or a rating simply is not available.'

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
    images: [`${SITE_URL}${OG_IMAGE}`],
  },
  robots: { index: true, follow: true },
}

export default function HowToUsePage() {
  return <LegalDocument doc={HOW_TO_USE_DOC} />
}
