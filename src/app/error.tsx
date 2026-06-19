'use client'

import { useEffect } from 'react'
import { RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log lỗi để debug (sau này có thể gửi tới Sentry/LogRocket)
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <span className="text-5xl">😵</span>
        <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
          Ối, có lỗi xảy ra
        </h2>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          TappyAI gặp chút trục trặc. Bạn thử lại nhé, nếu vẫn lỗi thì quay về trang chủ giúp mình.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-all"
          >
            <RefreshCw size={16} /> Thử lại
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Home size={16} /> Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  )
}
