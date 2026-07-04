'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Check, Save, Loader2, X, Plus } from 'lucide-react'

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

const QUICK_PREF_CHIPS = [
  'Ăn chay thứ 6',
  'Ngân sách ăn trưa 60–80k',
  'Thích spa kiểu Nhật',
  'Dị ứng hải sản',
  'Hay đi Quận 3',
  'Không ăn được cay',
  'Hay đi Bình Thạnh',
  'Thích không gian yên tĩnh',
]

type BudgetLevel = 'cheap' | 'mid' | 'high' | null
type Gender = 'male' | 'female' | null

export default function PreferencesPage() {
  const router = useRouter()
  const [budget, setBudget] = useState<BudgetLevel>(null)
  const [cuisines, setCuisines] = useState<string[]>([])
  const [dietary, setDietary] = useState('')
  const [preferences, setPreferences] = useState<string[]>([])
  const [newPref, setNewPref] = useState('')
  const [gender, setGender] = useState<Gender>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      fetch('/api/preferences').then(r => r.json()),
      supabase.auth.getUser(),
    ]).then(([{ preferences: prefs, structured }, { data: { user } }]) => {
      if (structured) {
        setBudget((structured.budget_level as BudgetLevel) || null)
        setCuisines(structured.cuisine_likes || [])
        setDietary(structured.dietary_restrictions || '')
      }
      if (Array.isArray(prefs)) setPreferences(prefs)
      const g = user?.user_metadata?.gender
      if (g === 'male' || g === 'female') setGender(g)
    })
    .catch(() => {})
    .finally(() => setLoading(false))
  }, [])

  const toggleCuisine = useCallback((item: string) => {
    setCuisines(prev =>
      prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]
    )
  }, [])

  const addPref = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || preferences.includes(trimmed) || preferences.length >= 50) return
    setPreferences(prev => [...prev, trimmed])
    setNewPref('')
  }, [preferences])

  const removePref = useCallback((pref: string) => {
    setPreferences(prev => prev.filter(p => p !== pref))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(false)
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget_level: budget, cuisine_likes: cuisines, dietary_restrictions: dietary }),
        }),
        fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferences }),
        }),
      ])
      if (r1.ok && r2.ok) {
        setSaved(true)
        setTimeout(() => { setSaved(false); router.push('/profile') }, 1200)
      } else {
        setSaveError(true)
      }
      // Save gender to user metadata
      if (gender !== null) {
        const supabase = createClient()
        await supabase.auth.updateUser({ data: { gender } })
      }
    } catch { setSaveError(true) }
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

        {/* Freeform preferences — "Tappy nhớ bạn" */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            🧠 Tappy nhớ bạn
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Thêm bất cứ thông tin nào để TappyAI gợi ý sát hơn — khu vực, ngân sách, dị ứng, thói quen...
          </p>

          {/* Quick-add chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_PREF_CHIPS.filter(c => !preferences.includes(c)).map(chip => (
              <button
                key={chip}
                onClick={() => addPref(chip)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
              >
                + {chip}
              </button>
            ))}
          </div>

          {/* Text input */}
          <div className="flex gap-2 mb-3">
            <input
              value={newPref}
              onChange={e => setNewPref(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPref(newPref) } }}
              placeholder="Thêm sở thích của bạn..."
              maxLength={100}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <button
              onClick={() => addPref(newPref)}
              disabled={!newPref.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-primary-600 transition-all"
            >
              <Plus size={15} />
              Thêm
            </button>
          </div>

          {/* Added preferences list */}
          {preferences.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preferences.map(pref => (
                <span
                  key={pref}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-medium"
                >
                  {pref}
                  <button
                    onClick={() => removePref(pref)}
                    className="hover:text-red-500 transition-colors"
                    aria-label={`Xóa ${pref}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {preferences.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Chưa có sở thích nào. Thêm bằng chips bên trên hoặc tự nhập.</p>
          )}
        </section>

        {/* Gender */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            👤 Bạn là
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Giúp Tappy gợi ý câu hỏi phù hợp hơn với bạn
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'female', label: 'Nữ', emoji: '👩' },
              { value: 'male', label: 'Nam', emoji: '👨' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setGender(prev => prev === opt.value ? null : opt.value)}
                className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-3.5 font-semibold text-sm transition-all ${
                  gender === opt.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-gray-200 dark:hover:border-gray-700'
                }`}
              >
                <span className="text-xl">{opt.emoji}</span>
                {opt.label}
                {gender === opt.value && <Check size={14} className="text-primary-500" />}
              </button>
            ))}
          </div>
        </section>

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
                <span className="text-xs text-gray-400 dark:text-gray-500 text-center leading-tight">{opt.desc}</span>
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
          className={`w-full py-4 rounded-2xl font-bold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 ${
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
        {saveError && (
          <p className="text-sm text-red-500 text-center">Không thể lưu sở thích. Vui lòng thử lại.</p>
        )}

      </main>

      <BottomNav />
    </div>
  )
}
