'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, EyeOff, Eye, Loader2, Grid3X3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Review {
  id: string; place_name: string; body: string; photos: string[] | null
  rating: number; is_hidden: boolean; like_count: number; comment_count: number; created_at: string
}

export default function MyPostsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const res = await fetch(`/api/reviews/feed?userId=${user.id}&limit=50`)
      const data = await res.json()
      // Also get hidden posts
      const { data: hidden } = await supabase.from('reviews').select('id,place_name,body,photos,rating,is_hidden,like_count,comment_count,created_at').eq('user_id', user.id).eq('is_hidden', true).order('created_at', { ascending: false })
      const all = [...(data.reviews || []).map((r: Review) => ({ ...r, is_hidden: false })), ...(hidden || [])]
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setReviews(all)
      setLoading(false)
    }
    load()
  }, [supabase, router])

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

  if (loading) return <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center"><Loader2 size={24} className="text-primary-500 animate-spin" /></div>

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
          <Link href="/reviews/new" className="mt-4 bg-primary-500 text-white px-5 py-2 rounded-full text-sm font-semibold">Đăng bài đầu tiên</Link>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Grid */}
          <div className="grid grid-cols-3 gap-1">
            {reviews.map(r => {
              const thumb = r.photos?.[0]
              return (
                <button key={r.id} onClick={() => setSelected(selected === r.id ? null : r.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 ${selected === r.id ? 'ring-2 ring-primary-500' : ''}`}>
                  {thumb
                    ? <Image src={thumb} alt="" fill className="object-cover" sizes="33vw" />
                    : <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                        <p className="text-white text-xs p-2 line-clamp-3 text-center">{r.body || '...'}</p>
                      </div>}
                  {r.is_hidden && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <EyeOff size={20} className="text-white" />
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
