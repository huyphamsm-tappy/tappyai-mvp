'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Heart, MessageCircle, Bookmark, Share2, Music2,
  ChevronLeft, ChevronRight, MoreVertical, Trash2, EyeOff, Eye,
  X, Send, Loader2, Home, Search, Plus, Bell, User, Grid3X3, ArrowLeft
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/tracking/tracker'

/* ─── types ─── */
interface Profile { full_name: string | null; avatar_url: string | null }
interface Comment { id: string; body: string; created_at: string; user_id: string; profiles: Profile | null }
interface Review {
  id: string; user_id: string; place_name: string; place_address: string | null
  rating: number; body: string; photos: string[] | null
  like_count: number; comment_count: number; created_at: string
  liked_by_me: boolean; saved_by_me: boolean; profiles: Profile | null
}

interface Notification { id: string; type: string; actor_id: string; actor_name: string; actor_avatar: string | null; text: string; url: string; created_at: string }
interface HotPlace { place_name: string; count: number }
interface GroupedNotif {
  id: string; type: string; url: string
  actors: { name: string; avatar: string | null; id: string }[]
  text: string; comment_body?: string
  created_at: string; count: number
}
const NOTIF_COLOR: Record<string, string> = {
  like: '#ff6b35', follow: '#1D9E75', profile_view: '#534AB7', comment: '#378ADD',
}
function groupNotifs(notifs: Notification[]): GroupedNotif[] {
  const map = new Map<string, GroupedNotif>()
  for (const n of notifs) {
    const key = n.type === 'like' ? `like:${n.url}` : n.type === 'profile_view' ? 'profile_view' : n.id
    const existing = map.get(key)
    if (existing) {
      if (!existing.actors.find(a => a.id === n.actor_id))
        existing.actors.push({ name: n.actor_name, avatar: n.actor_avatar, id: n.actor_id })
      existing.count++
      if (new Date(n.created_at) > new Date(existing.created_at)) existing.created_at = n.created_at
    } else {
      map.set(key, {
        id: n.id, type: n.type, url: n.url,
        actors: [{ name: n.actor_name, avatar: n.actor_avatar, id: n.actor_id }],
        text: n.text, comment_body: n.type === 'comment' ? n.text : undefined,
        created_at: n.created_at, count: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
function notifSection(created_at: string): string {
  const ms = Date.now() - new Date(created_at).getTime()
  if (ms < 60 * 60 * 1000) return 'VỪA XONG'
  if (ms < 24 * 60 * 60 * 1000) return 'HÔM NAY'
  return 'TUẦN NÀY'
}

function ago(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return m + 'p'
  if (m < 1440) return Math.floor(m / 60) + 'g'
  return Math.floor(m / 1440) + 'n'
}

/* ─── Photo carousel ─── */
function Carousel({ photos }: { photos: string[] }) {
  const [i, setI] = useState(0)
  const sx = useRef(0)
  return (
    <div className="absolute inset-0 select-none"
      onTouchStart={e => { sx.current = e.touches[0].clientX }}
      onTouchEnd={e => { const dx = sx.current - e.changedTouches[0].clientX; if (dx > 40) setI(p => Math.min(photos.length - 1, p + 1)); else if (dx < -40) setI(p => Math.max(0, p - 1)) }}>
      <Image src={photos[i]} alt="" fill className="object-cover" sizes="100vw" priority={i === 0} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      {photos.length > 1 && <>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {photos.map((_, j) => <div key={j} className={`h-0.5 rounded-full transition-all ${j === i ? 'w-6 bg-white' : 'w-3 bg-white/40'}`} />)}
        </div>
        {i > 0 && <button onClick={() => setI(p => p - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center"><ChevronLeft size={16} className="text-white" /></button>}
        {i < photos.length - 1 && <button onClick={() => setI(p => p + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center"><ChevronRight size={16} className="text-white" /></button>}
        <span className="absolute top-3 right-3 text-white text-xs bg-black/40 px-1.5 py-0.5 rounded-full z-10">{i + 1}/{photos.length}</span>
      </>}
    </div>
  )
}

/* ─── Comment drawer ─── */
function CommentDrawer({ review, onClose, onAdded }: { review: Review; onClose: () => void; onAdded: (id: string) => void }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fetch(`/api/reviews/${review.id}/comments`).then(r => r.json()).then(d => setComments(d.comments || [])).finally(() => setLoading(false))
  }, [review.id])
  const send = async () => {
    if (!text.trim() || sending) return; setSending(true)
    const res = await fetch(`/api/reviews/${review.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text.trim() }) })
    const d = await res.json()
    if (res.ok) { setComments(p => [...p, d.comment]); setText(''); onAdded(review.id); setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth' }), 100) }
    setSending(false)
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-50 bg-[#1a1a1a] rounded-t-3xl max-h-[60vh] flex flex-col">
        <div className="flex justify-center py-2 flex-shrink-0"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
        <div className="flex items-center px-4 pb-3 flex-shrink-0">
          <h3 className="font-semibold text-white flex-1">{review.comment_count} bình luận</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2 min-h-0">
          {loading ? <div className="flex justify-center py-6"><Loader2 size={18} className="text-white animate-spin" /></div>
            : comments.length === 0 ? <p className="text-center text-gray-500 text-sm py-6">Chưa có bình luận nào</p>
            : comments.map(c => {
              const n = c.profiles?.full_name?.split(' ').pop() || 'Ẩn danh'
              return <div key={c.id} className="flex gap-2.5">
                {c.profiles?.avatar_url ? <Image src={c.profiles.avatar_url} alt={n} width={32} height={32} className="rounded-full flex-shrink-0" />
                  : <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">{n[0]?.toUpperCase()}</div>}
                <div><p className="text-xs font-semibold text-white">{n} <span className="text-gray-500 font-normal">{ago(c.created_at)}</span></p><p className="text-sm text-gray-300 mt-0.5">{c.body}</p></div>
              </div>
            })}
          <div ref={ref} />
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Thêm bình luận..." maxLength={300}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 text-sm px-4 py-2 rounded-full focus:outline-none" />
          <button onClick={send} disabled={!text.trim() || sending} className="text-pink-500 font-semibold text-sm disabled:opacity-40">{sending ? <Loader2 size={16} className="animate-spin" /> : 'Đăng'}</button>
        </div>
      </div>
    </>
  )
}

/* ─── Share modal ─── */
function ShareModal({ review, onClose }: { review: Review; onClose: () => void }) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/reviews/${review.id}`
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const share = () => navigator.share ? navigator.share({ url }) : copy()
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-50 bg-[#1a1a1a] rounded-t-3xl px-5 pt-3 pb-8">
        <div className="flex justify-center mb-4"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
        <p className="text-white font-semibold text-center mb-5">Chia sẻ với bạn bè</p>
        <div className="flex gap-4 justify-center mb-6">
          {[
            { emoji: '📋', label: copied ? 'Đã chép' : 'Sao chép', fn: copy },
            { emoji: '🔗', label: 'Chia sẻ', fn: share },
          ].map(a => (
            <button key={a.label} onClick={a.fn} className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-2xl">{a.emoji}</div>
              <span className="text-white text-xs">{a.label}</span>
            </button>
          ))}
        </div>
        <div className="bg-gray-800 rounded-xl px-4 py-2.5 text-gray-400 text-xs truncate">{url}</div>
      </div>
    </>
  )
}

/* ─── Single post (TikTok style) ─── */
function Post({ r, me, feedType, onFeedTypeChange, onLike, onSave, onComment, onShare, onDelete }: {
  r: Review; me: string | null
  feedType: 'for-you' | 'following'; onFeedTypeChange: (ft: 'for-you' | 'following') => void
  onLike: (id: string) => void; onSave: (id: string) => void
  onComment: (r: Review) => void; onShare: (r: Review) => void; onDelete: (id: string) => void
}) {
  const photos = (r.photos || []).filter(Boolean)
  const isMe = me === r.user_id
  const name = r.profiles?.full_name || 'Ẩn danh'
  const handle = '@' + name.replace(/\s+/g, '').toLowerCase()
  const [menu, setMenu] = useState(false)

  return (
    <div className="relative w-full h-dvh flex-shrink-0 snap-start bg-black overflow-hidden">
      {/* BG */}
      {photos.length > 0 ? <Carousel photos={photos} />
        : <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />}

      {/* Top: for you / following */}
      <div className="absolute top-0 left-0 right-0 z-20 pt-12 px-4 flex items-center justify-center gap-6">
        <button onClick={() => onFeedTypeChange('following')} className={`text-sm font-medium ${feedType === 'following' ? 'text-white font-bold border-b-2 border-white pb-0.5' : 'text-white/60'}`}>Đang follow</button>
        <button onClick={() => onFeedTypeChange('for-you')} className={`text-sm font-medium ${feedType === 'for-you' ? 'text-white font-bold border-b-2 border-white pb-0.5' : 'text-white/60'}`}>Đề xuất</button>
        {isMe && (
          <div className="absolute right-4 top-12">
            <button onClick={() => setMenu(v => !v)} className="w-8 h-8 flex items-center justify-center">
              <MoreVertical size={20} className="text-white drop-shadow" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-9 z-40 bg-[#1a1a1a] border border-gray-700 rounded-2xl overflow-hidden w-40 shadow-2xl">
                  <button onClick={async () => { if (!confirm('Xoá?')) return; const res = await fetch(`/api/reviews/${r.id}`, { method: 'DELETE' }); if (res.ok) { onDelete(r.id) } setMenu(false) }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-red-400 text-sm font-medium hover:bg-gray-800">
                    <Trash2 size={15} /> Xoá bài
                  </button>
                  <button onClick={async () => { await fetch(`/api/reviews/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: true }) }); onDelete(r.id); setMenu(false) }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 text-sm font-medium hover:bg-gray-800 border-t border-gray-800">
                    <EyeOff size={15} /> Ẩn bài
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right actions (TikTok style) */}
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5">
        {/* Avatar */}
        <div className="relative mb-1">
          <Link href={`/users/${r.user_id}`}>
            {r.profiles?.avatar_url
              ? <Image src={r.profiles.avatar_url} alt={name} width={48} height={48} className="rounded-full ring-2 ring-white object-cover" />
              : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 ring-2 ring-white flex items-center justify-center text-white font-bold">{name[0]?.toUpperCase()}</div>}
          </Link>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 bg-[#fe2c55] rounded-full flex items-center justify-center">
            <Plus size={12} className="text-white" strokeWidth={3} />
          </div>
        </div>

        {/* Like */}
        <RAction icon={<Heart size={28} className={r.liked_by_me ? 'fill-[#fe2c55] text-[#fe2c55]' : 'text-white'} />} label={r.like_count} onClick={() => onLike(r.id)} />
        {/* Comment */}
        <RAction icon={<MessageCircle size={26} className="text-white" />} label={r.comment_count} onClick={() => onComment(r)} />
        {/* Save */}
        <RAction icon={<Bookmark size={24} className={r.saved_by_me ? 'fill-amber-400 text-amber-400' : 'text-white'} />} label="Lưu" onClick={() => onSave(r.id)} />
        {/* Share */}
        <RAction icon={<Share2 size={24} className="text-white" />} label="Chia sẻ" onClick={() => onShare(r)} />
        {/* Music disc */}
        <div className="w-10 h-10 rounded-full border-2 border-white/30 bg-black/50 flex items-center justify-center animate-spin-slow">
          <Music2 size={16} className="text-white" />
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-3 right-20 z-20">
        <Link href={`/users/${r.user_id}`}>
          <p className="text-white font-bold text-[15px] mb-1 drop-shadow">{handle}</p>
        </Link>
        {r.body ? <p className="text-white text-sm leading-snug line-clamp-3 drop-shadow">{r.body}</p> : null}
        {r.place_name !== 'Chia sẻ' && (
          <p className="text-white/70 text-xs mt-1.5 flex items-center gap-1">
            <span className="text-sm">📍</span> {r.place_name}
            {r.rating > 0 && <span className="ml-2 text-amber-400">{'★'.repeat(r.rating)}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

function RAction({ icon, label, onClick }: { icon: React.ReactNode; label?: string | number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
      {icon}
      {label !== undefined && <span className="text-white text-xs font-semibold drop-shadow-md">{label}</span>}
    </button>
  )
}

/* ─── My posts grid (management) ─── */
function MyPosts({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<Review[]>([])
  const [hidden, setHidden] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Review | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const [res1, res2] = await Promise.all([
        fetch(`/api/reviews/feed?userId=${userId}&limit=50`).then(r => r.json()),
        supabase.from('reviews').select('id,place_name,body,photos,rating,is_hidden,like_count,comment_count,created_at').eq('user_id', userId).eq('is_hidden', true).order('created_at', { ascending: false }),
      ])
      setPosts((res1.reviews || []).map((r: Review) => ({ ...r, is_hidden: false })))
      setHidden((res2.data || []).map((r: any) => ({ ...r } as Review)))
      setLoading(false)
    }
    load()
  }, [userId, supabase])

  const all = [...posts, ...hidden].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as (Review & { is_hidden?: boolean })[]

  const doDelete = async (id: string) => {
    if (!confirm('Xoá bài?')) return
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' })
    if (res.ok) { setPosts(p => p.filter(r => r.id !== id)); setHidden(h => h.filter(r => r.id !== id)); setSel(null) }
  }
  const doHide = async (id: string, hide: boolean) => {
    await fetch(`/api/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: hide }) })
    if (hide) { const p = posts.find(r => r.id === id); if (p) { setPosts(prev => prev.filter(r => r.id !== id)); setHidden(prev => [{ ...p, is_hidden: true } as Review, ...prev]) } }
    else { const h = hidden.find(r => r.id === id); if (h) { setHidden(prev => prev.filter(r => r.id !== id)); setPosts(prev => [{ ...h, is_hidden: false } as Review, ...prev]) } }
    setSel(null)
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="text-white animate-spin" /></div>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex border-b border-gray-800">
        <div className="flex-1 py-3 text-center border-b-2 border-white text-white text-sm font-semibold">{posts.length} bài viết</div>
        <div className="flex-1 py-3 text-center text-gray-500 text-sm">{hidden.length} đang ẩn</div>
      </div>
      {all.length === 0
        ? <div className="flex flex-col items-center py-16 text-gray-500"><Grid3X3 size={36} className="mb-3 opacity-30" /><p className="text-sm">Chưa có bài nào</p><Link href="/reviews/new" className="mt-4 bg-[#fe2c55] text-white px-5 py-2 rounded-full text-sm font-semibold">Đăng bài đầu tiên</Link></div>
        : <div className="grid grid-cols-3 gap-px bg-gray-800">
            {all.map(r => {
              const thumb = r.photos?.[0]
              const isHidden = (r as Review & { is_hidden?: boolean }).is_hidden
              return (
                <button key={r.id} onClick={() => setSel(sel?.id === r.id ? null : r as Review)}
                  className={`relative aspect-[9/16] bg-gray-900 ${sel?.id === r.id ? 'ring-2 ring-inset ring-[#fe2c55]' : ''}`}>
                  {thumb ? <Image src={thumb} alt="" fill className="object-cover" sizes="33vw" />
                    : <div className="absolute inset-0 flex items-center justify-center p-2"><p className="text-white text-xs text-center line-clamp-4">{r.body}</p></div>}
                  {isHidden && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><EyeOff size={20} className="text-white" /></div>}
                  <div className="absolute bottom-1 left-1 flex items-center gap-1"><Heart size={11} className="text-white fill-white" /><span className="text-white text-[10px]">{r.like_count}</span></div>
                </button>
              )
            })}
          </div>}

      {/* Action bottom sheet */}
      {sel && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setSel(null)} />
          <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-40 bg-[#1a1a1a] rounded-t-3xl px-5 pt-3 pb-8">
            <div className="flex justify-center mb-4"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
            <div className="flex items-center gap-3 mb-5 p-3 bg-gray-800 rounded-xl">
              {sel.photos?.[0] ? <Image src={sel.photos[0]} alt="" width={52} height={52} className="rounded-lg object-cover flex-shrink-0" />
                : <div className="w-13 h-13 bg-gray-700 rounded-lg flex-shrink-0 w-[52px] h-[52px]" />}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{sel.place_name}</p>
                <p className="text-gray-400 text-xs line-clamp-1 mt-0.5">{sel.body || 'Bài ảnh'}</p>
                <p className="text-gray-500 text-[10px] mt-1">❤️ {sel.like_count} · 💬 {sel.comment_count}</p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => doHide(sel.id, !(sel as Review & { is_hidden?: boolean }).is_hidden)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                {(sel as Review & { is_hidden?: boolean }).is_hidden ? <><Eye size={18} className="text-green-400" /> Hiện bài này</> : <><EyeOff size={18} className="text-orange-400" /> Ẩn bài này</>}
              </button>
              <button onClick={() => doDelete(sel.id)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-red-950/40 text-red-400 text-sm font-medium active:bg-red-950/60">
                <Trash2 size={18} /> Xoá bài này
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Profile Tab (TikTok style) ─── */
function ProfileTab({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<{
    full_name: string | null; avatar_url: string | null
    follower_count: number; following_count: number; review_count: number
  } | null>(null)
  const [posts, setPosts] = useState<Review[]>([])
  const [hidden, setHidden] = useState<Review[]>([])
  const [likedPosts, setLikedPosts] = useState<Review[]>([])
  const [savedPosts, setSavedPosts] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'liked'>('posts')
  const [sel, setSel] = useState<Review | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [profileRes, reviewsRes, likedRes, savedRes] = await Promise.all([
        fetch(`/api/users/${userId}`).then(r => r.json()),
        fetch(`/api/reviews/feed?userId=${userId}&limit=50`).then(r => r.json()),
        supabase.from('review_likes').select('review_id').eq('user_id', userId).then(r => r.data || []),
        supabase.from('review_saves').select('review_id').eq('user_id', userId).then(r => r.data || []),
      ])
      setProfile(profileRes)
      const allPosts = (reviewsRes.reviews || []).map((r: Review) => ({ ...r, is_hidden: false }))
      setPosts(allPosts)
      const { data: hiddenData } = await supabase.from('reviews').select('id,place_name,body,photos,rating,is_hidden,like_count,comment_count,created_at').eq('user_id', userId).eq('is_hidden', true).order('created_at', { ascending: false })
      setHidden((hiddenData || []).map((r: any) => ({ ...r } as Review)))
      if (likedRes.length > 0) {
        const likedIds = (likedRes as { review_id: string }[]).map(l => l.review_id)
        const { data: likedData } = await supabase.from('reviews').select('id,user_id,place_name,place_address,rating,body,photos,is_verified,like_count,comment_count,created_at').in('id', likedIds).or('is_hidden.is.null,is_hidden.eq.false').order('created_at', { ascending: false }).limit(30)
        setLikedPosts((likedData || []).map((r: any) => ({ ...r, liked_by_me: true, saved_by_me: false })))
      }
      if (savedRes.length > 0) {
        const savedIds = (savedRes as { review_id: string }[]).map(s => s.review_id)
        const { data: savedData } = await supabase.from('reviews').select('id,user_id,place_name,place_address,rating,body,photos,is_verified,like_count,comment_count,created_at').in('id', savedIds).or('is_hidden.is.null,is_hidden.eq.false').order('created_at', { ascending: false }).limit(30)
        setSavedPosts((savedData || []).map((r: any) => ({ ...r, liked_by_me: false, saved_by_me: true })))
      }
      setLoading(false)
    }
    load()
  }, [userId, supabase])

  const doDelete = async (id: string) => {
    if (!confirm('Xoá bài?')) return
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' })
    if (res.ok) { setPosts(p => p.filter(r => r.id !== id)); setHidden(h => h.filter(r => r.id !== id)); setSel(null) }
  }
  const doHide = async (id: string, hide: boolean) => {
    await fetch(`/api/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: hide }) })
    if (hide) { const p = posts.find(r => r.id === id); if (p) { setPosts(prev => prev.filter(r => r.id !== id)); setHidden(prev => [{ ...p, is_hidden: true } as Review, ...prev]) } }
    else { const h = hidden.find(r => r.id === id); if (h) { setHidden(prev => prev.filter(r => r.id !== id)); setPosts(prev => [{ ...h, is_hidden: false } as Review, ...prev]) } }
    setSel(null)
  }

  const firstName = profile?.full_name?.split(' ').pop() || 'Tôi'
  const handle = '@' + (profile?.full_name?.replace(/\s+/g, '').toLowerCase() || 'user')
  const allMyPosts = [...posts, ...hidden].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as (Review & { is_hidden?: boolean })[]
  const displayPosts = activeTab === 'posts' ? allMyPosts : activeTab === 'saved' ? savedPosts : likedPosts

  const handleGridClick = (r: Review) => {
    if (activeTab === 'posts') {
      setSel(sel?.id === r.id ? null : r as Review)
    } else {
      sessionStorage.setItem('reviews_tab', activeTab)
      router.push(`/reviews/${r.id}`)
    }
  }

  const emptyState = {
    posts: { icon: <Grid3X3 size={36} className="mb-3 opacity-30" />, text: 'Chưa có bài nào', cta: <Link href="/reviews/new" className="mt-4 bg-[#fe2c55] text-white px-5 py-2 rounded-full text-sm font-semibold">Đăng bài đầu tiên</Link> },
    saved: { icon: <Bookmark size={36} className="mb-3 opacity-30" />, text: 'Chưa lưu bài nào', cta: null },
    liked: { icon: <Heart size={36} className="mb-3 opacity-30" />, text: 'Chưa thích bài nào', cta: null },
  }

  return (
    <div className="h-dvh overflow-y-auto bg-black pb-16" style={{ scrollbarWidth: 'none' }}>
      {/* Gradient header */}
      <div style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, #0d0618 60%, #000 100%)' }} className="pt-14 pb-4 px-4 flex flex-col items-center">
        <div className="relative mb-3">
          {profile?.avatar_url
            ? <Image src={profile.avatar_url} alt={firstName} width={96} height={96} className="rounded-full object-cover ring-2 ring-purple-500/40" />
            : <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-2 ring-purple-500/40">{firstName[0]?.toUpperCase()}</div>}
          <Link href="/reviews/new" className="absolute bottom-0 right-0 w-6 h-6 bg-[#fe2c55] rounded-full flex items-center justify-center border-2 border-black">
            <Plus size={13} className="text-white" strokeWidth={3} />
          </Link>
        </div>
        <h2 className="text-white font-bold text-[17px] mb-0.5">{profile?.full_name || 'Ẩn danh'}</h2>
        <p className="text-gray-400 text-sm mb-4">{handle}</p>
        <div className="flex gap-10 mb-4">
          <div className="text-center">
            <div className="text-white font-bold text-base">{profile?.following_count ?? 0}</div>
            <div className="text-gray-400 text-xs">Đang follow</div>
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-base">{profile?.follower_count ?? 0}</div>
            <div className="text-gray-400 text-xs">Follower</div>
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-base">{posts.length}</div>
            <div className="text-gray-400 text-xs">Bài viết</div>
          </div>
        </div>
        <Link href="/profile" className="w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold py-2 rounded-md text-center transition-colors">
          Chỉnh sửa hồ sơ
        </Link>
      </div>

      {/* 3-tab bar */}
      <div className="flex border-b border-gray-800">
        <button onClick={() => setActiveTab('posts')} className={`flex-1 py-2.5 flex flex-col justify-center items-center gap-0.5 transition-colors ${activeTab === 'posts' ? 'border-b-2 border-white' : ''}`}>
          <Grid3X3 size={18} className={activeTab === 'posts' ? 'text-white' : 'text-gray-500'} />
          <span className={`text-[10px] ${activeTab === 'posts' ? 'text-white' : 'text-gray-500'}`}>Bài viết</span>
        </button>
        <button onClick={() => setActiveTab('saved')} className={`flex-1 py-2.5 flex flex-col justify-center items-center gap-0.5 transition-colors ${activeTab === 'saved' ? 'border-b-2 border-white' : ''}`}>
          <Bookmark size={18} className={activeTab === 'saved' ? 'text-white' : 'text-gray-500'} />
          <span className={`text-[10px] ${activeTab === 'saved' ? 'text-white' : 'text-gray-500'}`}>Đã lưu</span>
        </button>
        <button onClick={() => setActiveTab('liked')} className={`flex-1 py-2.5 flex flex-col justify-center items-center gap-0.5 transition-colors ${activeTab === 'liked' ? 'border-b-2 border-white' : ''}`}>
          <Heart size={18} className={activeTab === 'liked' ? 'text-white' : 'text-gray-500'} />
          <span className={`text-[10px] ${activeTab === 'liked' ? 'text-white' : 'text-gray-500'}`}>Đã thích</span>
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center pt-16"><Loader2 size={20} className="text-white animate-spin" /></div>
      ) : displayPosts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-500">
          {emptyState[activeTab].icon}
          <p className="text-sm">{emptyState[activeTab].text}</p>
          {emptyState[activeTab].cta}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-gray-800">
          {displayPosts.map(r => {
            const thumb = r.photos?.[0]
            const isHidden = activeTab === 'posts' && (r as Review & { is_hidden?: boolean }).is_hidden
            return (
              <button key={r.id} onClick={() => handleGridClick(r as Review)}
                className={`relative aspect-[9/16] bg-gray-900 ${sel?.id === r.id ? 'ring-2 ring-inset ring-[#fe2c55]' : ''}`}>
                {thumb ? <Image src={thumb} alt="" fill className="object-cover" sizes="33vw" />
                  : <div className="absolute inset-0 flex items-center justify-center p-2"><p className="text-white text-xs text-center line-clamp-4">{r.body}</p></div>}
                {/* Overlay: place name + stars */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-1.5 pt-4 pb-1.5">
                  <p className="text-white text-[9px] font-semibold leading-tight line-clamp-1">{r.place_name}</p>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {'★'.repeat(r.rating).split('').map((_, i) => (
                      <span key={i} className="text-amber-400 text-[8px] leading-none">★</span>
                    ))}
                  </div>
                </div>
                {isHidden && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><EyeOff size={20} className="text-white" /></div>}
              </button>
            )
          })}
        </div>
      )}

      {/* Action sheet for my posts */}
      {sel && activeTab === 'posts' && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setSel(null)} />
          <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-40 bg-[#1a1a1a] rounded-t-3xl px-5 pt-3 pb-8">
            <div className="flex justify-center mb-3"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
            <p className="text-white text-sm font-semibold text-center mb-3 line-clamp-1">{sel.place_name}</p>
            <div className="space-y-2">
              <Link href={`/reviews/${sel.id}`} onClick={() => { sessionStorage.setItem('reviews_tab', 'profile'); setSel(null) }}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                <Eye size={18} className="text-blue-400" /> Xem bài viết
              </Link>
              <button onClick={() => doHide(sel.id, !(sel as Review & { is_hidden?: boolean }).is_hidden)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                {(sel as Review & { is_hidden?: boolean }).is_hidden ? <><Eye size={18} className="text-green-400" /> Hiện bài này</> : <><EyeOff size={18} className="text-orange-400" /> Ẩn bài này</>}
              </button>
              <button onClick={() => doDelete(sel.id)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-red-950/40 text-red-400 text-sm font-medium active:bg-red-950/60">
                <Trash2 size={18} /> Xoá bài này
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── TikTok Bottom Nav ─── */
function TikNav({ tab, setTab, userId }: { tab: string; setTab: (t: string) => void; userId: string | null }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur border-t border-gray-800 flex items-center h-[60px]">
      {[
        { id: 'home', icon: <Home size={24} />, label: 'Trang chủ' },
        { id: 'explore', icon: <Search size={24} />, label: 'Tìm Kiếm' },
      ].map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === item.id ? 'text-white' : 'text-gray-500'}`}>
          {item.icon}<span className="text-[10px]">{item.label}</span>
        </button>
      ))}
      {/* Post button */}
      <Link href="/reviews/new" className="flex-1 flex justify-center">
        <div className="relative w-11 h-7 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#69c9d0] rounded-lg" style={{ right: 4 }} />
          <div className="absolute inset-0 bg-[#fe2c55] rounded-lg" style={{ left: 4 }} />
          <div className="relative bg-white rounded-lg w-[38px] h-full flex items-center justify-center">
            <Plus size={20} className="text-black" strokeWidth={2.5} />
          </div>
        </div>
      </Link>
      <button onClick={() => setTab('inbox')} className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === 'inbox' ? 'text-white' : 'text-gray-500'}`}>
        <Bell size={24} /><span className="text-[10px]">Hộp thư</span>
      </button>
      <button onClick={() => setTab('profile')} className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === 'profile' ? 'text-white' : 'text-gray-500'}`}>
        <User size={24} /><span className="text-[10px]">Hồ sơ</span>
      </button>
    </div>
  )
}

/* ─── Desktop sidebar ─── */
function Sidebar({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  return (
    <aside className="hidden md:flex flex-col w-[240px] xl:w-[260px] fixed left-[max(0px,calc(50vw-500px))] top-0 h-screen py-6 px-4 gap-1 border-r border-gray-800">
      <div className="text-white font-black text-2xl px-3 mb-4">TappyAI</div>
      {[
        { id: 'home', icon: <Home size={22} />, label: 'Trang chủ' },
        { id: 'explore', icon: <Search size={22} />, label: 'Tìm Kiếm' },
        { id: 'profile', icon: <User size={22} />, label: 'Hồ sơ & Bài của tôi' },
      ].map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-xl text-[15px] font-${tab === item.id ? 'bold text-white bg-white/10' : 'medium text-gray-300 hover:bg-white/5'} transition-colors`}>
          {item.icon}{item.label}
        </button>
      ))}
      <Link href="/reviews/new" className="mt-4 mx-1 bg-[#fe2c55] hover:bg-[#ef2950] text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
        <Plus size={18} />Đăng bài
      </Link>
    </aside>
  )
}

/* ─── Notification row ─── */
function NotifRow({ g, onNav }: { g: GroupedNotif; onNav: () => void }) {
  const color = NOTIF_COLOR[g.type] || '#666'
  const [followed, setFollowed] = useState(false)
  const actors = g.actors.slice(0, 3)
  const actorLabel = g.actors.length === 1
    ? g.actors[0].name
    : g.actors.length === 2
    ? `${g.actors[0].name} và ${g.actors[1].name}`
    : `${g.actors[0].name}, ${g.actors[1]?.name} và ${g.actors.length - 2} người khác`

  const avatarStack = (
    <div className="relative flex-shrink-0 mr-3" style={{ width: 48, height: 44 }}>
      {actors.map((actor, i) => {
        const n = actor.name.split(' ').pop() || '?'
        return (
          <div key={i} className="absolute rounded-full overflow-hidden border-2 border-black"
            style={{ left: i * 8, top: 0, zIndex: 3 - i, width: 36, height: 36 }}>
            {actor.avatar
              ? <Image src={actor.avatar} alt={n} width={36} height={36} className="object-cover w-full h-full" />
              : <div className="w-full h-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{n[0]?.toUpperCase()}</div>}
          </div>
        )
      })}
      <div className="absolute rounded-full flex items-center justify-center border-2 border-black"
        style={{ background: color, width: 20, height: 20, bottom: -4, right: 0, zIndex: 10 }}>
        {g.type === 'like' && <Heart size={9} className="text-white fill-white" />}
        {g.type === 'follow' && <User size={9} className="text-white" />}
        {g.type === 'comment' && <MessageCircle size={9} className="text-white" />}
      </div>
    </div>
  )

  const mainText = (
    <div className="flex-1 min-w-0">
      <p className="text-white text-sm leading-snug">
        <span className="font-semibold">{actorLabel}</span>{' '}
        <span className="text-gray-300">
          {g.type === 'like' ? 'đã thích bài viết của bạn' : g.type === 'follow' ? 'đã theo dõi bạn' : 'đã bình luận'}
        </span>
      </p>
      {g.type === 'comment' && g.comment_body && (
        <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">&quot;{g.comment_body}&quot;</p>
      )}
      <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at)}</p>
    </div>
  )

  const rowBase = "flex items-center px-4 py-3.5 border-l-[3px] active:bg-gray-900/40 transition-colors"

  const handleReviewNav = () => { onNav() }

  if (g.type === 'profile_view') {
    return (
      <div className={rowBase} style={{ borderColor: color }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 mr-3" style={{ background: `${color}22` }}>
          <User size={20} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm"><span className="font-bold">{g.count}</span> người đã xem hồ sơ của bạn trong 24h</p>
          <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at)}</p>
        </div>
        <button className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ml-2" style={{ background: `${color}22`, color }}>Xem ai</button>
      </div>
    )
  }

  if (g.type === 'follow') {
    const profileUrl = g.actors[0]?.id ? `/users/${g.actors[0].id}` : '#'
    return (
      <Link href={profileUrl} className={rowBase} style={{ borderColor: color }}>
        {avatarStack}{mainText}
        <button
          onClick={async e => { e.preventDefault(); e.stopPropagation(); if (followed || !g.actors[0]?.id) return; setFollowed(true); await fetch(`/api/users/${g.actors[0].id}/follow`, { method: 'POST' }) }}
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ml-2 transition-all"
          style={{ background: followed ? 'rgba(255,255,255,0.08)' : `${color}22`, color: followed ? '#666' : color }}>
          {followed ? 'Đã theo' : 'Theo dõi lại'}
        </button>
      </Link>
    )
  }

  return (
    <div role="button" onClick={handleReviewNav} className={rowBase + ' cursor-pointer'} style={{ borderColor: color }}>
      {avatarStack}{mainText}
      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center ml-2 flex-shrink-0">
        <span className="text-base">🍽️</span>
      </div>
    </div>
  )
}

/* ─── Inbox Tab ─── */
function InboxTab({ notifs, notifsLoading, hotPlaces, hotPlacesLoading, onSetTab, onFeedTypeChange }: {
  notifs: Notification[]
  notifsLoading: boolean
  hotPlaces: HotPlace[]
  hotPlacesLoading: boolean
  onSetTab: (t: string) => void
  onFeedTypeChange: (ft: 'for-you' | 'following') => void
}) {
  const grouped = groupNotifs(notifs)
  const bySection = new Map<string, GroupedNotif[]>()
  for (const g of grouped) {
    const s = notifSection(g.created_at)
    if (!bySection.has(s)) bySection.set(s, [])
    bySection.get(s)!.push(g)
  }
  const sections = ['VỪA XONG', 'HÔM NAY', 'TUẦN NÀY'].filter(l => bySection.has(l)).map(l => ({ label: l, items: bySection.get(l)! }))

  return (
    <div className="h-dvh flex flex-col bg-black overflow-hidden">
      <div className="flex-shrink-0 pt-14 px-4 pb-3 border-b border-gray-800">
        <h2 className="text-white font-bold text-lg">Thông báo</h2>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {notifsLoading ? (
          <div className="flex justify-center pt-16"><Loader2 size={22} className="text-white animate-spin" /></div>
        ) : (
          <>
            {/* AI Digest Banner */}
            <div className="px-4 mt-4 mb-1">
              <button onClick={() => { onFeedTypeChange('following'); onSetTab('home') }} className="w-full text-left rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #1c0d00 0%, #2a1500 100%)', border: '1px solid rgba(255,107,53,0.28)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,107,53,0.15)' }}>
                  <span className="text-lg">✨</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-xs mb-0.5" style={{ color: '#ff6b35' }}>Tappy gợi ý hôm nay</p>
                  <p className="text-white text-sm leading-snug">3 quán bạn bè hay đến đang mở gần bạn</p>
                </div>
                <ChevronRight size={16} className="text-gray-500 flex-shrink-0" />
              </button>
            </div>

            {/* Hot places row */}
            {!hotPlacesLoading && hotPlaces.length > 0 && (
              <div className="mb-1">
                <p className="text-gray-500 text-[10px] font-bold px-4 pt-4 pb-2 tracking-widest">ĐANG HOT GẦN BẠN 🔥</p>
                <div className="flex gap-3 px-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                  {hotPlaces.map((p, i) => (
                    <button key={p.place_name} onClick={() => onSetTab('explore')}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gray-800"
                        style={i === 0 ? { boxShadow: '0 0 0 2px #ff6b35' } : {}}>
                        <span className="text-2xl">🍽️</span>
                      </div>
                      <p className="text-white text-[10px] text-center font-medium leading-tight line-clamp-2" style={{ width: 64 }}>{p.place_name}</p>
                      <p className="text-gray-500 text-[9px]">{p.count} lượt</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications grouped by section */}
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <Bell size={40} className="opacity-30" />
                <p className="text-sm">Chưa có thông báo nào</p>
              </div>
            ) : sections.length === 0 ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <Bell size={40} className="opacity-30" />
                <p className="text-sm">Không có thông báo mới</p>
              </div>
            ) : (
              sections.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-gray-500 text-[10px] font-bold px-4 pt-4 pb-1.5 tracking-widest">{label}</p>
                  {items.map(g => <NotifRow key={g.id} g={g} onNav={() => onSetTab('home')} />)}
                </div>
              ))
            )}
            <div className="h-6" />
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Main ─── */
export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'home'
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    if (fromUrl) return fromUrl
    const saved = sessionStorage.getItem('reviews_tab')
    if (saved) { sessionStorage.removeItem('reviews_tab'); return saved }
    return 'home'
  })
  useEffect(() => {
    const fromUrl = searchParams?.get('tab')
    if (fromUrl) setTab(fromUrl)
  }, [searchParams])
  const handleSetTab = useCallback((t: string) => {
    setTab(t)
    router.replace(window.location.pathname + '?tab=' + t, { scroll: false })
  }, [router])
  const [feedType, setFeedType] = useState<'for-you' | 'following'>('for-you')
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [notifsLoading, setNotifsLoading] = useState(false)
  const [hotPlaces, setHotPlaces] = useState<HotPlace[]>([])
  const [hotPlacesLoading, setHotPlacesLoading] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const hasMore = useRef(true)
  const supabase = createClient()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Review[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // User search state
  const [searchMode, setSearchMode] = useState<'review' | 'user'>('review')
  const [userResults, setUserResults] = useState<{ id: string; full_name: string | null; avatar_url: string | null; follower_count: number; following_count: number; is_following: boolean }[]>([])
  const [userSearching, setUserSearching] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
  }, [supabase])

  // Load notifications + hot places when inbox tab opens
  useEffect(() => {
    if (tab !== 'inbox') return
    setNotifsLoading(true)
    fetch('/api/notifications').then(r => r.json()).then(d => setNotifs(d.notifications || [])).finally(() => setNotifsLoading(false))
    setHotPlacesLoading(true)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('review_likes')
          .select('reviews!inner(place_name)')
          .gte('created_at', since)
          .limit(200)
        const counts = new Map<string, number>()
        for (const row of (data || []) as any[]) {
          const name = row.reviews?.place_name
          if (name) counts.set(name, (counts.get(name) || 0) + 1)
        }
        setHotPlaces(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([place_name, count]) => ({ place_name, count })))
      } finally {
        setHotPlacesLoading(false)
      }
    })()
  }, [tab])

  const fetch_ = useCallback(async (p: number, append = false, ft: 'for-you' | 'following' = 'for-you') => {
    const followingParam = ft === 'following' ? '&following=true' : ''
    const res = await fetch(`/api/reviews/feed?page=${p}&sort=latest${followingParam}`)
    const data = await res.json()
    const rows: Review[] = (data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false }))
    setReviews(prev => append ? [...prev, ...rows] : rows)
    hasMore.current = rows.length >= 12
    setLoading(false)
  }, [])

  useEffect(() => { fetch_(0, false, feedType) }, [fetch_, feedType])

  const handleFeedTypeChange = (ft: 'for-you' | 'following') => {
    if (ft === feedType) return
    setFeedType(ft)
    setLoading(true)
    pageRef.current = 0
    hasMore.current = true
  }

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reviews/feed?search=${encodeURIComponent(q)}&limit=20`)
        const data = await res.json()
        setSearchResults((data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false })))
        track('review_search', { query: q })
      } finally { setSearching(false) }
    }, 400)
  }, [])

  // User search
  const doUserSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setUserResults([]); return }
    setUserSearching(true)
    try {
      const res = await fetch('/api/users/search?q=' + encodeURIComponent(q))
      const d = await res.json()
      setUserResults(d.users || [])
    } finally { setUserSearching(false) }
  }, [])

  const toggleFollow = async (targetId: string) => {
    setUserResults(prev => prev.map(u => u.id === targetId
      ? { ...u, is_following: !u.is_following, follower_count: u.follower_count + (u.is_following ? -1 : 1) }
      : u))
    const res = await fetch(`/api/users/${targetId}/follow`, { method: 'POST' })
    if (res.ok) {
      const d = await res.json()
      setUserResults(prev => prev.map(u => u.id === targetId ? { ...u, is_following: d.following, follower_count: d.follower_count } : u))
    } else {
      // revert
      setUserResults(prev => prev.map(u => u.id === targetId
        ? { ...u, is_following: !u.is_following, follower_count: u.follower_count + (u.is_following ? 1 : -1) }
        : u))
    }
  }

  // Infinite scroll
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onScroll = () => {
      if (hasMore.current && c.scrollTop + c.clientHeight >= c.scrollHeight - c.clientHeight * 0.5) {
        hasMore.current = false
        pageRef.current += 1
        fetch_(pageRef.current, true, feedType)
      }
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    return () => c.removeEventListener('scroll', onScroll)
  }, [loading, fetch_, feedType])

  const like = async (id: string) => {
    const r = reviews.find(r => r.id === id)
    const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
    const { liked } = await res.json()
    setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: liked, like_count: r.like_count + (liked ? 1 : -1) } : r))
    track('review_like', { review_id: id, place: r?.place_name, liked })
  }
  const save = async (id: string) => {
    const res = await fetch(`/api/reviews/${id}/save`, { method: 'POST' })
    const { saved } = await res.json()
    setReviews(p => p.map(r => r.id === id ? { ...r, saved_by_me: saved } : r))
    track('place_save', { review_id: id })
  }
  const del = (id: string) => setReviews(p => p.filter(r => r.id !== id))
  const addComment = (id: string) => setReviews(p => p.map(r => r.id === id ? { ...r, comment_count: r.comment_count + 1 } : r))

  const handleShare = (r: Review) => {
    setShareOf(r)
    track('review_share', { review_id: r.id, place: r.place_name })
  }

  return (
    <div className="bg-black h-dvh overflow-hidden flex">
      <Sidebar tab={tab} setTab={handleSetTab} />

      {/* Content */}
      <div className="flex-1 md:ml-[240px] xl:ml-[260px] flex justify-center">
        <div className="w-full max-w-[390px] relative">

          {/* Home Feed */}
          {tab === 'home' && (
            loading
              ? <div className="h-dvh flex items-center justify-center"><Loader2 size={28} className="text-white animate-spin" /></div>
              : reviews.length === 0
              ? <div className="h-dvh flex flex-col items-center justify-center text-white gap-3">
                  <p className="text-4xl">{feedType === 'following' ? '👥' : '📸'}</p>
                  <p className="font-semibold">{feedType === 'following' ? 'Chưa theo dõi ai hoặc họ chưa đăng bài' : 'Chưa có bài nào'}</p>
                  {feedType === 'following'
                    ? <button onClick={() => handleFeedTypeChange('for-you')} className="bg-white text-black px-6 py-2.5 rounded-full font-semibold">Xem Đề xuất</button>
                    : <Link href="/reviews/new" className="bg-[#fe2c55] text-white px-6 py-2.5 rounded-full font-semibold">Đăng ngay</Link>}
                </div>
              : <div ref={containerRef} className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                  {reviews.map(r => <Post key={r.id} r={r} me={me} feedType={feedType} onFeedTypeChange={handleFeedTypeChange} onLike={like} onSave={save} onComment={setCommentOf} onShare={handleShare} onDelete={del} />)}
                </div>
          )}

          {/* Explore / Search */}
          {tab === 'explore' && (
            <div className="h-dvh flex flex-col bg-black overflow-hidden">
              {/* Search bar + mode toggle */}
              <div className="flex-shrink-0 pt-12 px-4 pb-3 border-b border-gray-800 space-y-2">
                <div className="flex items-center gap-2 bg-gray-900 rounded-2xl px-4 py-2.5">
                  <Search size={18} className="text-gray-500 flex-shrink-0" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); searchMode === 'review' ? doSearch(e.target.value) : doUserSearch(e.target.value) }}
                    placeholder={searchMode === 'review' ? 'Tìm review, địa điểm...' : 'Tìm theo tên, email, SĐT...'}
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchResults([]); setUserResults([]) }}>
                      <X size={16} className="text-gray-500" />
                    </button>
                  )}
                </div>
                {/* Segmented control */}
                <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
                  <button onClick={() => { setSearchMode('review'); setUserResults([]); if (searchQuery) doSearch(searchQuery) }} className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors ${searchMode === 'review' ? 'bg-white text-black' : 'text-gray-400'}`}>📍 Địa điểm & Review</button>
                  <button onClick={() => { setSearchMode('user'); setSearchResults([]); if (searchQuery) doUserSearch(searchQuery) }} className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors ${searchMode === 'user' ? 'bg-white text-black' : 'text-gray-400'}`}>👤 Người dùng</button>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto">
                {searchMode === 'review' && searching && (
                  <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>
                )}
                {searchMode === 'review' && !searching && searchQuery && searchResults.length === 0 && (
                  <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                    <Search size={36} className="opacity-20" />
                    <p className="text-sm">Không tìm thấy kết quả cho &quot;{searchQuery}&quot;</p>
                  </div>
                )}
                {searchMode === 'review' && !searching && searchResults.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-xs px-4 py-3">{searchResults.length} kết quả</p>
                    <div className="grid grid-cols-2 gap-px bg-gray-800">
                      {searchResults.map(r => {
                        const thumb = r.photos?.[0]
                        return (
                          <div key={r.id} className="relative aspect-[4/5] bg-gray-900">
                            {thumb
                              ? <Image src={thumb} alt="" fill className="object-cover" sizes="50vw" />
                              : <div className="absolute inset-0 flex items-center justify-center p-3"><p className="text-white text-xs text-center line-clamp-5">{r.body}</p></div>}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-2">
                              <p className="text-white text-xs font-semibold line-clamp-1">{r.place_name}</p>
                              {r.body && <p className="text-gray-300 text-[10px] line-clamp-1 mt-0.5">{r.body}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-white text-[10px] flex items-center gap-0.5"><Heart size={9} className="fill-white" /> {r.like_count}</span>
                                {r.rating > 0 && <span className="text-amber-400 text-[10px]">{'\u2605'.repeat(r.rating)}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!searchQuery && searchMode === 'review' && (
                  <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                    <Search size={48} className="opacity-20" />
                    <p className="text-sm">Tìm kiếm quán ăn, địa điểm hoặc nội dung bạn muốn xem</p>
                  </div>
                )}
                {/* User search results */}
                {searchMode === 'user' && <>
                  {userSearching && <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>}
                  {!userSearching && searchQuery && userResults.length === 0 && (
                    <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                      <User size={36} className="opacity-20" />
                      <p className="text-sm">Không tìm thấy người dùng nào</p>
                    </div>
                  )}
                  {!userSearching && userResults.length > 0 && (
                    <div className="divide-y divide-gray-800">
                      {userResults.map(u => {
                        const uname = u.full_name || 'Ẩn danh'
                        return (
                          <Link key={u.id} href={`/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors">
                            {u.avatar_url
                              ? <Image src={u.avatar_url} alt={uname} width={44} height={44} className="rounded-full flex-shrink-0" />
                              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-bold">{uname[0]?.toUpperCase()}</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{uname}</p>
                              <p className="text-gray-500 text-xs">{u.follower_count} followers · {u.following_count} following</p>
                            </div>
                            <button onClick={e => { e.preventDefault(); toggleFollow(u.id) }} className={`text-xs font-semibold px-4 py-1.5 rounded-full flex-shrink-0 transition-colors ${u.is_following ? 'bg-gray-700 text-white' : 'bg-white text-black'}`}>{u.is_following ? 'Đang theo' : 'Theo dõi'}</button>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                  {!searchQuery && (
                    <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                      <User size={48} className="opacity-20" />
                      <p className="text-sm">Tìm bạn bè theo tên, email hoặc số điện thoại</p>
                    </div>
                  )}
                </>}
              </div>
            </div>
          )}

          {/* Profile (TikTok style) */}
          {tab === 'profile' && (
            me
              ? <ProfileTab userId={me} />
              : <div className="h-dvh flex items-center justify-center">
                  <Link href="/login" className="text-[#fe2c55] text-sm font-semibold">Đăng nhập để xem hồ sơ</Link>
                </div>
          )}

          {/* Inbox - notifications */}
          {tab === 'inbox' && (
            <InboxTab
              notifs={notifs}
              notifsLoading={notifsLoading}
              hotPlaces={hotPlaces}
              hotPlacesLoading={hotPlacesLoading}
              onSetTab={handleSetTab}
              onFeedTypeChange={handleFeedTypeChange}
            />
          )}
        </div>
      </div>

      <TikNav tab={tab} setTab={handleSetTab} userId={me} />

      {commentOf && <CommentDrawer review={commentOf} onClose={() => setCommentOf(null)} onAdded={addComment} />}
      {shareOf && <ShareModal review={shareOf} onClose={() => setShareOf(null)} />}
    </div>
  )
}
