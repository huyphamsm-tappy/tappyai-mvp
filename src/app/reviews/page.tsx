'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Heart, MessageCircle, ChevronRight, ChevronUp, ChevronDown,
  X, Loader2, Home, Search, Plus, Bell, User, AlertCircle, Compass
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/tracking/tracker'
import { logUserEvent, getUserPreferences, inferPreferencesFromEvents } from '@/lib/userMemory'
import type { UserPreferences } from '@/lib/userMemory'
import SoundSheet from './SoundSheet'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Post, CommentDrawer, ShareModal, isShareOnlyName, ago, type Review } from './feedShared'
import { ProfileTab } from './ProfileTab'

interface Notification { id: string; type: string; actor_id: string; actor_name: string; actor_avatar: string | null; text: string; url: string; created_at: string }
// Client-side "last seen the Inbox" marker — an ISO timestamp in localStorage.
// The unread badge = notifications newer than this. Opening the Inbox advances it
// to now. This is deliberately client-only: no server-side read tracking, no
// notifications table (per the ticket's out-of-scope list).
const NOTIF_SEEN_KEY = 'tappy:notifSeenAt'
// Bug #8 — feed active-clip restoration. The clip in view lives only in an inner
// snap-scroll container (no per-clip URL, no history entry), so opening an author's
// profile (a real route change) and pressing Back would remount the feed at the top
// slide of a freshly-fetched — and, for "trending", re-ordered — feed, i.e. a
// different clip. We remember the active clip's ID + feed type on leave and restore
// by ID after the feed reloads, but ONLY when the mount follows a Back/Forward
// traversal. `popstate` fires for history traversals (Back/Forward, incl.
// router.back()) but not for push navigations, so a recent popstate is our signal.
const RETURN_KEY = 'tappy:reviewsReturn'
let lastPopStateAt = 0
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { lastPopStateAt = Date.now() })
}
// popstate only fires for SAME-document traversals. A cross-document Back — the
// browser reloads /reviews on the way back, e.g. mobile Safari with bfcache
// blocked by this page's persistent realtime WebSocket — never fires it, which
// silently skipped restoration (Bug #17). Navigation Timing records exactly that
// case: the fresh document's navigation entry has type 'back_forward'. That flag
// describes the DOCUMENT's initial load, so it is consumed on first read — later
// SPA mounts of /reviews inside the same document must rely on popstate alone,
// otherwise a plain TikNav push-visit would masquerade as a Back.
let navTimingConsumed = false
const isBackForwardMount = () => {
  if (lastPopStateAt > 0 && Date.now() - lastPopStateAt < 5000) return true
  if (navTimingConsumed) return false
  navTimingConsumed = true
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav?.type === 'back_forward'
  } catch { return false }
}
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

/* ─── TikTok Bottom Nav ─── */
function TikNav({ tab, setTab, userId, unreadCount = 0 }: { tab: string; setTab: (t: string) => void; userId: string | null; unreadCount?: number }) {
  const { t } = useTranslation()
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur border-t border-gray-800 flex items-center h-[60px]">
      {/* App Home — TappyAI has exactly one Home: the AI Chat home at "/". Reviews never redefines it. */}
      <Link href="/" className="flex-1 flex flex-col items-center gap-0.5 py-1 text-gray-500">
        <Home size={24} /><span className="text-[10px]">{t('reviews.navHome')}</span>
      </Link>
      {[
        { id: 'home', icon: <Compass size={24} />, label: t('reviews.navDiscover') },
        { id: 'explore', icon: <Search size={24} />, label: t('reviews.navSearch') },
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
        <span className="relative">
          <Bell size={24} />
          {unreadCount > 0 && (
            // key on the value so the badge re-mounts and re-pops each time the
            // count changes (tailwindcss-animate is already enabled app-wide).
            <span key={unreadCount}
              className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#fe2c55] text-white text-[9px] font-bold leading-none flex items-center justify-center ring-2 ring-black animate-in zoom-in-50 duration-200"
              aria-label={t('reviews.navInbox')}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        <span className="text-[10px]">{t('reviews.navInbox')}</span>
      </button>
      <button onClick={() => setTab('profile')} className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === 'profile' ? 'text-white' : 'text-gray-500'}`}>
        <User size={24} /><span className="text-[10px]">{t('reviews.navProfile')}</span>
      </button>
    </div>
  )
}

/* ─── Desktop sidebar ─── */
function Sidebar({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const { t } = useTranslation()
  return (
    <aside className="hidden md:flex flex-col w-[240px] xl:w-[260px] fixed left-[max(0px,calc(50vw-500px))] top-0 h-screen py-6 px-4 gap-1 border-r border-gray-800">
      {/* Logo returns to the app's single Home (AI Chat at "/") */}
      <Link href="/" className="text-white font-black text-2xl px-3 mb-4 block">TappyAI</Link>
      {/* App Home — TappyAI has exactly one Home: the AI Chat home at "/". Reviews never redefines it. */}
      <Link href="/" className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-[15px] font-medium text-gray-300 hover:bg-white/5 transition-colors">
        <Home size={22} />{t('reviews.navHome')}
      </Link>
      {[
        { id: 'home', icon: <Compass size={22} />, label: t('reviews.navDiscover') },
        { id: 'explore', icon: <Search size={22} />, label: t('reviews.navSearch') },
        { id: 'profile', icon: <User size={22} />, label: t('reviews.navProfileAndPosts') },
      ].map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-xl text-[15px] font-${tab === item.id ? 'bold text-white bg-white/10' : 'medium text-gray-300 hover:bg-white/5'} transition-colors`}>
          {item.icon}{item.label}
        </button>
      ))}
      <Link href="/reviews/new" className="mt-4 mx-1 bg-[#fe2c55] hover:bg-[#ef2950] text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
        <Plus size={18} />{t('reviews.sidebarPost')}
      </Link>
    </aside>
  )
}

/* ─── Notification row ─── */
function NotifRow({ g, onNav }: { g: GroupedNotif; onNav: () => void }) {
  const { t } = useTranslation()
  const color = NOTIF_COLOR[g.type] || '#666'
  const [followed, setFollowed] = useState(false)
  const notifRouter = useRouter()
  const actors = g.actors.slice(0, 3)
  const actorLabel = g.actors.length === 1
    ? g.actors[0].name
    : g.actors.length === 2
    ? t('reviews.notifTwoActors', { a: g.actors[0].name, b: g.actors[1].name })
    : t('reviews.notifManyActors', { a: g.actors[0].name, b: g.actors[1]?.name ?? '', n: String(g.actors.length - 2) })

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
          {g.type === 'like' ? t('reviews.notifLiked') : g.type === 'follow' ? t('reviews.notifFollowed') : t('reviews.notifCommented')}
        </span>
      </p>
      {g.type === 'comment' && g.comment_body && (
        <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">&quot;{g.comment_body}&quot;</p>
      )}
      <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at, t)}</p>
    </div>
  )

  const rowBase = "flex items-center px-4 py-3.5 border-l-[3px] active:bg-gray-900/40 transition-colors"

  const handleReviewNav = () => {
    const match = g.url?.match(/\/reviews\/([0-9a-f-]{36})/i)
    const reviewId = match?.[1]
    if (reviewId) {
      notifRouter.push('/reviews/' + reviewId)
    } else {
      onNav()
    }
  }

  if (g.type === 'profile_view') {
    return (
      <div className={rowBase} style={{ borderColor: color }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 mr-3" style={{ background: `${color}22` }}>
          <User size={20} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm"><span className="font-bold">{g.count}</span> {t('reviews.notifProfileViews')}</p>
          <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at, t)}</p>
        </div>
        <button className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ml-2" style={{ background: `${color}22`, color }}>{t('reviews.notifSeeWho')}</button>
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
          {followed ? t('reviews.followed') : t('reviews.followBack')}
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
function InboxTab({ notifs, notifsLoading, notifsError, hotPlaces, hotPlacesLoading, onSetTab, onFeedTypeChange, userPrefs }: {
  notifs: Notification[]
  notifsLoading: boolean
  notifsError: boolean
  hotPlaces: HotPlace[]
  hotPlacesLoading: boolean
  onSetTab: (t: string) => void
  onFeedTypeChange: (ft: 'for-you' | 'following') => void
  userPrefs: UserPreferences | null
}) {
  const { t } = useTranslation()
  const grouped = groupNotifs(notifs)
  const prefStyles = userPrefs?.preferred_style ?? []
  const bannerSubtext = prefStyles.length > 0
    ? t('reviews.bannerPersonalized', { styles: prefStyles.slice(0, 2).join(', ') })
    : t('reviews.bannerDefault')
  const bySection = new Map<string, GroupedNotif[]>()
  for (const g of grouped) {
    const s = notifSection(g.created_at)
    if (!bySection.has(s)) bySection.set(s, [])
    bySection.get(s)!.push(g)
  }
  const sectionLabel: Record<string, string> = {
    'VỪA XONG': t('reviews.sectionJustNow'),
    'HÔM NAY': t('reviews.sectionToday'),
    'TUẦN NÀY': t('reviews.sectionThisWeek'),
  }
  const sections = ['VỪA XONG', 'HÔM NAY', 'TUẦN NÀY'].filter(l => bySection.has(l)).map(l => ({ label: l, items: bySection.get(l)! }))

  return (
    <div className="h-dvh flex flex-col bg-black overflow-hidden">
      <div className="flex-shrink-0 pt-14 px-4 pb-3 border-b border-gray-800">
        <h2 className="text-white font-bold text-lg">{t('reviews.notificationsTitle')}</h2>
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
                  <p className="font-semibold text-xs mb-0.5" style={{ color: '#ff6b35' }}>{t('reviews.bannerTitle')}</p>
                  <p className="text-white text-sm leading-snug">{bannerSubtext}</p>
                </div>
                <ChevronRight size={16} className="text-gray-500 flex-shrink-0" />
              </button>
            </div>

            {/* Hot places row */}
            {!hotPlacesLoading && hotPlaces.length > 0 && (
              <div className="mb-1">
                <p className="text-gray-500 text-[10px] font-bold px-4 pt-4 pb-2 tracking-widest">{t('reviews.hotNearYou')}</p>
                <div className="flex gap-3 px-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                  {hotPlaces.map((p, i) => (
                    <button key={p.place_name} onClick={() => onSetTab('explore')}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gray-800"
                        style={i === 0 ? { boxShadow: '0 0 0 2px #ff6b35' } : {}}>
                        <span className="text-2xl">🍽️</span>
                      </div>
                      <p className="text-white text-[10px] text-center font-medium leading-tight line-clamp-2" style={{ width: 64 }}>{p.place_name}</p>
                      <p className="text-gray-500 text-[9px]">{t('reviews.hotCount', { n: String(p.count) })}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications grouped by section */}
            {notifsError ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <AlertCircle size={40} className="opacity-30" />
                <p className="text-sm">{t('reviews.notifsLoadError')}</p>
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <Bell size={40} className="opacity-30" />
                <p className="text-sm">{t('reviews.notifsEmpty')}</p>
              </div>
            ) : sections.length === 0 ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <Bell size={40} className="opacity-30" />
                <p className="text-sm">{t('reviews.notifsNoNew')}</p>
              </div>
            ) : (
              sections.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-gray-500 text-[10px] font-bold px-4 pt-4 pb-1.5 tracking-widest">{sectionLabel[label] ?? label}</p>
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
  const { t } = useTranslation()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [feedError, setFeedError] = useState(false)
  // Index of the slide currently in view — only this one (± 1) mounts a <video>.
  const [activeIndex, setActiveIndex] = useState(0)
  // Bug #8: decide ONCE, at first render, whether this mount follows a Back/Forward
  // traversal. popstate has already fired by now on a traversal; re-checking later
  // would be sensitive to how long the feed fetch took.
  const isBackNavRef = useRef<boolean | null>(null)
  if (isBackNavRef.current === null) isBackNavRef.current = isBackForwardMount()
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
  const [feedType, setFeedType] = useState<'for-you' | 'latest' | 'following'>(() => {
    // Bug #8: on a Back/Forward return, restore the feed the user was on so the
    // saved clip is present to scroll to. Fresh visits keep the default.
    if (typeof window === 'undefined' || !isBackNavRef.current) return 'for-you'
    try {
      const raw = sessionStorage.getItem(RETURN_KEY)
      if (raw) {
        const ft = JSON.parse(raw).feedType
        if (ft === 'for-you' || ft === 'latest' || ft === 'following') return ft
      }
    } catch { /* private mode / bad JSON — fall through to default */ }
    return 'for-you'
  })
  const [city, setCity] = useState('')
  const [topHashtags, setTopHashtags] = useState<string[]>([])
  const cityRef = useRef(city)
  const topHashtagsRef = useRef(topHashtags)
  cityRef.current = city
  topHashtagsRef.current = topHashtags
  // Bug #8: mirror live values so the unmount handler can snapshot the exact clip
  // and feed the user is leaving from (a cleanup closure captures stale mount-time
  // values otherwise).
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex
  const reviewsRef = useRef(reviews)
  reviewsRef.current = reviews
  const feedTypeRef = useRef(feedType)
  feedTypeRef.current = feedType
  const abortRef = useRef<AbortController | null>(null)
  const fetchRef = useRef<(p: number, append: boolean, ft: 'for-you' | 'latest' | 'following', signal?: AbortSignal) => Promise<void>>(null as any)
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [soundTrackId, setSoundTrackId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [notifsLoading, setNotifsLoading] = useState(false)
  const [notifsError, setNotifsError] = useState(false)
  const [hotPlaces, setHotPlaces] = useState<HotPlace[]>([])
  const [hotPlacesLoading, setHotPlacesLoading] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const hasMore = useRef(true)
  const supabase = createClient()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Review[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // User search state
  const [searchMode, setSearchMode] = useState<'review' | 'user'>('review')
  const [userResults, setUserResults] = useState<{ id: string; full_name: string | null; avatar_url: string | null; follower_count: number; following_count: number; is_following: boolean }[]>([])
  const [userSearching, setUserSearching] = useState(false)
  const [userSearchError, setUserSearchError] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)).catch(() => {})
  }, [supabase])
  useEffect(() => {
    if (!me) return
    let cancelled = false
    getUserPreferences(me).then(p => { if (!cancelled) setUserPrefs(p) }).catch(() => {})

    const cityP = supabase.from('reviews').select('place_address').eq('user_id', me).order('created_at', { ascending: false }).limit(5).then(({ data }) => {
      const candidates = (data || []).map(r => r.place_address).filter(Boolean).map((a: string) => a.split(',').pop()?.trim() || '').filter(Boolean)
      if (candidates.length === 0) return
      const freq = new Map<string, number>()
      for (const c of candidates) freq.set(c, (freq.get(c) || 0) + 1)
      if (!cancelled) setCity(Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0][0])
    }, () => {})

    const hashP = supabase.from('review_interactions').select('review_id').eq('user_id', me).order('created_at', { ascending: false }).limit(20).then(async ({ data: interData }) => {
      try {
        const ids = (interData || []).map(r => r.review_id as string)
        if (ids.length === 0) return
        const { data: hashData } = await supabase.from('reviews').select('hashtags').in('id', ids)
        const freq = new Map<string, number>()
        for (const row of hashData || []) for (const tag of row.hashtags || []) freq.set(tag, (freq.get(tag) || 0) + 1)
        if (!cancelled) setTopHashtags(Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t))
      } catch { /* best-effort personalization, degrade silently */ }
    }, () => {})

    // Re-fetch feed once with personalization signals after both settle (single call, not cascade)
    Promise.allSettled([cityP, hashP]).then(() => {
      if (cancelled) return
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      fetchRef.current(0, false, 'for-you', ac.signal)
    })

    return () => { cancelled = true }
  }, [me, supabase])

  // Unread badge — driven by Supabase Realtime, NOT polling. A postgres_changes
  // subscription on the four activity tables is used ONLY as a trigger: on any
  // relevant INSERT it refetches GET /api/notifications (the single source of
  // truth, which does the my-content join under RLS) and recomputes the unread
  // count vs the client-side "last seen" marker. No aggregation logic is
  // duplicated here. Over-broad events (e.g. a like on someone else's review) are
  // harmless — the refetch simply returns my unchanged notifications.
  // Requires the migration adding these tables to the supabase_realtime
  // publication; until it runs, the badge still loads once but won't live-update.
  useEffect(() => {
    if (!me) { setUnreadCount(0); return }
    let cancelled = false
    const recount = async () => {
      try {
        const r = await fetch('/api/notifications')
        if (!r.ok || cancelled) return
        const d = await r.json()
        const seen = new Date(localStorage.getItem(NOTIF_SEEN_KEY) || 0).getTime()
        const unread = (d.notifications as Notification[] || []).filter(n => new Date(n.created_at).getTime() > seen).length
        if (!cancelled) setUnreadCount(unread)
      } catch { /* keep the previous count on a transient failure */ }
    }
    recount() // initial load

    // Coalesce bursts (a like can also mint a milestone in the same moment).
    let debounce: ReturnType<typeof setTimeout> | null = null
    const trigger = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(recount, 300) }

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'review_likes' }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'review_comments' }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_follows', filter: `following_id=eq.${me}` }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'review_milestones' }, trigger)
      .subscribe()

    // Not polling: a one-shot catch-up when the tab regains focus, in case the
    // realtime socket dropped while the app was backgrounded.
    const onWake = () => { if (document.visibilityState === 'visible') recount() }
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)

    return () => {
      cancelled = true
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  // Load notifications + hot places when inbox tab opens
  useEffect(() => {
    if (tab !== 'inbox') return
    // Opening the Inbox marks everything up to now as seen and clears the badge
    // (client-side only — no server read state).
    try { localStorage.setItem(NOTIF_SEEN_KEY, new Date().toISOString()) } catch { /* private mode */ }
    setUnreadCount(0)
    setNotifsLoading(true)
    setNotifsError(false)
    fetch('/api/notifications')
      .then(r => { if (!r.ok) throw new Error('notifs_failed'); return r.json() })
      .then(d => setNotifs(d.notifications || []))
      .catch(() => setNotifsError(true))
      .finally(() => setNotifsLoading(false))
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
          if (name && !isShareOnlyName(name)) counts.set(name, (counts.get(name) || 0) + 1)
        }
        setHotPlaces(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([place_name, count]) => ({ place_name, count })))
      } catch {
        // Best-effort personalization row — degrade silently, section just won't render (no misleading empty-state message exists for it)
      } finally {
        setHotPlacesLoading(false)
      }
    })()
  }, [tab])

  const fetch_ = useCallback(async (p: number, append = false, ft: 'for-you' | 'latest' | 'following' = 'for-you', signal?: AbortSignal) => {
    let url = `/api/reviews/feed?page=${p}&limit=12`
    if (ft === 'for-you') {
      const c = cityRef.current
      url += `&sort=trending${c ? `&city=${encodeURIComponent(c)}` : ''}`
    } else if (ft === 'latest') {
      url += '&sort=latest'
    } else {
      url += '&sort=latest&following=true'
    }
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error('feed_failed')
      const data = await res.json()
      const ht = topHashtagsRef.current
      let rows: Review[] = (data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false }))
      if (ft === 'for-you' && ht.length > 0) {
        rows = [...rows].sort((a, b) => {
          const sa = (a.hashtags || []).filter(t => ht.includes(t)).length
          const sb = (b.hashtags || []).filter(t => ht.includes(t)).length
          return sb - sa
        })
      }
      if (signal?.aborted) return
      setReviews(prev => append ? [...prev, ...rows] : rows)
      hasMore.current = rows.length >= 12
      if (!append) setFeedError(false)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      if (append) {
        hasMore.current = true
      } else {
        setReviews([])
        setFeedError(true)
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])
  fetchRef.current = fetch_

  useEffect(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    fetch_(0, false, feedType, ac.signal)
    return () => ac.abort()
  }, [fetch_, feedType])

  const handleFeedTypeChange = (ft: 'for-you' | 'latest' | 'following') => {
    if (ft === feedType) return
    setFeedType(ft)
    setLoading(true)
    pageRef.current = 0
    hasMore.current = true
    setActiveIndex(0)
  }

  // Desktop has no swipe — scroll one slide up/down via on-screen arrows.
  // Uses instant scroll: with scroll-snap-type: mandatory a programmatic *smooth*
  // scroll is cancelled (the container re-snaps to the current slide before the
  // animation advances), so we jump to the neighbouring slide and let snap align it.
  const scrollFeed = (dir: 1 | -1) => {
    const c = containerRef.current
    if (!c) return
    const cur = Math.round(c.scrollTop / c.clientHeight)
    const next = Math.max(0, Math.min(reviews.length - 1, cur + dir))
    c.scrollTo({ top: next * c.clientHeight, behavior: 'auto' })
    setActiveIndex(next) // update immediately so the arrows' disabled state + video window track it
  }

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); setSearchError(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reviews/feed?search=${encodeURIComponent(q)}&limit=20`)
        if (!res.ok) throw new Error('search_failed')
        const data = await res.json()
        setSearchResults((data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false })))
        setSearchError(false)
        track('review_search', { query: q })
      } catch {
        setSearchResults([])
        setSearchError(true)
      } finally { setSearching(false) }
    }, 400)
  }, [])

  // User search
  const doUserSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setUserResults([]); setUserSearchError(false); return }
    setUserSearching(true)
    try {
      const res = await fetch('/api/users/search?q=' + encodeURIComponent(q))
      if (!res.ok) throw new Error('user_search_failed')
      const d = await res.json()
      setUserResults(d.users || [])
      setUserSearchError(false)
    } catch {
      setUserResults([])
      setUserSearchError(true)
    } finally { setUserSearching(false) }
  }, [])

  const toggleFollow = async (targetId: string) => {
    if (!me) { window.location.href = '/login?returnTo=' + encodeURIComponent('/reviews'); return }
    setUserResults(prev => prev.map(u => u.id === targetId
      ? { ...u, is_following: !u.is_following, follower_count: u.follower_count + (u.is_following ? -1 : 1) }
      : u))
    const res = await fetch(`/api/users/${targetId}/follow`, { method: 'POST' })
    if (res.ok) {
      const d = await res.json()
      setUserResults(prev => prev.map(u => u.id === targetId ? { ...u, is_following: d.following, follower_count: d.follower_count } : u))
    } else {
      // revert — undo the optimistic delta. u.is_following here is the ALREADY-
      // flipped (optimistic) value, so the sign must match the optimistic line
      // above (? -1 : 1), not its inverse. (Bug: it was ? 1 : -1, which pushed
      // the count 2 further off — a failed follow read 12 instead of back to 10.)
      setUserResults(prev => prev.map(u => u.id === targetId
        ? { ...u, is_following: !u.is_following, follower_count: u.follower_count + (u.is_following ? -1 : 1) }
        : u))
    }
  }

  // Infinite scroll + active-slide tracking (drives which slide mounts a <video>)
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onScroll = () => {
      // Each slide is exactly one viewport tall (h-dvh + snap), so the active
      // index is simply how many viewports we've scrolled. Only setState when it
      // actually changes so we don't re-render the whole feed on every scroll tick.
      const idx = Math.round(c.scrollTop / c.clientHeight)
      setActiveIndex(prev => (prev === idx ? prev : idx))
      if (hasMore.current && c.scrollTop + c.clientHeight >= c.scrollHeight - c.clientHeight * 0.5) {
        hasMore.current = false
        pageRef.current += 1
        fetch_(pageRef.current, true, feedType)
      }
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    return () => c.removeEventListener('scroll', onScroll)
  }, [loading, fetch_, feedType])

  // Bug #8: on leaving the feed (e.g. tapping into an author's profile) remember the
  // active clip so a Back return can restore it. Written on unmount from refs so it
  // reflects the last-viewed clip no matter how the user navigated away.
  useEffect(() => {
    return () => {
      try {
        const r = reviewsRef.current[activeIndexRef.current]
        if (r) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ clipId: r.id, feedType: feedTypeRef.current }))
      } catch { /* private mode / quota — restore simply won't happen */ }
    }
  }, [])

  // Bug #8: after the feed loads on a Back/Forward return, scroll to the saved clip
  // by ID (index is unreliable — "trending" re-orders between fetches) and mark it
  // active so the correct <video> plays. Runs once per mount; clears the marker on a
  // successful restore.
  const didRestoreRef = useRef(false)
  useEffect(() => {
    if (didRestoreRef.current) return
    if (loading || reviews.length === 0) return
    didRestoreRef.current = true // one attempt per mount, success or not
    try {
      if (!isBackNavRef.current) return
      const raw = sessionStorage.getItem(RETURN_KEY)
      if (!raw) return
      const { clipId, feedType: savedFeedType } = JSON.parse(raw)
      if (savedFeedType && savedFeedType !== feedType) return // a different feed loaded
      const idx = reviews.findIndex(r => r.id === clipId)
      if (idx <= 0) return // 0 = already the top slide, -1 = clip not in this page → keep top
      const c = containerRef.current
      if (!c) return
      c.scrollTo({ top: idx * c.clientHeight, behavior: 'auto' })
      setActiveIndex(idx)
      sessionStorage.removeItem(RETURN_KEY) // remove after a successful restore
    } catch { /* private mode / bad JSON — leave the feed at the top */ }
  }, [loading, reviews, feedType])

  // Anonymous visitors can browse the feed but not interact — send them to login
  // (with a returnTo) the moment they try to like / save / follow / comment.
  const requireLogin = () => {
    if (me) return false
    window.location.href = '/login?returnTo=' + encodeURIComponent('/reviews')
    return true
  }

  const like = async (id: string) => {
    if (requireLogin()) return
    const r = reviews.find(r => r.id === id)
    // Validate the response before mutating counts — a 401/500 (or non-JSON
    // error page) previously left `liked` undefined and DECREMENTED the count.
    let liked: boolean
    try {
      const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data.liked !== 'boolean') return
      liked = data.liked
    } catch { return }
    setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: liked, like_count: Math.max(0, r.like_count + (liked ? 1 : -1)) } : r))
    track('review_like', { review_id: id, place: r?.place_name, liked })
    if (liked && me) {
      logUserEvent(me, 'like', { review_id: id })
      const count = parseInt(localStorage.getItem('tappy_like_count') || '0') + 1
      localStorage.setItem('tappy_like_count', String(count))
      if (count % 5 === 0) inferPreferencesFromEvents(me)
    }
  }
  // Double-tap like: like-only (never unlikes) + OPTIMISTIC with rollback, so
  // the heart/count react instantly. The right-rail heart keeps the plain
  // toggle `like`. Caller only invokes this when the post isn't already liked.
  const likeOnly = async (id: string) => {
    if (requireLogin()) return
    const cur = reviews.find(r => r.id === id)
    if (!cur || cur.liked_by_me) return
    setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: true, like_count: r.like_count + 1 } : r))
    track('review_like', { review_id: id, place: cur.place_name, liked: true })
    if (me) {
      logUserEvent(me, 'like', { review_id: id })
      const count = parseInt(localStorage.getItem('tappy_like_count') || '0') + 1
      localStorage.setItem('tappy_like_count', String(count))
      if (count % 5 === 0) inferPreferencesFromEvents(me)
    }
    try {
      const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('like failed')
      const data = await res.json()
      // Server toggled OFF (it was already liked server-side) → reconcile to truth.
      if (data.liked === false) {
        setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: false, like_count: Math.max(0, r.like_count - 1) } : r))
      }
    } catch {
      // rollback the optimistic like
      setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: false, like_count: Math.max(0, r.like_count - 1) } : r))
    }
  }
  const save = async (id: string) => {
    if (requireLogin()) return
    let saved: boolean
    try {
      const res = await fetch(`/api/reviews/${id}/save`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data.saved !== 'boolean') return
      saved = data.saved
    } catch { return }
    setReviews(p => p.map(r => r.id === id ? { ...r, saved_by_me: saved } : r))
    track('place_save', { review_id: id })
  }
  const del = (id: string) => setReviews(p => p.filter(r => r.id !== id))
  const addComment = (id: string, count: number) => setReviews(p => p.map(r => r.id === id ? { ...r, comment_count: count } : r))

  const handleShare = (r: Review) => {
    setShareOf(r)
    track('review_share', { review_id: r.id, place: r.place_name })
  }

  return (
    <div className="bg-black h-dvh overflow-hidden flex">
      <Sidebar tab={tab} setTab={handleSetTab} />

      {/* Content */}
      <div className="flex-1 md:ml-[240px] xl:ml-[260px] flex justify-center">
        <div className="w-full max-w-container-compact relative">

          {/* Home Feed */}
          {tab === 'home' && (
            loading
              ? <div className="h-dvh flex items-center justify-center"><Loader2 size={28} className="text-white animate-spin" /></div>
              : feedError
              ? <div className="h-dvh flex flex-col items-center justify-center text-white gap-3">
                  <AlertCircle size={36} className="opacity-60" />
                  <p className="font-semibold">{t('reviews.feedLoadError')}</p>
                </div>
              : reviews.length === 0
              ? <div className="h-dvh flex flex-col items-center justify-center text-white gap-3">
                  <p className="text-4xl">{feedType === 'following' ? '👥' : '📸'}</p>
                  <p className="font-semibold">{feedType === 'following' ? t('reviews.feedEmptyFollowing') : t('reviews.feedEmpty')}</p>
                  {feedType === 'following'
                    ? <button onClick={() => handleFeedTypeChange('for-you')} className="bg-white text-black px-6 py-2.5 rounded-full font-semibold">{t('reviews.seeForYou')}</button>
                    : feedType === 'latest'
                    ? <button onClick={() => handleFeedTypeChange('for-you')} className="bg-white text-black px-6 py-2.5 rounded-full font-semibold">{t('reviews.seeForYou')}</button>
                    : <Link href="/reviews/new" className="bg-[#fe2c55] text-white px-6 py-2.5 rounded-full font-semibold">{t('reviews.postNow')}</Link>}
                </div>
              : <>
                  <div ref={containerRef} className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                    {reviews.map((r, i) => <Post key={r.id} r={r} me={me} feedType={feedType} renderVideo={Math.abs(i - activeIndex) <= 1} active={i === activeIndex} onFeedTypeChange={handleFeedTypeChange} onLike={like} onLikeDouble={likeOnly} onSave={save} onComment={setCommentOf} onShare={handleShare} onDelete={del} onSoundTap={setSoundTrackId} />)}
                  </div>
                  {/* Desktop prev/next — no swipe on desktop, so surface arrows to the right of the column. */}
                  <div className="hidden md:flex flex-col gap-3 absolute left-full ml-4 top-1/2 -translate-y-1/2 z-20">
                    <button onClick={() => scrollFeed(-1)} disabled={activeIndex <= 0} aria-label={t('reviews.prevPost')}
                      className="w-11 h-11 rounded-full bg-gray-800/90 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors">
                      <ChevronUp size={22} />
                    </button>
                    <button onClick={() => scrollFeed(1)} disabled={activeIndex >= reviews.length - 1} aria-label={t('reviews.nextPost')}
                      className="w-11 h-11 rounded-full bg-gray-800/90 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors">
                      <ChevronDown size={22} />
                    </button>
                  </div>
                </>
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
                    placeholder={searchMode === 'review' ? t('reviews.searchPlaceholderReview') : t('reviews.searchPlaceholderUser')}
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchResults([]); setUserResults([]); setSearchError(false); setUserSearchError(false) }}>
                      <X size={16} className="text-gray-500" />
                    </button>
                  )}
                </div>
                {/* Segmented control */}
                <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
                  <button onClick={() => { setSearchMode('review'); setUserResults([]); if (searchQuery) doSearch(searchQuery) }} className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors ${searchMode === 'review' ? 'bg-white text-black' : 'text-gray-400'}`}>{t('reviews.searchModePlaces')}</button>
                  <button onClick={() => { setSearchMode('user'); setSearchResults([]); if (searchQuery) doUserSearch(searchQuery) }} className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors ${searchMode === 'user' ? 'bg-white text-black' : 'text-gray-400'}`}>{t('reviews.searchModeUsers')}</button>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto">
                {searchMode === 'review' && searching && (
                  <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>
                )}
                {searchMode === 'review' && !searching && searchQuery && searchError && (
                  <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                    <AlertCircle size={36} className="opacity-20" />
                    <p className="text-sm">{t('reviews.searchError')}</p>
                  </div>
                )}
                {searchMode === 'review' && !searching && !searchError && searchQuery && searchResults.length === 0 && (
                  <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                    <Search size={36} className="opacity-20" />
                    <p className="text-sm">{t('reviews.searchNoResults', { q: searchQuery })}</p>
                  </div>
                )}
                {searchMode === 'review' && !searching && searchResults.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-xs px-4 py-3">{t('reviews.searchResultCount', { n: String(searchResults.length) })}</p>
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
                    <p className="text-sm">{t('reviews.searchHintReview')}</p>
                  </div>
                )}
                {/* User search results */}
                {searchMode === 'user' && <>
                  {userSearching && <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>}
                  {!userSearching && searchQuery && userSearchError && (
                    <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                      <AlertCircle size={36} className="opacity-20" />
                      <p className="text-sm">{t('reviews.searchError')}</p>
                    </div>
                  )}
                  {!userSearching && !userSearchError && searchQuery && userResults.length === 0 && (
                    <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                      <User size={36} className="opacity-20" />
                      <p className="text-sm">{t('reviews.userSearchNoResults')}</p>
                    </div>
                  )}
                  {!userSearching && userResults.length > 0 && (
                    <div className="divide-y divide-gray-800">
                      {userResults.map(u => {
                        const uname = u.full_name || t('reviews.anonymous')
                        return (
                          <Link key={u.id} href={`/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors">
                            {u.avatar_url
                              ? <Image src={u.avatar_url} alt={uname} width={44} height={44} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-bold">{uname[0]?.toUpperCase()}</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{uname}</p>
                              <p className="text-gray-500 text-xs">{t('reviews.userFollowStats', { followers: String(u.follower_count), following: String(u.following_count) })}</p>
                            </div>
                            <button onClick={e => { e.preventDefault(); toggleFollow(u.id) }} className={`text-xs font-semibold px-4 py-1.5 rounded-full flex-shrink-0 transition-colors ${u.is_following ? 'bg-gray-700 text-white' : 'bg-white text-black'}`}>{u.is_following ? t('reviews.following') : t('reviews.follow')}</button>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                  {!searchQuery && (
                    <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                      <User size={48} className="opacity-20" />
                      <p className="text-sm">{t('reviews.searchHintUser')}</p>
                    </div>
                  )}
                </>}
              </div>
            </div>
          )}

          {/* Profile (TikTok style) */}
          {tab === 'profile' && (
            me
              ? <ProfileTab userId={me} viewerId={me} />
              : <div className="h-dvh flex items-center justify-center">
                  <Link href="/login" className="text-[#fe2c55] text-sm font-semibold">{t('reviews.loginToViewProfile')}</Link>
                </div>
          )}

          {/* Inbox - notifications */}
          {tab === 'inbox' && (
            <InboxTab
              notifs={notifs}
              notifsLoading={notifsLoading}
              notifsError={notifsError}
              hotPlaces={hotPlaces}
              hotPlacesLoading={hotPlacesLoading}
              onSetTab={handleSetTab}
              onFeedTypeChange={handleFeedTypeChange}
              userPrefs={userPrefs}
            />
          )}
        </div>
      </div>

      <TikNav tab={tab} setTab={handleSetTab} userId={me} unreadCount={unreadCount} />

      {commentOf && <CommentDrawer review={commentOf} me={me} onClose={() => setCommentOf(null)} onAdded={addComment} />}
      {shareOf && <ShareModal review={shareOf} onClose={() => setShareOf(null)} />}
      {soundTrackId && <SoundSheet trackId={soundTrackId} onClose={() => setSoundTrackId(null)} />}
    </div>
  )
}
