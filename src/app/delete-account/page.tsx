import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { OG_IMAGE, SITE_URL } from '@/components/landing/config'
import { selfDeleteEnabled } from '@/lib/account/selfDelete'
import { deleteAccountDoc } from './deleteAccountDoc'

// Public account-deletion page, required by Google Play and linked from the App Store listing:
// an app that lets people create an account must document how to delete it on the open web, at
// a URL reachable without signing in.
//
// It describes the deletion routes that actually exist, chosen by the same switch the API reads
// (`ACCOUNT_SELF_DELETE_ENABLED`, see deleteAccountDoc.ts):
//   - always: the REQUEST route Android and iOS ship — Settings → "Request account deletion"
//     opens a prefilled email to support (SettingsScreen.kt, SettingsView.swift). An earlier
//     revision of this page claimed immediate in-app deletion, which did not match the apps —
//     Play compares the two (accountDeletionParity.test.ts);
//   - only when the switch is on: the self-service route on the website
//     (/profile/settings/delete-account → POST /api/account/delete).
//
// Rendered per request, not at build time: the switch is an environment variable read at request
// time by the API and by /profile/settings/delete-account, and a page baked with the other value
// would publish a route that does not exist (or hide one that does).
//
// Server component so the route keeps its metadata (a 'use client' module cannot export
// `metadata`); the localized body is rendered by LegalDocument, which reads the site-wide locale
// through useTranslation, so the page follows the LanguagePicker and shows one language at a time.

export const dynamic = 'force-dynamic'

const PAGE_URL = `${SITE_URL}/delete-account`
const TITLE = 'Delete Your TappyAI Account — TappyAI'
const DESCRIPTION =
  'How to delete your TappyAI account — yourself where available, or by sending a request from the app — what deletion removes, and which records may be retained where the law requires it.'

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
  // Must stay indexable: the Play Console and App Store listings point reviewers here.
  robots: { index: true, follow: true },
}

export default function DeleteAccountPage() {
  return <LegalDocument doc={deleteAccountDoc(selfDeleteEnabled())} />
}
