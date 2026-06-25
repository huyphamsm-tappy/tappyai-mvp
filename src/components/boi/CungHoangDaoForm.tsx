'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { Heart, Briefcase, Coins, HeartPulse, Star, RotateCcw, CalendarDays } from 'lucide-react'
import posthog from 'posthog-js'
import { cn } from '@/lib/utils'
import { getZodiacByDate, ZodiacSign } from '@/lib/boi/zodiacData'
import { generateFortune, FortunePeriod } from '@/lib/boi/fortuneEngine'

const PERIODS: { id: FortunePeriod; label: string }[] = [
  { id: 'day', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
]

export default function CungHoangDaoForm() {
  const [birthDate, setBirthDate] = useState('')
  const [sign, setSign] = useState<ZodiacSign | null>(null)
  const [period, setPeriod] = useState<FortunePeriod>('day')

  useEffect(() => {
    posthog.capture('boi_feature_opened', { feature: 'cung-hoang-dao' })
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!birthDate) return
    const d = new Date(birthDate)
    if (Number.isNaN(d.getTime())) return
    posthog.capture('boi_reading_generated', { feature: 'cung-hoang-dao' })
    setSign(getZodiacByDate(d.getMonth() + 1, d.getDate()))
    setPeriod('day')
  }

  const handleReset = () => {
    setSign(null)
    setBirthDate('')
  }

  if (!sign) {
    return (
      <form onSubmit={handleSubmit} className="card p-6 text-center space-y-5">
        <div className="text-5xl">✨</div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Tra cứu cung hoàng đạo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nhập ngày sinh (dương lịch) để xem cung hoàng đạo và vận may của bạn.
          </p>
        </div>

        <div className="relative">
          <CalendarDays size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="date"
            required
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          Xem cung của tôi
        </button>
      </form>
    )
  }

  const reading = generateFortune(sign.id, period, sign.banks)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-6 text-center space-y-2">
        <div className="text-5xl">{sign.emoji}</div>
        <h2 className="font-bold text-gray-900 dark:text-white text-xl">{sign.nameVi}</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {sign.dateRangeLabel} · {sign.element} · Cai quản: {sign.ruling}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pt-1">{sign.traits}</p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={cn(
              'flex-1 py-2.5 rounded-2xl text-sm font-medium border-2 transition-all',
              period === p.id
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Reading */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900 dark:text-white">{reading.periodLabel}</p>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={14}
                className={i < reading.score ? 'text-accent-500 fill-accent-500' : 'text-gray-200 dark:text-gray-700'}
              />
            ))}
          </div>
        </div>

        <FortuneRow icon={Heart} label="Tình duyên" text={reading.love} color="text-pink-500" />
        <FortuneRow icon={Briefcase} label="Công việc" text={reading.career} color="text-primary-500" />
        <FortuneRow icon={Coins} label="Tài lộc" text={reading.money} color="text-accent-500" />
        <FortuneRow icon={HeartPulse} label="Sức khỏe" text={reading.health} color="text-green-500" />

        <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-800 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Số may mắn: <span className="font-semibold text-gray-900 dark:text-white">{reading.luckyNumber}</span>
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            Màu hợp: <span className="font-semibold text-gray-900 dark:text-white">{reading.luckyColor}</span>
          </span>
        </div>
      </div>

      <button onClick={handleReset} className="btn-secondary w-full flex items-center justify-center gap-2">
        <RotateCcw size={16} /> Xem lại với ngày sinh khác
      </button>
    </div>
  )
}

function FortuneRow({
  icon: Icon,
  label,
  text,
  color,
}: {
  icon: typeof Heart
  label: string
  text: string
  color: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn('w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}
