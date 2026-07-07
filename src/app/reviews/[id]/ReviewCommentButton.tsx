'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Loader2, MessageCircle, X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface CommentProfile { full_name: string | null; avatar_url: string | null }
interface Comment { id: string; body: string; created_at: string; user_id: string; profiles: CommentProfile | null }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày trước`
  return `${Math.floor(days / 30)} tháng trước`
}

export default function ReviewCommentButton({
  reviewId,
  initialCount,
}: {
  reviewId: string
  initialCount: number
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
  }, [])

  const del = async (commentId: string) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments?commentId=${commentId}`, { method: 'DELETE' })
      if (!res.ok) return
      const d = await res.json()
      setComments(prev => prev.filter(c => c.id !== commentId))
      if (typeof d.count === 'number') setCount(d.count)
    } catch { /* leave in place on failure */ }
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/reviews/${reviewId}/comments`)
      .then(r => r.json())
      .then(d => {
        setComments(d.comments || [])
        if (typeof d.count === 'number') setCount(d.count)
      })
      .finally(() => setLoading(false))
  }, [open, reviewId])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setComments(prev => [...prev, data.comment])
        if (typeof data.count === 'number') setCount(data.count)
        setText('')
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        aria-label="Bình luận"
      >
        <MessageCircle size={26} className="text-white" />
        <span className="text-white text-xs font-semibold drop-shadow-md">{count}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[420px] z-50 bg-[#1a1a1a] rounded-t-3xl max-h-[70vh] flex flex-col">
            <div className="flex justify-center py-2 flex-shrink-0">
              <div className="w-8 h-1 bg-gray-600 rounded-full" />
            </div>
            <div className="flex items-center px-4 pb-3 flex-shrink-0">
              <h3 className="font-semibold text-white flex-1">{count} bình luận</h3>
              <button onClick={() => setOpen(false)} aria-label="Đóng">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2 min-h-0">
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={18} className="text-white animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-6">Chưa có bình luận nào</p>
              ) : (
                comments.map(c => {
                  const name = c.profiles?.full_name?.split(' ').pop() || 'Ẩn danh'
                  return (
                    <div key={c.id} className="flex gap-2.5">
                      {c.profiles?.avatar_url ? (
                        <Image src={c.profiles.avatar_url} alt={name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                          {name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white">
                          {name} <span className="text-gray-500 font-normal">{timeAgo(c.created_at)}</span>
                        </p>
                        <p className="text-sm text-gray-300 mt-0.5">{c.body}</p>
                      </div>
                      {c.user_id === me && (
                        <button onClick={() => del(c.id)} aria-label="Xóa bình luận" className="flex-shrink-0 self-start p-1 -mr-1 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Thêm bình luận..."
                maxLength={300}
                className="flex-1 bg-gray-800 text-white placeholder-gray-500 text-sm px-4 py-2 rounded-full focus:outline-none"
              />
              <button onClick={send} disabled={!text.trim() || sending} className="text-pink-500 font-semibold text-sm disabled:opacity-40">
                {sending ? <Loader2 size={16} className="animate-spin" /> : 'Đăng'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
