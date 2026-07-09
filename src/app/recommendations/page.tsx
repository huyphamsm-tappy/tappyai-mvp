'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Sparkles, Loader2, MessageCircle } from 'lucide-react'
import { TappyMascot } from '@/components/TappyMascot'

interface Rec {
  placeId: string
  placeName: string
  finalScore: number
  matchedSignals: string[]
}

export default function RecommendationsPage() {
  const router = useRouter()
  const [recs, setRecs] = useState<Rec[]>([])
  const [explanation, setExplanation] = useState<string[]>([])
  const [personalized, setPersonalized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/recommendations')
      .then(async (r) => {
        if (r.status === 401) throw new Error('auth')
        if (!r.ok) throw new Error('load')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setRecs(d.recommendations ?? [])
        setExplanation(d.explanation ?? [])
        setPersonalized(!!d.personalized)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message === 'auth' ? 'Cần đăng nhập để xem gợi ý.' : 'Không tải được gợi ý, thử lại nhé.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
        <div className="max-w-lg mx-auto flex items-center px-4 h-14">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 text-sm font-medium text-primary-500">
            <ChevronLeft size={18} /> Trang chủ
          </button>
          <h1 className="flex-1 text-center font-semibold text-gray-900 dark:text-white pr-16">✨ Gợi ý cho bạn</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Sparkles size={15} className="text-primary-400" />
          {personalized ? 'Cá nhân hóa theo sở thích của bạn' : 'Địa điểm nổi bật gần đây'}
        </p>

        {loading && (
          <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        {!loading && !error && explanation.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {explanation.map((e, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300">{e}</span>
            ))}
          </div>
        )}

        {!loading && !error && recs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-500 dark:text-gray-400">
            <div className="w-14 h-14 rounded-2xl overflow-hidden select-none">
              <TappyMascot pose="recommendation" size={56} animated />
            </div>
            <p className="text-sm">Chưa đủ dữ liệu để gợi ý.</p>
            <p className="text-xs">Dùng Tappy nhiều hơn (chat, lưu địa điểm, review) để Tappy hiểu bạn rõ hơn nhé!</p>
          </div>
        )}

        {!loading && !error && recs.map((r, i) => (
          <div key={r.placeId} className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">{r.placeName || 'Địa điểm'}</p>
                {r.matchedSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.matchedSignals.slice(0, 4).map((s, j) => (
                      <span key={j} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{s}</span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => router.push(`/chat?q=${encodeURIComponent('Kể mình nghe về ' + (r.placeName || 'địa điểm này'))}`)}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400"
                >
                  <MessageCircle size={13} /> Hỏi Tappy về chỗ này
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
