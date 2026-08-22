'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { useEffect, useState } from 'react'
import { Bell, BellOff, Trash2, RefreshCw, TrendingDown, ShoppingBag } from 'lucide-react'
import Link from 'next/link'

type Watch = {
  id: string
  product_name: string
  target_price: number
  current_price: number | null
  status: 'active' | 'triggered' | 'cancelled'
  last_checked: string | null
  notified_at: string | null
  created_at: string
}

// C15 — the million suffix and the "not checked yet" text are words, so they come from the
// dictionary; both helpers take them as parameters rather than owning a language.
function fmtVND(n: number, million: string) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + million
  return (n / 1000).toFixed(0) + 'k'
}

function fmtDate(s: string | null, locale: string, neverChecked: string) {
  if (!s) return neverChecked
  const d = new Date(s)
  return d.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PriceWatchesPage() {
  const { t, locale } = useTranslation()
  const fmtVNDLocalized = (n: number) => fmtVND(n, t('watch.million'))
  const fmtDateLocalized = (s: string | null) => fmtDate(s, locale, t('watch.neverChecked'))
  const [watches, setWatches] = useState<Watch[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchWatches = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/price-watch')
      if (res.ok) {
        const data = await res.json()
        setWatches(data.watches ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWatches() }, [])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch('/api/price-watch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setWatches(w => w.filter(x => x.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const active = watches.filter(w => w.status === 'active')
  const triggered = watches.filter(w => w.status === 'triggered')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            ←
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('watch.title')}</h1>
            <p className="text-sm text-content-secondary">{t('watch.subtitle')}</p>
          </div>
          <button
            onClick={fetchWatches}
            disabled={loading}
            className="ml-auto p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            aria-label={t('watch.refreshAria')}
          >
            <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* How to add */}
        <div className="card p-4 mb-5 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <p className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">{t('watch.howHeading')}</p>
          <p className="text-xs text-primary-600 dark:text-primary-400 leading-relaxed">
            {t('watch.howBody')} <span className="font-mono bg-white/60 dark:bg-black/20 px-1.5 py-0.5 rounded">{t('watch.howExample')}</span>
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            <ShoppingBag size={12} />
            {t('watch.chatCta')}
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : watches.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-600">
            <TrendingDown size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">{t('watch.empty')}</p>
            <p className="text-sm mt-1">{t('watch.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active watches */}
            {active.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Bell size={11} /> {t('watch.activeHeading', { n: String(active.length) })}
                </p>
                <div className="space-y-2">
                  {active.map(w => (
                    <div key={w.id} className="card p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <TrendingDown size={16} className="text-link" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{w.product_name}</p>
                        <p className="text-xs text-content-secondary mt-0.5">
                          {t('watch.target')} <span className="font-semibold text-primary-600 dark:text-primary-400">{fmtVNDLocalized(w.target_price)}</span>
                          {w.current_price && (
                            <span className="ml-2 text-gray-400">{t('watch.current', { price: fmtVNDLocalized(w.current_price) })}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {w.last_checked
                            ? t('watch.lastChecked', { date: fmtDateLocalized(w.last_checked) })
                            : t('watch.pendingCheck')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(w.id)}
                        disabled={deleting === w.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                        aria-label={t('watch.cancelAria')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Triggered watches */}
            {triggered.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BellOff size={11} /> {t('watch.notifiedHeading', { n: String(triggered.length) })}
                </p>
                <div className="space-y-2">
                  {triggered.map(w => (
                    <div key={w.id} className="card p-4 flex items-start gap-3 opacity-60">
                      <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-base">✅</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{w.product_name}</p>
                        <p className="text-xs text-content-secondary mt-0.5">
                          {t('watch.droppedTo')} <span className="font-semibold text-green-600">{w.current_price ? fmtVNDLocalized(w.current_price) : fmtVNDLocalized(w.target_price)}</span>
                        </p>
                        {w.notified_at && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {t('watch.notifiedAt', { date: fmtDateLocalized(w.notified_at) })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
