'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Copy, Check, Users, Loader2 } from 'lucide-react'

type Member = {
  id: string
  name: string
  budget: string
  food_preferences: string
  dietary_restrictions: string
  area: string
}

type Group = {
  id: string
  name: string
  creator_id: string
  status: string
  suggestion: string | null
  members: Member[]
}

const BUDGET_OPTIONS = ['Dưới 100k', '100–200k', 'Trên 200k']

export default function GroupPage() {
  const params = useParams()
  const id = params.id as string

  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [copied, setCopied] = useState(false)

  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [foodPrefs, setFoodPrefs] = useState('')
  const [dietary, setDietary] = useState('')
  const [area, setArea] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/group?id=${id}`)
      if (!res.ok) return
      const data = await res.json()
      setGroup(data)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null)
      })
      .finally(() => setAuthChecked(true))

    const joined = localStorage.getItem(`joined_group_${id}`)
    if (joined) setJoinSuccess(true)

    fetchGroup()
  }, [id, fetchGroup])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !budget || !area.trim()) return
    setJoining(true)
    setJoinError('')
    try {
      const res = await fetch(`/api/group/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          budget,
          food_preferences: foodPrefs.trim(),
          dietary_restrictions: dietary.trim(),
          area: area.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setJoinError(err.error || 'Lỗi tham gia nhóm')
        return
      }
      localStorage.setItem(`joined_group_${id}`, 'true')
      setJoinSuccess(true)
      fetchGroup()
    } catch {
      setJoinError('Lỗi kết nối, vui lòng thử lại')
    } finally {
      setJoining(false)
    }
  }

  async function handleSuggest() {
    setSuggesting(true)
    try {
      const res = await fetch(`/api/group/${id}/suggest`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Lỗi gợi ý')
        return
      }
      const data = await res.json()
      setGroup(prev => prev ? { ...prev, suggestion: data.suggestion } : prev)
    } catch {
      alert('Lỗi kết nối, vui lòng thử lại')
    } finally {
      setSuggesting(false)
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/group/${id}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !authChecked) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-3 px-4">
        <div className="text-4xl">😕</div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">Không tìm thấy nhóm này</p>
      </div>
    )
  }

  const isCreator = !!group && !!currentUserId && group.creator_id === currentUserId

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header showBack backHref="/" title={group.name} />
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Group header card */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center shrink-0">
              <Users className="text-white" size={22} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white text-lg">{group.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {group.members.length} thành viên đã tham gia
              </p>
            </div>
          </div>
        </div>

        {/* CREATOR VIEW */}
        {isCreator && (
          <>
            {/* Share link */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Chia sẻ link với nhóm</p>
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                <span className="flex-1 text-sm text-gray-600 dark:text-gray-300 truncate font-mono">
                  {typeof window !== 'undefined' ? `${window.location.origin}/group/${id}` : `tappyai.com/group/${id}`}
                </span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 text-primary-500 font-semibold text-sm shrink-0 transition-all"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Đã sao chép' : 'Sao chép'}
                </button>
              </div>
            </div>

            {/* Member list */}
            {group.members.length > 0 ? (
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Thành viên</p>
                <div className="space-y-3">
                  {group.members.map((m, i) => (
                    <div
                      key={m.id}
                      className={`pb-3 ${i < group.members.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}
                    >
                      <p className="font-semibold text-gray-900 dark:text-white">{m.name}</p>
                      <div className="mt-1 space-y-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {m.budget && <p>💰 {m.budget}</p>}
                        {m.food_preferences && <p>🍽️ Thích: {m.food_preferences}</p>}
                        {m.dietary_restrictions && <p>🚫 Kiêng: {m.dietary_restrictions}</p>}
                        {m.area && <p>📍 Khu vực: {m.area}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Chưa có ai tham gia. Chia sẻ link ở trên nhé!
              </div>
            )}

            {/* Suggest button */}
            {group.members.length > 0 && !group.suggestion && (
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                className="w-full py-3 bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95 shadow-sm"
              >
                {suggesting ? (
                  <><Loader2 size={18} className="animate-spin" /> Tappy đang nghĩ...</>
                ) : (
                  '🍽️ Tappy gợi ý ngay'
                )}
              </button>
            )}
          </>
        )}

        {/* NON-CREATOR: join form */}
        {!isCreator && !joinSuccess && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Điền thông tin của bạn</h2>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tên bạn <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="VD: Minh, Lan, Tú..."
                  maxLength={50}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ngân sách <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {BUDGET_OPTIONS.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBudget(b)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                        budget === b
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Thích ăn gì?</label>
                <input
                  type="text"
                  value={foodPrefs}
                  onChange={e => setFoodPrefs(e.target.value)}
                  placeholder="VD: bún bò, pizza, cơm tấm, lẩu..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kiêng gì không?</label>
                <input
                  type="text"
                  value={dietary}
                  onChange={e => setDietary(e.target.value)}
                  placeholder="VD: không ăn thịt heo, dị ứng hải sản, ăn chay..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Khu vực thuận tiện <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  placeholder="VD: Quận 1, Bình Thạnh, Thủ Đức..."
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              {joinError && <p className="text-sm text-red-500">{joinError}</p>}

              <button
                type="submit"
                disabled={joining || !name.trim() || !budget || !area.trim()}
                className="w-full py-3 bg-primary-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95"
              >
                {joining ? <Loader2 size={18} className="animate-spin" /> : null}
                Tham gia nhóm
              </button>
            </form>
          </div>
        )}

        {/* NON-CREATOR: joined, waiting */}
        {!isCreator && joinSuccess && !group.suggestion && (
          <div className="card p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Đã tham gia!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Chờ trưởng nhóm gợi ý nhé 🎉</p>
          </div>
        )}

        {/* Suggestion result — visible to everyone */}
        {group.suggestion && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🍽️</span>
              <h2 className="font-bold text-gray-900 dark:text-white">Gợi ý của Tappy</h2>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {group.suggestion}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
