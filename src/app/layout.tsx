import type { Metadata, Viewport } from 'next'
import './globals.css'
import { buildSiteMetadata } from '@/lib/share/openGraph'
import { PostHogProvider } from '@/components/PostHogProvider'
import { NotificationProvider } from '@/components/NotificationProvider'
import LocationProvider from '@/components/LocationProvider'
import TrackingProvider from '@/components/TrackingProvider'
import LanguagePicker from '@/components/LanguagePicker'
import VersionWatcher from '@/components/VersionWatcher'

// og:image / og:url / og:site_name / twitter:* all come from buildSiteMetadata.
// They were absent before, which is why a pasted TappyAI link rendered as bare
// text with no branding in Zalo, Facebook and Messenger.
const share = buildSiteMetadata('vi')

export const metadata: Metadata = {
  ...share,
  manifest: '/manifest.json',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="antialiased">
        <PostHogProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </PostHogProvider>
        <LocationProvider />
        <TrackingProvider />
        <LanguagePicker />
        <VersionWatcher />
      </body>
    </html>
  )
}
