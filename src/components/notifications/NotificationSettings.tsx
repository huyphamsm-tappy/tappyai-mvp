'use client'

import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function NotificationSettings() {
  const { permission, subscribed, loading, error, subscribe, unsubscribe } = usePushNotifications()
  const { t } = useTranslation()

  if (permission === 'unsupported') {
    return (
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <BellOff size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('notifications.unsupported.title')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('notifications.unsupported.desc')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <BellOff size={20} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('notifications.denied.title')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('notifications.denied.descBefore')}{' '}
              <strong>{t('notifications.denied.descPath')}</strong> {t('notifications.denied.descAfter')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Main toggle card */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center flex-shrink-0">
              <Bell size={18} className="text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('notifications.push.title')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {subscribed ? t('notifications.push.on') : t('notifications.push.off')}
              </p>
            </div>
          </div>

          <button
            onClick={subscribed ? unsubscribe : subscribe}
            disabled={loading}
            className={`
              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${subscribed ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-700'}
            `}
            role="switch"
            aria-checked={subscribed}
            aria-label={t('notifications.push.toggleAria')}
          >
            {loading ? (
              <Loader2 size={14} className="absolute inset-0 m-auto animate-spin text-white" />
            ) : (
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                  transition duration-200 ease-in-out
                  ${subscribed ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            )}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* What you&apos;ll receive */}
      {subscribed && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
            {t('notifications.receive.heading')}
          </p>
          <ul className="space-y-2">
            {[
              { emoji: '🌅', text: t('notifications.receive.morningBrief') },
              { emoji: '🛍️', text: t('notifications.receive.deals') },
              { emoji: '🍜', text: t('notifications.receive.lunch') },
              { emoji: '📅', text: t('notifications.receive.booking') },
              { emoji: '📊', text: t('notifications.receive.weekly') },
            ].map(item => (
              <li key={item.emoji} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-base leading-none">{item.emoji}</span>
                {item.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            {t('notifications.receive.soundNote')}
          </p>
        </div>
      )}
    </div>
  )
}
