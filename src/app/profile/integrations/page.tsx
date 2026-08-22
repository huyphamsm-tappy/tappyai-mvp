'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ArrowLeft, CheckCircle, AlertCircle, Loader2, Unlink, ExternalLink } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Suspense } from 'react'

interface Integration {
  provider: string
  connected: boolean
  metadata?: {
    email?: string
    name?: string
    picture?: string
  }
  connected_at?: string
}

const INTEGRATION_INFO: Record<string, {
  name: string
  descriptionKey: string
  whatTappyGetsKey: string
  icon: string
  color: string
}> = {
  google_calendar: {
    name: 'Google Calendar',
    descriptionKey: 'integrations.calendar.description',
    whatTappyGetsKey: 'integrations.calendar.gets',
    icon: '📅',
    color: 'bg-blue-50 dark:bg-blue-950/30',
  },
  zalo: {
    name: 'Zalo',
    descriptionKey: 'integrations.zalo.description',
    whatTappyGetsKey: 'integrations.zalo.gets',
    icon: '💬',
    color: 'bg-blue-50 dark:bg-blue-950/30',
  },
}

function ToastMessage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const error = searchParams.get('error')

  if (!success && !error) return null

  const messages: Record<string, string> = {
    google_calendar: t('integrations.connected.calendar'),
    zalo: t('integrations.connected.zalo'),
  }
  const errorMessages: Record<string, string> = {
    google_denied: t('integrations.denied.google'),
    google_failed: t('integrations.failed.google'),
    zalo_denied: t('integrations.denied.zalo'),
    zalo_failed: t('integrations.failed.zalo'),
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm">
        <CheckCircle size={16} />
        {messages[success] || t('integrations.connected.generic')}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
      <AlertCircle size={16} />
      {errorMessages[error!] || t('integrations.failed.generic')}
    </div>
  )
}

function IntegrationCard({ info, integration }: {
  info: typeof INTEGRATION_INFO[string]
  integration?: Integration
}) {
  const { t } = useTranslation()
  const connected = integration?.connected ?? false
  const meta = integration?.metadata

  return (
    <div className={`card p-4 ${info.color}`}>
      <div className="flex items-start gap-3">
        <div className="text-3xl">{info.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">{info.name}</h3>
            {connected && (
              <span className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle size={10} />
                {t('integrations.connectedBadge')}
              </span>
            )}
          </div>
          <p className="text-xs text-content-secondary mt-0.5">{t(info.descriptionKey)}</p>

          {connected && meta && (
            <div className="flex items-center gap-2 mt-2">
              {meta.picture && (
                <Image src={meta.picture} alt="" width={20} height={20} className="rounded-full" />
              )}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {meta.email || meta.name}
              </span>
            </div>
          )}

          <div className="mt-2 p-2 bg-white/50 dark:bg-gray-900/50 rounded-lg">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-0.5">{t('integrations.onlyReads')}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t(info.whatTappyGetsKey)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {connected ? (
          <>
            <a
              href={`/api/integrations/${integration!.provider}?action=disconnect`}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 border border-red-200 dark:border-red-800 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Unlink size={12} />
              {t('integrations.disconnect')}
            </a>
          </>
        ) : (
          <a
            href={`/api/integrations/${integration?.provider ?? info.name.toLowerCase().replace(' ', '_')}`}
            className="flex items-center gap-1.5 text-xs bg-interactive hover:bg-interactive-hover text-white px-3 py-1.5 rounded-xl transition-colors font-medium"
          >
            <ExternalLink size={12} />
            {t('integrations.connect')}
          </a>
        )}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const { t } = useTranslation()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/integrations')
      .then(r => r.json())
      .then(d => setIntegrations(d.integrations || []))
      .finally(() => setLoading(false))
  }, [])

  const getIntegration = (provider: string): Integration | undefined =>
    integrations.find(i => i.provider === provider && i.connected)
      ?? integrations.find(i => i.provider === provider)
      ?? undefined

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header />

      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/profile" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 dark:text-white">{t('integrations.title')}</h1>
            <p className="text-xs text-gray-500">{t('integrations.subtitle')}</p>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Suspense>
          <ToastMessage />
        </Suspense>

        {/* Privacy note */}
        <div className="flex gap-2 bg-indigo-50 dark:bg-indigo-950/30 p-3 rounded-xl text-xs text-indigo-700 dark:text-indigo-300">
          <span className="flex-shrink-0 mt-0.5">🔒</span>
          <span>{t('integrations.privacy')}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-link animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(INTEGRATION_INFO).map(([provider, info]) => (
              <IntegrationCard
                key={provider}
                info={info}
                integration={getIntegration(provider) ?? { provider, connected: false }}
              />
            ))}
          </div>
        )}

        {/* What Tappy does with this data */}
        <div className="card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('integrations.usageHeading')}</h3>
          <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
            <li className="flex gap-2"><span>📅</span>{t('integrations.usage.calendar')}</li>
            <li className="flex gap-2"><span>💬</span>{t('integrations.usage.zalo')}</li>
            <li className="flex gap-2"><span>📊</span>{t('integrations.usage.behaviour')}</li>
          </ul>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
