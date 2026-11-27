import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'
import { CONNECTOR_DOC } from './connectorDoc'

// Public setup guide of the TappyAI connector for AI assistants (Claude, ChatGPT, Cursor). The page the connector directory listing points to: it must stay reachable without auth. Same pattern as /support and
// /privacy: a server component that keeps route metadata, with the localized body rendered by LegalDocument (which follows the site-wide LanguagePicker).

const PAGE_URL = `${SITE_URL}/connector`
const TITLE = 'Connect TappyAI to Claude, ChatGPT and other AI assistants — TappyAI'
const DESCRIPTION =
  'How to connect the TappyAI connector to Claude, ChatGPT or Cursor: the server address, sign-in, the read-only tools (places, restaurants, hotels, shopping, scam link check, deals, public clips, coach booking page) and what data it uses.'

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

export default function ConnectorPage() {
  return <LegalDocument doc={CONNECTOR_DOC} />
}
