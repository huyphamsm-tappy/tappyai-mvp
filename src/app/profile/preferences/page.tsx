'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Check, Save, Loader2 } from 'lucide-react'

const BUDGET_OPTIONS = [
  { value: 'cheap', label: 'Tiết kiệm', desc: 'Dưới 150k/người', emoji: '💚' },
  { value: 'mid',   label: 'Trung bình', desc: '150k–500k/người', emoji: '💛' },
  { value: 'high',  label: 'Cao cấp',   desc: '500k+/người',      emoji: '❤️' },
] as const

const CUISINE_OPTIONS = [
  'Phở & Bún', 'Cơm tấm', 'Lẩu', 'Nướng BBQ', 'Hải sản',
  'Chay & Thuần chay', 'Sushi & Nhật', 'Hàn Quốc', 'Pizza & Burger',
  'Dimsum & Trung Hoa', 'Cà phê & Bánh', 'Món miền Bắc', 'Món miền Nam',
  'Đồ ăn nhanh', 'Kem & Tráng miệng',
]

type BudgetLevel = 'cheap' | 'mid' | 'high' | null

export default function PreferencesPage() {
  const router = useRouter()
  const [budget, setBudget] = useState<BudgetLevel>(null)
  const [cuisines, setCuisines] = useState<string[]>([])
  const [dietary, setDietary] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.json())
      .then(({ preferences }) => {
        if (preferences) {
          setBudget((preferences.budget_level as BudgetLevel) || null)
          setCuisines(preferences.cuisine_likes || [])
          setDietary(preferences.dietary_restrictions || '')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleCuisine = useCallback((item: string) => {
    setCuisines(prev =>
      prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]
    )
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_level: budget, cuisine_likes: cuisines, dietary_restrictions: dietary }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => { setSaved(false); router.push('/profile') }, 1200)
      }
    } catch { /* network error */ }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header title="Sở thích của tôi" showBack backHref="/profile" />

      <main className="max-w-lg mx-auto px-4 py-5 space-y-6">

        {/* Info banner */}
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/40 rounded-2xl px-4 py-3">
          <p className="text-sm text-primary-700 dark:text-primary-300">
            ✨ TappyAI dùng thông tin này để gợi ý phù hợp hơn với bạn.
          </p>
        </div>

        {/* Budget */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            💰 Ngân sách ăn uống thường ngày
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {BUDGET_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setBudget(prev => prev === opt.value ? null : opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-4 transition-all ${
                  budget === opt.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700'
                }`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className={`text-sm font-semibold ${budget === opt.value ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'}`}>
                  {opt.label}
                </span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 text-center leading-tight">{opt.desc}</span>
                {budget === opt.value && (
                  <Check size={14} className="text-primary-500 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Cuisine */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            🍜 Ẩm thực yêu thích
          </h3>
          <div className="flex flex-wrap gap-2">
            {CUISINE_OPTIONS.map(item => (
              <button
                key={item}
                onClick={() => toggleCuisine(item)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  cuisines.includes(item)
                    ? 'border-primary-500 bg-primary-500 text-white'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-primary-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {/* Dietary restrictions */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1.5">
            🚫 Dị ứng / kiêng cữ
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Ví dụ: không ăn thịt heo, dị ứng hải sản, thuần chay...
          </p>
          <textarea
            value={dietary}
            onChange={e => setDietary(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Ghi chú nếu có..."
            className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </section>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`w-full py-4 rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2 ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-primary-500 hover:bg-primary-600 active:scale-[0.98] text-white disabled:opacity-60'
          }`}
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin" /> Đang lưu...</>
          ) : saved ? (
            <><Check size={18} /> Đã lưu!</>
          ) : (
            <><Save size={18} /> Lưu sở thích</>
          )}
        </button>

      </main>

      <BottomNav />
    </div>
  )
}
