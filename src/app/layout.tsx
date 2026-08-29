import type { Metadata, Viewport } from 'next'
import './globals.css'
import { buildSiteMetadata } from '@/lib/share/openGraph'
import { PostHogProvider } from '@/components/PostHogProvider'
import { NotificationProvider } from '@/components/NotificationProvider'
import LocationProvider from '@/components/LocationProvider'
import TrackingProvider from '@/components/TrackingProvider'
import LanguagePicker from '@/components/LanguagePicker'
import HtmlLangSync from '@/components/HtmlLangSync'
import AppLanguageFetch from '@/components/AppLanguageFetch'
import VersionWatcher from '@/components/VersionWatcher'

// og:image / og:url / og:site_name / twitter:* all come from buildSiteMetadata.
// They were absent before, which is why a pasted TappyAI link rendered as bare
// text with no branding in Zalo, Facebook and Messenger.
const share = buildSiteMetadata('vi')

export const metadata: Metadata = {
  ...share,
  manifest: '/manifest.json',
  // Official TappyAI app icon (public/branding/otter-logo.png) as the favicon /
  // shortcut / apple-touch-icon, so Chrome shows the brand icon instead of the
  // generated "T" letter tile. Reuses the existing asset — no new image.
  icons: {
    icon: '/branding/otter-logo.png',
    shortcut: '/branding/otter-logo.png',
    apple: '/branding/otter-logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TappyAI',
  },
  formatDetection: { telephone: false },
  other: {
    'zalo-platform-site-verification': 'HVAV9eNi1G9wpOnV_lesVJptXKFGWLyTDZWq',
  },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#030712' }],
}

// `lang="vi"` below is the SSR value, not the session's language, and that is deliberate: this
// app resolves the locale on the client (localStorage → the `useTranslation` module store), so
// server-rendered markup is Vietnamese for everyone and the attribute describes it truthfully.
// <HtmlLangSync> reconciles it the moment the text reconciles, so an English session ends up with
// lang="en" over English text. Do NOT change this to a per-request value without also moving the
// dictionary lookup to the server — see HtmlLangSync for why that is a bigger change than it
// looks, and for why a per-request read here would opt every route out of static rendering.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="antialiased">
        {/* C29 — attaches the chosen UI language to every request this app makes to its own API.
            First in the tree so its module is evaluated before anything can fetch. */}
        <AppLanguageFetch />
        <PostHogProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </PostHogProvider>
        <LocationProvider />
        <TrackingProvider />
        <LanguagePicker />
        <HtmlLangSync />
        <VersionWatcher />
      </body>
    </html>
  )
}
