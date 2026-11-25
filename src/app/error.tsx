'use client'

import { useEffect } from 'react'
import { RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useTranslation()
  useEffect(() => {
    // Log lỗi để debug (sau này có thể gửi tới Sentry/LogRocket)
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <span className="text-5xl">😵</span>
        <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
          {t('shell.errorTitle')}
        </h2>
        <p className="mt-1.5 text-sm text-content-secondary">
          {t('shell.errorBody')}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-interactive hover:bg-interactive-hover text-white text-sm font-medium transition-all"
          >
            <RefreshCw size={16} /> {t('shell.retry')}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Home size={16} /> {t('shell.goHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}
