'use client'

import { useState, type FormEvent } from 'react'
import { Heart, Briefcase, Coins, HeartPulse, Star, RotateCcw, CalendarDays, BookOpen, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCanChiByYear, getNguHanhByYear, type CanChi } from '@/lib/boi/canChiData'
import { generateFortune, generateYearFortune, type FortunePeriod, type FortuneReading, type YearFortuneReading, YEAR_ANIMALS } from '@/lib/boi/fortuneEngine'
import { LIFETIME_READINGS, type LifetimeReading } from '@/lib/boi/lifetimeData'

type ViewMode = FortunePeriod | 'lifetime' | 'year'

const PERIOD_TABS: { id: FortunePeriod; label: string }[] = [
  { id: 'day', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
]

const VN_YEAR = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCFullYear()
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => VN_YEAR - 5 + i)

export default function TuViForm() {
  const [birthDate, setBirthDate] = useState('')
  const [result, setResult] = useState<{ canChi: CanChi; nguHanh: string; year: number } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedYear, setSelectedYear] = useState<number>(VN_YEAR)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!birthDate) return
    const year = new Date(birthDate).getFullYear()
    if (!year || Number.isNaN(year)) return
    setResult({ canChi: getCanChiByYear(year), nguHanh: getNguHanhByYear(year), year })
    setViewMode('day')
  }

  const handleReset = () => {
    setResult(null)
    setBirthDate('')
  }

  if (!result) {
    return (
      <form onSubmit={handleSubmit} className="card p-6 text-center space-y-5">
        <div className="text-5xl">🧧</div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Xem tử vi 12 con giáp</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nhập ngày sinh (dương lịch) để xem con giáp, tử vi trọn đời và vận hạn từng kỳ.
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
          Xem tử vi của tôi
        </button>
      </form>
    )
  }

  const lifetime = LIFETIME_READINGS[result.canChi.id]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Con giáp header */}
      <div className="card p-6 text-center space-y-2">
        <div className="text-5xl">{result.canChi.emoji}</div>
        <h2 className="font-bold text-gray-900 dark:text-white text-xl">
          Tuổi {result.canChi.nameVi} ({result.canChi.animalVi})
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Sinh năm {result.year} · Ngũ hành: <span className="font-medium text-accent-500">{result.nguHanh}</span>
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pt-1">{result.canChi.traits}</p>
      </div>

      {/* Mode selector */}
      <div className="space-y-2">
        {/* Period tabs */}
        <div className="flex gap-2">
          {PERIOD_TABS.map((p) => (
            <button
              key={p.id}
              onClick={() => setViewMode(p.id)}
              className={cn(
                'flex-1 py-2.5 rounded-2xl text-sm font-medium border-2 transition-all',
                viewMode === p.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          <span>hoặc xem</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        </div>

        {/* Special modes */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setViewMode('lifetime')}
            className={cn(
              'flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium border-2 transition-all',
              viewMode === 'lifetime'
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
                : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400'
            )}
          >
            <BookOpen size={15} />
            Trọn đời
          </button>
          <button
            onClick={() => setViewMode('year')}
            className={cn(
              'flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium border-2 transition-all',
              viewMode === 'year'
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400'
            )}
          >
            <Calendar size={15} />
            Theo năm
          </button>
        </div>
      </div>

      {/* Reading content */}
      {(viewMode === 'day' || viewMode === 'week' || viewMode === 'month') && (
        <PeriodReadingCard reading={generateFortune(result.canChi.id, viewMode, result.canChi.banks)} />
      )}

      {viewMode === 'lifetime' && lifetime && (
        <LifetimeCard lifetime={lifetime} animalVi={result.canChi.animalVi} />
      )}

      {viewMode === 'year' && (
        <YearReadingSection
          canChi={result.canChi}
          birthYear={result.year}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
        />
      )}

      <button onClick={handleReset} className="btn-secondary w-full flex items-center justify-center gap-2">
        <RotateCcw size={16} /> Xem lại với ngày sinh khác
      </button>
    </div>
  )
}

// ---- Period reading (ngày/tuần/tháng) ----

function PeriodReadingCard({ reading }: { reading: FortuneReading }) {
  return (
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
  )
}

// ---- Lifetime reading ----

function LifetimeCard({ lifetime, animalVi }: { lifetime: LifetimeReading; animalVi: string }) {
  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <BookOpen size={16} className="text-violet-500" />
        <p className="font-semibold text-gray-900 dark:text-white">Tử vi trọn đời — Tuổi {animalVi}</p>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic border-l-2 border-violet-300 dark:border-violet-700 pl-3">
        {lifetime.overview}
      </p>

      <div className="space-y-4">
        <LifetimeRow icon={Briefcase} label="Sự nghiệp" text={lifetime.career} color="text-primary-500" />
        <LifetimeRow icon={Heart} label="Tình duyên" text={lifetime.love} color="text-pink-500" />
        <LifetimeRow icon={HeartPulse} label="Sức khỏe" text={lifetime.health} color="text-green-500" />
      </div>

      <div className="rounded-2xl bg-violet-50 dark:bg-violet-900/20 p-4">
        <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-1.5">✨ Lời khuyên trọn đời</p>
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{lifetime.advice}</p>
      </div>
    </div>
  )
}

function LifetimeRow({ icon: Icon, label, text, color }: { icon: typeof Heart; label: string; text: string; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn('w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

// ---- Year reading ----

function YearReadingSection({
  canChi,
  birthYear,
  selectedYear,
  onYearChange,
}: {
  canChi: CanChi
  birthYear: number
  selectedYear: number
  onYearChange: (y: number) => void
}) {
  const reading = generateYearFortune(canChi.id, birthYear, selectedYear) as YearFortuneReading

  return (
    <div className="space-y-3">
      {/* Year picker */}
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-amber-500 flex-shrink-0" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Chọn năm xem vận hạn:</p>
        <select
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="ml-auto text-sm font-semibold text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y} ({YEAR_ANIMALS[((y - 4) % 12 + 12) % 12]})
            </option>
          ))}
        </select>
      </div>

      {/* Compat note */}
      <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 p-3">
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
          {reading.compatLabel !== '—' ? reading.compatLabel : `Tuổi ${canChi.animalVi} — Năm ${reading.yearAnimal}`}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{reading.compatNote}</p>
      </div>

      {/* Year fortune card */}
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
    </div>
  )
}

// ---- Shared row component ----

function FortuneRow({ icon: Icon, label, text, color }: { icon: typeof Heart; label: string; text: string; color: string }) {
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
