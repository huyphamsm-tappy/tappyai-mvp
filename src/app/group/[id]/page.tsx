'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Copy, Check, Users, Loader2, Camera } from 'lucide-react'
import { SMART_TOOLS_HREF } from '@/lib/tools/registry'

/** Same ceiling the server enforces (POST /api/group/[id]/avatar), so the page can refuse early. */
const GROUP_AVATAR_MAX_BYTES = 3 * 1024 * 1024

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
  /** The group's own picture (not the creator's avatar); null until the creator sets one. */
  avatar_url?: string | null
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

  // Group avatar (creator only). Mirrors profile/edit's avatar handler: preview while the
  // upload is in flight, the server's URL once it answers, the error otherwise — never a
  // "saved" that did not persist.
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])

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
        setJoinError(err.message || err.error || 'Lỗi tham gia nhóm')
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
        alert(err.message || err.error || 'Lỗi gợi ý')
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

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarError('Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF'); return }
    if (file.size > GROUP_AVATAR_MAX_BYTES) { setAvatarError('Ảnh tối đa 3MB'); return }

    setAvatarError('')
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarUploading(true)
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      const res = await fetch(`/api/group/${id}/avatar`, { method: 'POST', body: formData })
      let data: { avatar_url?: string; message?: string; error?: string } = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (!res.ok || !data.avatar_url) throw new Error(data.message || data.error || 'Không thể tải ảnh lên. Vui lòng thử lại.')
      setGroup(prev => prev ? { ...prev, avatar_url: data.avatar_url! } : prev)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Không thể tải ảnh lên. Vui lòng thử lại.')
    } finally {
      setAvatarPreview(null)
      setAvatarUploading(false)
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
        <Loader2 className="animate-spin text-link" size={32} />
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
      {/* Back pops in-app history (the creator arrives from /group/new, a member from a shared
          link, the creator later from wherever they were); a deep link falls back to /tools.
          A fixed `backHref="/"` sent every Back to Home. */}
      <Header showBack backFallbackHref={SMART_TOOLS_HREF} title={group.name} />
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Group header card — the GROUP's picture, set by the creator; members see it too. */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            {(() => {
              const src = avatarPreview || group.avatar_url || null
              const tile = src ? (
                // eslint-disable-next-line @next/next/no-img-element -- a user-uploaded picture; object-cover in a fixed tile, no pipeline needed
                <img src={src} alt="" className="w-12 h-12 rounded-2xl object-cover shrink-0" data-group-avatar />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center shrink-0" data-group-avatar="placeholder">
                  <Users className="text-white" size={22} />
                </div>
              )
              if (!isCreator) return tile
              return (
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="relative shrink-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-70"
                  aria-label="Đổi ảnh nhóm"
                  data-group-avatar-edit
                >
                  {tile}
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-gray-900 shadow ring-1 ring-gray-200 dark:ring-gray-700 text-gray-700 dark:text-gray-200">
                    {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  </span>
                </button>
              )
            })()}
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white text-lg">{group.name}</h1>
              <p className="text-sm text-content-secondary">
                {group.members.length} thành viên đã tham gia
              </p>
              {isCreator && avatarError && <p className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">{avatarError}</p>}
            </div>
          </div>
          {isCreator && (
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} data-group-avatar-input />
          )}
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
                  className="flex items-center gap-1 text-link font-semibold text-sm shrink-0 transition-all"
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
                      <div className="mt-1 space-y-0.5 text-sm text-content-secondary">
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
              <div className="card p-4 text-center text-sm text-content-secondary">
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
                          ? 'bg-interactive text-white border-primary-500'
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

              {joinError && <p className="text-sm text-red-500 dark:text-red-400">{joinError}</p>}

              <button
                type="submit"
                disabled={joining || !name.trim() || !budget || !area.trim()}
                className="w-full py-3 bg-interactive text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95"
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
            <p className="text-sm text-content-secondary mt-1">Chờ trưởng nhóm gợi ý nhé 🎉</p>
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
