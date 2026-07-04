'use client'

import { useState, useEffect } from 'react'
import { Sparkles, RotateCcw } from 'lucide-react'
import posthog from 'posthog-js'
import { cn } from '@/lib/utils'
import { getRandomCards, TarotCard } from '@/lib/boi/tarotData'

type DrawCount = 1 | 3

interface DrawnCard {
  card: TarotCard
  reversed: boolean
}

const THREE_CARD_LABELS = ['Quá khứ', 'Hiện tại', 'Tương lai']

export default function TarotDraw() {
  const [count, setCount] = useState<DrawCount>(1)
  const [drawn, setDrawn] = useState<DrawnCard[] | null>(null)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    posthog.capture('boi_feature_opened', { feature: 'tarot' })
  }, [])

  const handleDraw = () => {
    posthog.capture('boi_reading_generated', { feature: 'tarot', card_count: count })
    setRevealing(true)
    setDrawn(null)
    window.setTimeout(() => {
      setDrawn(getRandomCards(count))
      setRevealing(false)
    }, 650)
  }

  const handleReset = () => {
    setDrawn(null)
  }

  return (
    <div className="space-y-6">
      {!drawn && (
        <div className="card p-6 text-center space-y-5">
          <div className="text-5xl">🔮</div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Rút bài Tarot</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tĩnh tâm một chút, nghĩ về câu hỏi của bạn rồi chọn số lá muốn rút.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setCount(1)}
              className={cn(
                'px-5 py-2.5 rounded-2xl border-2 text-sm font-medium transition-all',
                count === 1
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300'
              )}
            >
              1 lá · Thông điệp hôm nay
            </button>
            <button
              onClick={() => setCount(3)}
              className={cn(
                'px-5 py-2.5 rounded-2xl border-2 text-sm font-medium transition-all',
                count === 3
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300'
              )}
            >
              3 lá · Quá khứ - Hiện tại - Tương lai
            </button>
          </div>

          <button
            onClick={handleDraw}
            disabled={revealing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {revealing ? (
              <>
                <Sparkles size={18} className="animate-pulse" /> Đang xáo bài...
              </>
            ) : (
              <>
                <Sparkles size={18} /> Rút bài ngay
              </>
            )}
          </button>
        </div>
      )}

      {drawn && (
        <div className="space-y-4 animate-fade-in">
          <div className={cn('grid gap-4', drawn.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3')}>
            {drawn.map((d, i) => (
              <div key={d.card.id} className="card p-5 text-center space-y-3">
                {drawn.length === 3 && (
                  <p className="text-xs font-semibold text-accent-500 uppercase tracking-wide">
                    {THREE_CARD_LABELS[i]}
                  </p>
                )}
                <div className={cn('text-5xl transition-transform', d.reversed && 'inline-block rotate-180')}>
                  {d.card.emoji}
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{d.card.nameVi}</p>
                  <span
                    className={cn(
                      'inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full',
                      d.reversed
                        ? 'bg-red-50 dark:bg-red-950/30 text-red-500'
                        : 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    )}
                  >
                    {d.reversed ? 'Ngược (Reversed)' : 'Xuôi (Upright)'}
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {(d.reversed ? d.card.keywordsReversed : d.card.keywordsUpright).map((kw) => (
                    <span
                      key={kw}
                      className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed text-left">
                  {d.reversed ? d.card.meaningReversed : d.card.meaningUpright}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <RotateCcw size={16} /> Rút lại
          </button>
        </div>
      )}
    </div>
  )
}
