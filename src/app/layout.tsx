import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PostHogProvider } from '@/components/PostHogProvider'
import LocationProvider from '@/components/LocationProvider'
import TrackingProvider from '@/components/TrackingProvider'
import LanguagePicker from '@/components/LanguagePicker'
import VersionWatcher from '@/components/VersionWatcher'

export const metadata: Metadata = {
  title: 'TappyAI - Trợ lý AI thuần Việt',
  description: 'Chạm đến mọi dịch vụ – AI Agent cá nhân hóa',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TappyAI',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    title: 'TappyAI - Trợ lý AI thuần Việt',
    description: 'Chạm đến mọi dịch vụ – AI Agent cá nhân hóa cho cuộc sống tại Việt Nam',
  },
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
        <PostHogProvider>{children}</PostHogProvider>
        <LocationProvider />
        <TrackingProvider />
        <LanguagePicker />
        <VersionWatcher />
      </body>
    </html>
  )
}
