'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Check, Crown, ArrowLeft } from 'lucide-react'
import StripeCheckoutButton from '@/components/StripeCheckoutButton'
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton'
import { useTranslation } from '@/lib/i18n/useTranslation'

// B07 — the paywall used to be rendered entirely by the server component next door, with its copy
// written into the JSX in Vietnamese. The locale authority (`useTranslation`) is client-side, so a
// server component CANNOT know which language the user picked: an English session was served
// Vietnamese with no code path that could have done otherwise.
//
// So the split here is the fix, not a refactor: the server component keeps auth, the subscription
// row and the message count — everything that needs a session — and hands the presentation to this
// client component, which can read the chosen locale.

type Props = {
  userInfo: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  isPro: boolean
  periodEnd: string | null
  remaining: number
  freeDailyLimit: number
}

export default function SubscriptionView({ userInfo, isPro, periodEnd, remaining, freeDailyLimit }: Props) {
  const { t, locale } = useTranslation()

  const freeFeatures = [
    t('sub.free.messages', { count: String(freeDailyLimit) }),
    t('sub.free.search'),
    t('sub.free.history'),
  ]

  const proFeatures = [
    t('sub.pro.messages'),
    t('sub.pro.search'),
    t('sub.pro.history'),
    t('sub.pro.voice'),
    t('sub.pro.memory'),
    t('sub.pro.priority'),
  ]

  const renewDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')
    : '--/--/----'

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title={t('sub.pageTitle')} />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* Hero */}
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
            <Crown size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">TappyAI Pro</h1>
          <p className="text-content-secondary text-sm mt-1">
            {t('sub.hero.subtitle')}
          </p>
        </div>

        {/* Current status */}
        {isPro ? (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-amber-500" />
              <span className="font-semibold text-amber-700 dark:text-amber-400 text-sm">{t('sub.active')}</span>
            </div>
            <p className="text-amber-600 dark:text-amber-500 text-xs mt-1">
              {t('sub.renews', { date: renewDate })}
            </p>
            <ManageSubscriptionButton />
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
            <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">
              {t('sub.freeRemaining.before')}<strong>{remaining} / {freeDailyLimit}</strong>{t('sub.freeRemaining.after')}
            </p>
          </div>
        )}

        {/* Pricing cards */}
        <div className="space-y-4">

          {/* Free */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">{t('sub.free.name')}</h2>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{t('sub.free.tagline')}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-gray-900 dark:text-white">{t('sub.free.price')}</span>
                <p className="text-gray-400 text-xs">{t('sub.perMonth')}</p>
              </div>
            </div>
            <ul className="space-y-2 mb-4">
              {freeFeatures.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <Check size={14} className="text-gray-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-center text-sm font-medium text-gray-400 dark:text-gray-500">
              {t('sub.currentPlan')}
            </div>
          </div>

          {/* Pro */}
          <div className="bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl p-5 shadow-lg shadow-primary-500/20 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Crown size={14} className="text-amber-300" />
                    <h2 className="font-bold text-white">{t('sub.pro.name')}</h2>
                  </div>
                  <p className="text-white/70 text-xs">{t('sub.pro.tagline')}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-white">99K</span>
                  <p className="text-white/70 text-xs">{t('sub.perMonth')}</p>
                </div>
              </div>
              <ul className="space-y-2 mb-5">
                {proFeatures.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white">
                    <Check size={14} className="text-green-300 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {isPro ? (
                <div className="w-full py-3.5 rounded-xl bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-2">
                  <Crown size={16} />
                  {t('sub.onPro')}
                </div>
              ) : (
                <StripeCheckoutButton />
              )}
            </div>
          </div>

        </div>

        {/* FAQ */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 space-y-4 text-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('sub.faq.title')}</h3>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{t('sub.faq.payment.q')}</p>
            <p className="text-content-secondary text-xs mt-0.5">{t('sub.faq.payment.a')}</p>
          </div>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{t('sub.faq.cancel.q')}</p>
            <p className="text-content-secondary text-xs mt-0.5">{t('sub.faq.cancel.a')}</p>
          </div>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{t('sub.faq.reset.q')}</p>
            <p className="text-content-secondary text-xs mt-0.5">{t('sub.faq.reset.a')}</p>
          </div>
        </div>

        <Link href="/profile" className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <ArrowLeft size={14} />
          {t('sub.backToProfile')}
        </Link>
      </main>

      <BottomNav />
    </div>
  )
}
