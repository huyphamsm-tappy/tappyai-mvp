'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Trash2, EyeOff, Eye, Loader2, Grid3X3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/i18n/useTranslation'
import LinkPoster from '@/components/LinkPoster'

interface Review {
  id: string; place_name: string; body: string; photos: string[] | null
  rating: number; is_hidden: boolean; like_count: number; comment_count: number; created_at: string
  content_type: string | null; thumbnail: string | null; source_type: string | null
  /**
   * Present only on the author's own feed, and only when the safety gate wrote a
   * lifecycle state. The wording is already localized by the server, so this
   * renders it rather than mapping a code to a string here — which also keeps
   * the reason out of the client, where it could be read to work out what to
   * change to get past the gate.
   */
  moderation?: {
    state: 'UNDER_REVIEW' | 'PUBLISHED' | 'RESTRICTED'
    title: string
    detail: string
    assertsViolation: boolean
  } | null
}

export default function MyPostsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const { locale } = useTranslation()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // `?lang=` because this is the author's OWN feed, so the response carries the
      // moderation notice for any post the safety gate held — and the server words that
      // notice from the request language. Without it the server falls back to
      // Accept-Language, which is the BROWSER's locale, not the one the user picked in
      // the app: an English user on a Vietnamese browser was told in Vietnamese why their
      // post was not public. Same reason the composer already sends it.
      const res = await fetch(`/api/reviews/feed?userId=${user.id}&limit=50&lang=${encodeURIComponent(locale)}`)
      const data = await res.json()
      // Also get hidden posts
      const { data: hidden } = await supabase.from('reviews').select('id,place_name,body,photos,rating,is_hidden,like_count,comment_count,created_at,content_type,thumbnail,source_type').eq('user_id', user.id).eq('is_hidden', true).order('created_at', { ascending: false })
      const all = [...(data.reviews || []).map((r: Review) => ({ ...r, is_hidden: false })), ...(hidden || [])]
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setReviews(all)
      setLoading(false)
    }
    load()
    // `locale` is a dependency, not incidental: switching language must re-fetch, or the
    // moderation notice keeps the wording it was first loaded with while the rest of the
    // page changes language around it.
  }, [supabase, router, locale])

  const handleDelete = async (id: string) => {
    if (!confirm('Xoá bài viết này?')) return
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' })
    if (res.ok) setReviews(prev => prev.filter(r => r.id !== id))
    setSelected(null)
  }

  const handleToggleHide = async (id: string, currentHidden: boolean) => {
    const res = await fetch(`/api/reviews/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_hidden: !currentHidden }),
    })
    if (res.ok) setReviews(prev => prev.map(r => r.id === id ? { ...r, is_hidden: !currentHidden } : r))
    setSelected(null)
  }

  if (loading) return <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center"><Loader2 size={24} className="text-link animate-spin" /></div>

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link href="/profile" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-white flex-1">Bài viết của tôi</h1>
        <span className="text-sm text-gray-400">{reviews.length} bài</span>
      </div>

      {reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Grid3X3 size={48} className="mb-4 opacity-30" />
          <p className="text-sm">Bạn chưa có bài viết nào</p>
          <Link href="/reviews/new" className="mt-4 bg-interactive text-white px-5 py-2 rounded-full text-sm font-semibold">Đăng bài đầu tiên</Link>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Grid */}
          <div className="grid grid-cols-3 gap-1">
            {reviews.map(r => {
              return (
                <button key={r.id} onClick={() => setSelected(selected === r.id ? null : r.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 ${selected === r.id ? 'ring-2 ring-primary-500' : ''}`}>
                  {/* Shared poster: photo → thumbnail → platform placeholder. Never blank. */}
                  <LinkPoster review={r} />
                  {r.is_hidden && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <EyeOff size={20} className="text-white" />
                    </div>
                  )}
                  {/* Not published. The post is still here and still theirs — it
                      simply is not public — so it is marked, never hidden. */}
                  {r.moderation?.state === 'RESTRICTED' && !r.is_hidden && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                      <AlertTriangle size={20} className="text-amber-300" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 flex items-center gap-1">
                    <span className="text-white text-xs drop-shadow">❤️ {r.like_count}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Action panel for selected post */}
      {selected && (() => {
        const r = reviews.find(x => x.id === selected)!
        return (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setSelected(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-4 pb-8 max-w-2xl mx-auto shadow-2xl">
              <div className="flex justify-center mb-4"><div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" /></div>
              {/* Why this post is not public. Server-worded, already localized,
                  and deliberately the same panel the author acts from — the
                  explanation belongs next to the delete button, not somewhere
                  they have to go looking for it. */}
              {r.moderation?.state === 'RESTRICTED' && (
                <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{r.moderation.title}</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">{r.moderation.detail}</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Preview */}
              <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                {r.photos?.[0]
                  ? <Image src={r.photos[0]} alt="" width={56} height={56} className="rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.place_name}</p>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{r.body || 'Bài ảnh'}</p>
                  <p className="text-xs text-gray-400 mt-1">{r.is_hidden ? '🔒 Đang ẩn' : '👁 Đang hiện'} · ❤️ {r.like_count} · 💬 {r.comment_count}</p>
                </div>
              </div>
              <div className="space-y-2">
                <button onClick={() => handleToggleHide(r.id, r.is_hidden)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium">
                  {r.is_hidden ? <Eye size={18} className="text-green-500" /> : <EyeOff size={18} className="text-orange-500" />}
                  {r.is_hidden ? 'Hiện bài này' : 'Ẩn bài này'}
                </button>
                <button onClick={() => handleDelete(r.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors text-sm font-medium">
                  <Trash2 size={18} />
                  Xoá bài này
                </button>
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
