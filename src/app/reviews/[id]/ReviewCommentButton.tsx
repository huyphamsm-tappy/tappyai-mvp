'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Loader2, MessageCircle, X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface CommentProfile { full_name: string | null; avatar_url: string | null }
interface Comment {
  id: string
  body: string
  created_at: string
  user_id: string
  parent_comment_id: string | null
  profiles: CommentProfile | null
  reactions: Record<string, number>
  my_reaction: string | null
}

// Reaction keys must mirror the web's ALLOWED set (src/app/api/comments/[commentId]/reactions).
const COMMENT_REACTIONS: { key: string; emoji: string }[] = [
  { key: 'like', emoji: '👍' },
  { key: 'love', emoji: '❤️' },
  { key: 'haha', emoji: '😂' },
  { key: 'wow', emoji: '😮' },
  { key: 'sad', emoji: '😢' },
  { key: 'angry', emoji: '😡' },
]
const reactionEmoji = (key: string) => COMMENT_REACTIONS.find(r => r.key === key)?.emoji || '👍'

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
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
  }, [])

  const loadComments = useCallback(() => {
    setLoading(true)
    return fetch(`/api/reviews/${reviewId}/comments`)
      .then(r => r.json())
      .then(d => {
        setComments(d.comments || [])
        if (typeof d.count === 'number') setCount(d.count)
      })
      .finally(() => setLoading(false))
  }, [reviewId])

  useEffect(() => {
    if (!open) return
    loadComments()
  }, [open, loadComments])

  const del = async (commentId: string) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments?commentId=${commentId}`, { method: 'DELETE' })
      if (!res.ok) return
      const d = await res.json()
      // A deleted parent cascades to its replies in the DB — mirror that locally.
      setComments(prev => prev.filter(c => c.id !== commentId && c.parent_comment_id !== commentId))
      if (typeof d.count === 'number') setCount(d.count)
    } catch { /* leave in place on failure */ }
  }

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    // One-level threading: a reply to a reply attaches to the same top-level thread.
    const parentId = replyTo ? (replyTo.parent_comment_id ?? replyTo.id) : null
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim(), parentId }),
      })
      const data = await res.json()
      if (res.ok) {
        setComments(prev => [...prev, data.comment])
        if (typeof data.count === 'number') setCount(data.count)
        setText('')
        setReplyTo(null)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } finally {
      setSending(false)
    }
  }

  // One reaction per user: changing shifts it; tapping the current one removes it.
  const react = async (commentId: string, key: string) => {
    setPickerFor(null)
    const target = comments.find(c => c.id === commentId)
    if (!target) return
    const removing = target.my_reaction === key
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c
      const reactions = { ...c.reactions }
      if (c.my_reaction) reactions[c.my_reaction] = (reactions[c.my_reaction] || 0) - 1
      if (!removing) reactions[key] = (reactions[key] || 0) + 1
      Object.keys(reactions).forEach(k => { if (reactions[k] <= 0) delete reactions[k] })
      return { ...c, reactions, my_reaction: removing ? null : key }
    }))
    try {
      const res = removing
        ? await fetch(`/api/comments/${commentId}/reactions`, { method: 'DELETE' })
        : await fetch(`/api/comments/${commentId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction: key }) })
      if (!res.ok) throw new Error('react_failed')
    } catch {
      loadComments()
    }
  }

  const startReply = (c: Comment) => { setReplyTo(c); setPickerFor(null); setTimeout(() => inputRef.current?.focus(), 50) }
  const replyName = (c: Comment) => c.profiles?.full_name?.split(' ').pop() || 'Ẩn danh'

  const renderComment = (c: Comment, isReply: boolean) => {
    const name = replyName(c)
    const total = Object.values(c.reactions || {}).reduce((a, b) => a + b, 0)
    const shown = Object.keys(c.reactions || {}).filter(k => c.reactions[k] > 0)
    const av = isReply ? 26 : 32
    return (
      <div key={c.id} className={`flex gap-2.5 ${isReply ? 'ml-10 mt-3' : ''}`}>
        {c.profiles?.avatar_url ? (
          <Image src={c.profiles.avatar_url} alt={name} width={av} height={av} className="rounded-full object-cover flex-shrink-0" style={{ width: av, height: av }} />
        ) : (
          <div className="rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ width: av, height: av }}>
            {name[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">
            {name} <span className="text-gray-500 font-normal">{timeAgo(c.created_at)}</span>
          </p>
          <p className="text-sm text-gray-300 mt-0.5 break-words">{c.body}</p>
          <div className="flex items-center gap-3 mt-1 relative">
            <button onClick={() => setPickerFor(pickerFor === c.id ? null : c.id)}
              className={`text-xs font-medium transition-colors ${c.my_reaction ? 'text-pink-400' : 'text-gray-500 hover:text-pink-300'}`}>
              {c.my_reaction ? reactionEmoji(c.my_reaction) + ' Cảm xúc' : 'Cảm xúc'}
            </button>
            <button onClick={() => startReply(c)} className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">Trả lời</button>
            {total > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                {shown.slice(0, 3).map(k => <span key={k}>{reactionEmoji(k)}</span>)}
                <span className="ml-0.5">{total}</span>
              </span>
            )}
            {pickerFor === c.id && (
              <div className="absolute -top-9 left-0 z-10 flex gap-1 bg-[#2a2a2a] rounded-full px-2 py-1.5 shadow-lg border border-gray-700">
                {COMMENT_REACTIONS.map(r => (
                  <button key={r.key} onClick={() => react(c.id, r.key)}
                    className={`text-lg leading-none hover:scale-125 transition-transform ${c.my_reaction === r.key ? 'scale-125' : ''}`}>{r.emoji}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {c.user_id === me && (
          <button onClick={() => del(c.id)} aria-label="Xóa bình luận" className="flex-shrink-0 self-start p-1 -mr-1 text-gray-500 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    )
  }

  const topLevel = comments.filter(c => !c.parent_comment_id)
  const repliesByParent = comments.reduce((acc, c) => {
    if (c.parent_comment_id) (acc[c.parent_comment_id] = acc[c.parent_comment_id] || []).push(c)
    return acc
  }, {} as Record<string, Comment[]>)

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
            <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2 min-h-0" onClick={() => pickerFor && setPickerFor(null)}>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={18} className="text-white animate-spin" />
                </div>
              ) : topLevel.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-6">Chưa có bình luận nào</p>
              ) : (
                topLevel.map(c => (
                  <div key={c.id}>
                    {renderComment(c, false)}
                    {(repliesByParent[c.id] || []).map(rep => renderComment(rep, true))}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
            {replyTo && (
              <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 bg-[#222]">
                <span className="text-xs text-gray-400 truncate">Đang trả lời {replyName(replyTo)}</span>
                <button onClick={() => setReplyTo(null)} className="text-xs text-gray-500 hover:text-gray-300 flex-shrink-0 ml-2">Huỷ</button>
              </div>
            )}
            <div className="flex gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={replyTo ? `Đang trả lời ${replyName(replyTo)}` : 'Thêm bình luận...'}
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
