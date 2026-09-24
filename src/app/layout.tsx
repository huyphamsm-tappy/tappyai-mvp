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
import GoogleAnalytics from '@/components/GoogleAnalytics'
import NavHistoryTracker from '@/components/NavHistoryTracker'

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
      <head>
        {/* Browser/aggregator discovery (G1 free acquisition): the OpenSearch description lets
            Firefox/Edge/Safari register "ask Tappy" as an address-bar engine on first visit
            (Chrome keeps it inactive until enabled); the Atom feed lists the newest public
            results for feed readers and crawlers. Both are static text — see browserFeeds.ts. */}
        <link rel="search" type="application/opensearchdescription+xml" title="TappyAI" href="/opensearch.xml" />
        <link rel="alternate" type="application/atom+xml" title="TappyAI" href="/feed.xml" />
      </head>
      <body className="antialiased">
        {/* ── The stored theme, applied BEFORE first paint ──────────────────
            This is not a second theme mechanism. It reads the same
            `localStorage.theme` key that `useThemeMode` owns and sets the same
            `dark` class on <html> that Tailwind's `darkMode: 'class'` keys off;
            the hook stays the authority for every change after this point.

            It exists because the hook can only run in an effect, i.e. after
            hydration. Two consequences, both of which the owner hit:

              - a dark session repaints light for the length of the bundle
                download and then flips, which is the classic theme flash;
              - if hydration never happens at all - a broken bundle, blocked or
                slow JS - the stored choice is silently lost and the toggle is
                inert, which reads as "dark mode is broken".

            Blocking and inline on purpose: it must run before the first paint,
            so it cannot be `next/script` (deferred) or an effect. It is the
            first node in <body>, so it executes before any markup below it is
            painted. <html> already carries `suppressHydrationWarning`, which is
            what lets the class it adds differ from the server's markup without
            a hydration warning.

            The no-stored-value branch mirrors the hook's own fallback: V3 is dark
            unless the person chose Light (`useThemeMode.DEFAULT_IS_DARK`). If it did
            not, a first-time visitor would get the flash this is here to remove. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var s=localStorage.getItem('theme');var d=s!=='light';document.documentElement.classList.toggle('dark',d)}catch(e){document.documentElement.classList.add('dark')}",
          }}
        />
        {/* C29 — attaches the chosen UI language to every request this app makes to its own API.
            First in the tree so its module is evaluated before anything can fetch. */}
        <AppLanguageFetch />
        <PostHogProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </PostHogProvider>
        <LocationProvider />
        {/* GA4 loader — renders nothing unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set (Production
            only). Events reach it through the in-app tracker's mirror, never directly. */}
        <GoogleAnalytics />
        <TrackingProvider />
        <LanguagePicker />
        <HtmlLangSync />
        {/* Per-tab in-app history depth for every Back control (lib/nav/inAppBack). */}
        <NavHistoryTracker />
        <VersionWatcher />
      </body>
    </html>
  )
}
