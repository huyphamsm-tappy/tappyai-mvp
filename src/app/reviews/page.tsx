'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter as useNextRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
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
      setHidden((res2.data || []).map((r: Review & { is_hidden: boolean }) => ({ ...r } as Review)))
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

/* ─── TikTok Bottom Nav ─── */
function TikNav({ tab, setTab, userId }: { tab: string; setTab: (t: string) => void; userId: string | null }) {
  const router = useNextRouter()
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur border-t border-gray-800 flex items-center h-[60px]">
      {[
        { id: 'home', icon: <Home size={24} />, label: 'Trang chủ' },
        { id: 'explore', icon: <Search size={24} />, label: 'Tìm Kiếm' },
      ].map(item => (
        <button key={item.id} onClick={() => item.id === 'home' ? router.push('/') : setTab(item.id)}
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
  const router = useNextRouter()
  return (
    <aside className="hidden md:flex flex-col w-[240px] xl:w-[260px] fixed left-[max(0px,calc(50vw-500px))] top-0 h-screen py-6 px-4 gap-1 border-r border-gray-800">
      <div className="text-white font-black text-2xl px-3 mb-4">TappyAI</div>
      {[
        { id: 'home', icon: <Home size={22} />, label: 'Trang chủ' },
        { id: 'explore', icon: <Search size={22} />, label: 'Tìm Kiếm' },
        { id: 'profile', icon: <User size={22} />, label: 'Hồ sơ & Bài của tôi' },
      ].map(item => (
        <button key={item.id} onClick={() => item.id === 'home' ? router.push('/') : setTab(item.id)}
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

/* ─── Main ─── */
export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('home')
  const [feedType, setFeedType] = useState<'for-you' | 'following'>('for-you')
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const hasMore = useRef(true)
  const supabase = createClient()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Review[]>([])
  const [searching, setSearching] = useState(false)
  const [searchMode, setSearchMode] = useState<'review'|'user'>('review')
  const [userResults, setUserResults] = useState<{id:string;full_name:string|null;avatar_url:string|null;follower_count:number;is_following:boolean}[]>([])
  const [userSearching, setUserSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
  }, [supabase])

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
  const doUserSearch = async (q: string) => {
    if (q.length < 2) { setUserResults([]); return }
    setUserSearching(true)
    try {
      const res = await fetch('/api/users/search?q=' + encodeURIComponent(q))
      const d = await res.json()
      setUserResults(d.users || [])
    } finally {
      setUserSearching(false)
    }
  }

  const toggleFollow = async (targetId: string) => {
    setUserResults(prev => prev.map(u => u.id === targetId
      ? { ...u, is_following: !u.is_following, follower_count: u.is_following ? u.follower_count - 1 : u.follower_count + 1 }
      : u))
    const res = await fetch('/api/users/' + targetId + '/follow', { method: 'POST' })
    const d = await res.json()
    if (res.ok) {
      setUserResults(prev => prev.map(u => u.id === targetId ? { ...u, is_following: d.following, follower_count: d.follower_count } : u))
    } else {
      setUserResults(prev => prev.map(u => u.id === targetId
        ? { ...u, is_following: !u.is_following, follower_count: u.is_following ? u.follower_count - 1 : u.follower_count + 1 }
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
      <Sidebar tab={tab} setTab={setTab} />

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
              {/* Search bar */}
              <div className="flex-shrink-0 pt-12 px-4 pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2 bg-gray-900 rounded-2xl px-4 py-2.5">
                  <Search size={18} className="text-gray-500 flex-shrink-0" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value)
                      if (searchMode === 'review') doSearch(e.target.value)
                      else doUserSearch(e.target.value)
                    }}
                    placeholder={searchMode === 'review' ? 'Tìm review, địa điểm...' : 'Tìm theo tên, email, SĐT...'}
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchResults([]); setUserResults([]) }}>
                      <X size={16} className="text-gray-500" />
                    </button>
                  )}
                </div>
                {/* Mode toggle */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setSearchMode('review'); if (searchQuery) doSearch(searchQuery) }}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${searchMode === 'review' ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'}`}
                  >📍 Địa điểm & Review</button>
                  <button
                    onClick={() => { setSearchMode('user'); if (searchQuery) doUserSearch(searchQuery) }}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${searchMode === 'user' ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'}`}
                  >👤 Người dùng</button>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto">
                {/* Review search results */}
                {searchMode === 'review' && (
                  <>
                    {searching && <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>}
                    {!searching && searchQuery && searchResults.length === 0 && (
                      <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                        <Search size={36} className="opacity-20" />
                        <p className="text-sm">Không tìm thấy kết quả cho &quot;{searchQuery}&quot;</p>
                      </div>
                    )}
                    {!searching && searchResults.length > 0 && (
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
                                    {r.rating > 0 && <span className="text-amber-400 text-[10px]">{'★'.repeat(r.rating)}</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {!searchQuery && (
                      <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                        <Search size={48} className="opacity-20" />
                        <p className="text-sm">Tìm kiếm quán ăn, địa điểm hoặc nội dung bạn muốn xem</p>
                      </div>
                    )}
                  </>
                )}

                {/* User search results */}
                {searchMode === 'user' && (
                  <>
                    {userSearching && <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>}
                    {!userSearching && searchQuery && userResults.length === 0 && (
                      <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                        <Search size={36} className="opacity-20" />
                        <p className="text-sm">Không tìm thấy người dùng nào</p>
                      </div>
                    )}
                    {!userSearching && userResults.length > 0 && (
                      <div className="divide-y divide-gray-800">
                        {userResults.map(u => {
                          const first = u.full_name?.split(' ').pop() || '?'
                          return (
                            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                              <Link href={'/users/' + u.id} className="flex-shrink-0">
                                {u.avatar_url
                                  ? <Image src={u.avatar_url} alt={first} width={44} height={44} className="rounded-full" />
                                  : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-base">{first[0]?.toUpperCase()}</div>
                                }
                              </Link>
                              <Link href={'/users/' + u.id} className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm truncate">{u.full_name || 'Ẩn danh'}</p>
                                <p className="text-gray-500 text-xs">{u.follower_count} người theo dõi</p>
                              </Link>
                              <button
                                onClick={() => toggleFollow(u.id)}
                                className={u.is_following
                                  ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-300'
                                  : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-black'
                                }
                              >
                                {u.is_following ? 'Đang theo dõi' : 'Theo dõi'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {!searchQuery && (
                      <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                        <Search size={48} className="opacity-20" />
                        <p className="text-sm">Tìm bạn bè theo tên, email hoặc số điện thoại</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Profile + My Posts */}
          {tab === 'profile' && (
            <div className="h-dvh flex flex-col bg-black overflow-hidden">
              <div className="px-4 pt-14 pb-4 flex items-center gap-4 border-b border-gray-800 flex-shrink-0">
                {me ? (
                  <Link href="/profile" className="text-white text-sm font-semibold underline underline-offset-2">Hồ sơ đầy đủ →</Link>
                ) : (
                  <Link href="/login" className="text-[#fe2c55] text-sm font-semibold">Đăng nhập để xem bài của bạn</Link>
                )}
              </div>
              {me ? <MyPosts userId={me} /> : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Hãy đăng nhập trước</div>
              )}
            </div>
          )}

          {/* Inbox placeholder */}
          {tab === 'inbox' && (
            <div className="h-dvh flex flex-col items-center justify-center text-gray-500 gap-3">
              <Bell size={40} className="opacity-30" />
              <p className="text-sm">Chưa có thông báo</p>
            </div>
          )}
        </div>
      </div>

      <TikNav tab={tab} setTab={setTab} userId={me} />

      {commentOf && <CommentDrawer review={commentOf} onClose={() => setCommentOf(null)} onAdded={addComment} />}
      {shareOf && <ShareModal review={shareOf} onClose={() => setShareOf(null)} />}
    </div>
  )
}
