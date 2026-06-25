'use client'

import { useState } from 'react'
import { MapPin, Share2, ExternalLink, ChevronRight } from 'lucide-react'

export interface PlanItem {
  time: string
  emoji: string
  category: 'hotel' | 'food' | 'spa' | 'entertainment' | 'transport' | string
  name: string
  description?: string
  price?: string
  address?: string
  maps_link?: string
  booking_link?: string
  place_id?: string
}

export interface PlanDay {
  label: string
  items: PlanItem[]
}

export interface TappyPlan {
  type: 'trip' | 'evening'
  title: string
  people?: number
  budget_total?: string
  days: PlanDay[]
  cost_breakdown?: Record<string, string>
  share_text?: string
}

const CATEGORY_COLORS: Record<string, string> = {
  hotel:         'bg-blue-50   border-blue-200   dark:bg-blue-900/20   dark:border-blue-800',
  food:          'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
  spa:           'bg-pink-50   border-pink-200   dark:bg-pink-900/20   dark:border-pink-800',
  entertainment: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  transport:     'bg-gray-50   border-gray-200   dark:bg-gray-800/60   dark:border-gray-700',
}

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.transport
}

export default function TripPlanCard({ plan }: { plan: TappyPlan }) {
  const [activeDay, setActiveDay] = useState(0)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')

  const handleShare = async () => {
    const shareText =
      plan.share_text ||
      `${plan.title} — kế hoạch từ TappyAI 🎉 #TappyAI`

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: plan.title, text: shareText })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText)
        setShareState('copied')
        setTimeout(() => setShareState('idle'), 2500)
      }
    } catch {
      // user cancelled
    }
  }

  const currentDay = plan.days[activeDay] ?? plan.days[0]

  return (
    <div className="mt-3 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-primary-500 to-accent-500 px-4 py-3 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-sm leading-snug truncate">{plan.title}</h3>
            {(plan.people || plan.budget_total) && (
              <p className="text-primary-100 text-xs mt-0.5">
                {plan.people && plan.people > 1 ? `${plan.people} người · ` : ''}
                {plan.budget_total}
              </p>
            )}
          </div>
          <button
            onClick={handleShare}
            className="flex-shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95"
          >
            <Share2 size={11} />
            {shareState === 'copied' ? 'Đã copy!' : 'Chia sẻ'}
          </button>
        </div>
      </div>

      {/* ── Day tabs (multi-day trip only) ── */}
      {plan.days.length > 1 && (
        <div className="flex overflow-x-auto border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 scrollbar-none">
          {plan.days.map((day, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 px-4 py-2 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${
                i === activeDay
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="divide-y divide-gray-50 dark:divide-gray-800/80">
        {currentDay?.items.map((item, i) => (
          <div key={i} className="px-3 py-3 flex gap-3">
            {/* Time column */}
            <div className="flex flex-col items-center flex-shrink-0 w-10 pt-0.5">
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono leading-none">
                {item.time || ''}
              </span>
              {i < currentDay.items.length - 1 && (
                <div className="w-px flex-1 mt-1.5 bg-gray-100 dark:bg-gray-800 min-h-4" />
              )}
            </div>

            {/* Card */}
            <div className={`flex-1 rounded-xl border px-3 py-2.5 ${categoryColor(item.category)}`}>
              {/* Name + price */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base leading-none flex-shrink-0">{item.emoji || '📍'}</span>
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-snug">
                    {item.name}
                  </span>
                </div>
                {item.price && (
                  <span className="flex-shrink-0 text-[11px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {item.price}
                  </span>
                )}
              </div>

              {/* Description */}
              {item.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  {item.description}
                </p>
              )}

              {/* Address */}
              {item.address && item.address !== 'Xem bản đồ' && (
                <div className="flex items-center gap-1 mt-1.5">
                  <MapPin size={9} className="text-gray-400 flex-shrink-0" />
                  <span className="text-[11px] text-gray-400 truncate">{item.address}</span>
                </div>
              )}

              {/* Action links */}
              {(item.maps_link || item.booking_link) && (
                <div className="flex items-center gap-3 mt-2">
                  {item.maps_link && (
                    <a
                      href={item.maps_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      <MapPin size={9} />
                      Bản đồ
                    </a>
                  )}
                  {item.booking_link && (
                    <a
                      href={item.booking_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-primary-600 dark:text-primary-400 font-semibold hover:underline transition-colors"
                    >
                      <ExternalLink size={9} />
                      Đặt ngay
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Cost breakdown ── */}
      {plan.cost_breakdown && Object.keys(plan.cost_breakdown).length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 bg-gray-50 dark:bg-gray-800/40">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">💰 Chi phí ước tính</p>
          <div className="space-y-1">
            {Object.entries(plan.cost_breakdown).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center text-xs">
                <span className="text-gray-500 dark:text-gray-400">{k}</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{v}</span>
              </div>
            ))}
          </div>
          {plan.budget_total && (
            <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 flex justify-between items-center">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Tổng ước tính</span>
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{plan.budget_total}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Share footer ── */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
        <button
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 active:scale-[0.98] text-white text-sm font-semibold transition-all"
        >
          {shareState === 'copied' ? (
            '✓ Đã sao chép vào clipboard!'
          ) : (
            <>
              <Share2 size={14} />
              📤 Chia sẻ lịch trình
            </>
          )}
        </button>
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          Chia sẻ lên Zalo, Facebook hoặc gửi cho bạn bè
        </p>
      </div>
    </div>
  )
}
