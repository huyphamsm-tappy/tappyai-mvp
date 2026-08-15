'use client'

import { useEffect, useState, useCallback, useRef, useMemo, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react'
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
import LinkPoster from '@/components/LinkPoster'
import { ProfileTab } from './ProfileTab'
import { useNotifications } from '@/components/NotificationProvider'
import { getExploreSession, reportAuthState } from '@/lib/explore/webExploreSession'
import { mapDtoToInbox, groupNotifs, notifSection, isSocialGroup, NOTIF_COLOR, type InboxNotif, type GroupedNotif } from '@/lib/notifications/inbox'

// ADR-014: notifications now come from the app-level NotificationProvider (server
// `notifications` table + server-side read_at). No client `notifSeenAt` marker.
type Notification = InboxNotif
// Explore state restoration is owned by ExploreSession
// (docs/CANONICAL_EXPLORE_NAVIGATION_SPEC.md). Freeze happens on explicit
// departure intent, restore on Explore becoming visible — history events play
// no part (invariants I1/I4). The old history-event gating and the
// unmount-written storage marker are gone: they only protected paths that
// happened to push history AND unmount, which is exactly why My-Profile
// (router.replace + tab toggle) lost state (NAV-004).
interface HotPlace { place_name: string; count: number }
// GroupedNotif / NOTIF_COLOR / groupNotifs / notifSection moved to
// '@/lib/notifications/inbox' (unit-tested). Imported above.
// Icon + accent for non-social notification rows, keyed by category.
const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  social: { color: '#ff6b35', icon: '🎉' },
  deal: { color: '#F59E0B', icon: '🏷️' },
  explore: { color: '#8B5CF6', icon: '✨' },
  system: { color: '#64748B', icon: '🔔' },
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

  // ADR-014: non-social rows (milestone, deal, explore reminders, broadcast,
  // system) have no actor stack — render a generic icon + title + body row.
  // Must return before the actor-based derivations below (they index g.actors[0]).
  if (!isSocialGroup(g)) {
    const cat = CATEGORY_STYLE[g.category] ?? CATEGORY_STYLE.system
    const go = () => { if (g.url) notifRouter.push(g.url); else onNav() }
    return (
      <div role={g.url ? 'button' : undefined} onClick={go}
        className={'flex items-center px-4 py-3.5 border-l-[3px] active:bg-gray-900/40 transition-colors' + (g.url ? ' cursor-pointer' : '')}
        style={{ borderColor: cat.color }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 mr-3" style={{ background: `${cat.color}22` }}>
          <span className="text-xl">{cat.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm leading-snug font-semibold line-clamp-2">{g.title}</p>
          {g.text && <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{g.text}</p>}
          <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at, t)}</p>
        </div>
      </div>
    )
  }

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
  // ExploreSession — the single owner of Explore navigation state (spec I2).
  // Entering here (any way: fresh visit, Back, tab return) moves the session to
  // RESTORING when a valid snapshot exists; restore() runs once the feed loads.
  const sessionRef = useRef<ReturnType<typeof getExploreSession> | null>(null)
  if (sessionRef.current === null && typeof window !== 'undefined') {
    // Render-phase init (not an effect) so the tab/feedType/searchQuery lazy
    // initializers below already see the adopted snapshot state (§3.1: query
    // shape restored BEFORE the first fetch). Guarded by the ref, so it runs
    // once per mount; never on the server (the singleton must not exist there).
    sessionRef.current = getExploreSession()
    sessionRef.current.enterExplore()
  }
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'home'
    // URL is a transport echo (?tab=) and wins when present; else the session's
    // frozen tab (replaces the legacy sessionStorage tab side-channel, L8/L11).
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    if (fromUrl) return fromUrl
    return sessionRef.current?.getState().tab ?? 'home'
  })
  // Single signal path for EVERY tab transition — direct taps AND history
  // traversals across ?tab= states (spec v1.1 §8/DFR-001: a traversal is
  // transport; the tab transition is the business signal). Order matters on
  // entry: enterExplore FIRST (adopting a held snapshot replaces live state
  // wholesale, §3.1), THEN record the tab being entered.
  const applyTabTransition = useCallback((from: string, to: string) => {
    const s = sessionRef.current
    if (!s || to === from) return
    if (to === 'home') {
      // Returning to the feed tab = an Explore entry (BT-02/BT-02b): the
      // session moves to RESTORING and the restore effect resolves it against
      // the already-loaded feed.
      s.enterExplore()
      s.setQueryShape({ tab: to })
    } else if (from === 'home') {
      // Leaving the feed — freeze FIRST, at the moment of intent (I3: this
      // path unmounts nothing — exactly what the legacy marker missed, NAV-004).
      s.leaveExplore('tab-switch')
      s.setQueryShape({ tab: to })
    } else {
      s.setQueryShape({ tab: to }) // non-feed → non-feed: no freeze/restore involved
    }
  }, [])
  // URL echo → tab state. First run only seeds the prev-param marker (mount
  // already resolved the tab); afterwards a CHANGED ?tab= means a history
  // traversal (Back/Forward, BT-02b) — route it through the same signals as a
  // tap. A traversal that REMOVES the param (back to a bare /reviews entry)
  // means the feed tab.
  const prevTabParamRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const fromUrl = searchParams?.get('tab') ?? null
    const prev = prevTabParamRef.current
    prevTabParamRef.current = fromUrl
    if (prev === undefined) return // initial echo — tab state already derived at mount
    if (fromUrl === prev) return
    const target = fromUrl ?? 'home'
    if (target === tab) return
    applyTabTransition(tab, target)
    setTab(target)
  }, [searchParams, tab, applyTabTransition])
  const handleSetTab = useCallback((t: string) => {
    if (t === tab) return // re-click of the current tab: no transition, no session signal
    applyTabTransition(tab, t)
    setTab(t)
    const url = window.location.pathname + '?tab=' + t
    // DFR-001/BT-02b: entering My Profile from the feed PUSHES a history entry
    // so browser/system Back returns to the feed clip. Every other transition
    // stays replace (v1.1 scope; search/inbox semantics unchanged).
    if (t === 'profile' && tab === 'home') router.push(url, { scroll: false })
    else router.replace(url, { scroll: false })
  }, [router, tab, applyTabTransition])
  const [feedType, setFeedType] = useState<'for-you' | 'latest' | 'following'>(() => {
    // Query shape is restored from the session BEFORE the first fetch (spec
    // §3.1), so the saved clip exists in the loaded feed. Fresh visits default.
    const ft = sessionRef.current?.getState().feedType
    return ft === 'for-you' || ft === 'latest' || ft === 'following' ? ft : 'for-you'
  })
  const [city, setCity] = useState('')
  const [topHashtags, setTopHashtags] = useState<string[]>([])
  const cityRef = useRef(city)
  const topHashtagsRef = useRef(topHashtags)
  cityRef.current = city
  topHashtagsRef.current = topHashtags
  // reviewsRef (L14 — KEPT): mirrors the live rows for non-render consumers —
  // the scroll reporter and the visibility re-enter path read the current feed
  // without re-binding their listeners. L13 activeIndexRef stays gone (its only
  // reader was the legacy unmount marker). feedTypeRef, removed in M5 as
  // orphaned, is REINTRODUCED with a new consumer: the personalization refetch
  // guard (Item 2 — the refetch personalizes For-You only and must not replace
  // a restored non-For-You feed's rows, BT-12).
  const reviewsRef = useRef(reviews)
  reviewsRef.current = reviews
  const feedTypeRef = useRef(feedType)
  feedTypeRef.current = feedType
  const abortRef = useRef<AbortController | null>(null)
  const fetchRef = useRef<(p: number, append: boolean, ft: 'for-you' | 'latest' | 'following', signal?: AbortSignal) => Promise<void>>(null as any)
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [soundTrackId, setSoundTrackId] = useState<string | null>(null)
  // ADR-014: notifications + unread badge come from the app-level store.
  const { notifications, unreadCount, loading: notifsLoading, markAllRead } = useNotifications()
  const notifs = useMemo<Notification[]>(() => notifications.map(mapDtoToInbox), [notifications])
  const [hotPlaces, setHotPlaces] = useState<HotPlace[]>([])
  const [hotPlacesLoading, setHotPlacesLoading] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  // F10 gate: restore may not run until the identity is known, so a signed-out
  // return invalidates BEFORE any scroll is applied (BT-20), never after.
  const [authResolved, setAuthResolved] = useState(false)
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const hasMore = useRef(true)
  const supabase = createClient()

  // Search state — the query itself is session-owned business state (§2.1,
  // BT-11): lazy-init from the session so a restored entry repopulates the
  // search box; results are refetched by the mount effect below.
  const [searchQuery, setSearchQuery] = useState(() => sessionRef.current?.getState().query ?? '')
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
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setMe(uid)
      reportAuthState(uid) // F10: identity change invalidates the frozen session
      setAuthResolved(true)
    }).catch(() => setAuthResolved(true))
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
      // Item 2 guard: this refetch personalizes the FOR-YOU feed only. If the
      // session restored a different feed type (BT-12 'following'/'latest'),
      // replacing those rows with For-You rows would destroy the restored
      // state. The row REPLACEMENT itself is made position-safe by the
      // reconciliation effect below (id-first realign) — rows stay owned by
      // the fetch layer, position stays owned by ExploreSession (I2).
      if (feedTypeRef.current !== 'for-you') return
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      fetchRef.current(0, false, 'for-you', ac.signal)
    })

    return () => { cancelled = true }
  }, [me, supabase])

  // ADR-014: the unread badge + notification list are owned by the app-level
  // NotificationProvider (one Realtime subscription on `notifications`, correct on
  // every route). This page no longer runs its own badge fetch/subscription.

  // Opening the Inbox marks all notifications read (server-side) + loads hot places.
  useEffect(() => {
    if (tab !== 'inbox') return
    // Server-side read state (replaces the old client `notifSeenAt`).
    markAllRead()
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
      // Server-stated when available: Explore drops rows it cannot render, so a short
      // page no longer means "end of feed". Falls back to the old length test for any
      // response that predates the field.
      hasMore.current = typeof data.hasMore === 'boolean' ? data.hasMore : rows.length >= 12
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
    // Query shape is session-owned business state (§3.4). A held snapshot is
    // invalidated by the session itself (F3/BT-10) — never resurrected later.
    sessionRef.current?.setQueryShape({ feedType: ft })
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
    // Programmatic jumps must tell the session in the SAME tick. A native scroll
    // reports through the scroll handler before React re-renders, but this path
    // updates activeIndex first — the reconciliation effect below would then see
    // UI-vs-session disagreement and yank the feed straight back to the session's
    // clip, which made the desktop arrows (and wheel forwarding) look dead.
    sessionRef.current?.reportActiveItem({
      reviewId: reviews[next]?.id ?? null, index: next, scrollOffset: next * c.clientHeight,
    })
  }

  // Single write path for the query (I2): UI state and session state move
  // together. An empty box is `null` in ExploreState, never ''.
  const updateSearchQuery = (q: string) => {
    setSearchQuery(q)
    sessionRef.current?.setQueryShape({ query: q || null })
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

  // Follow an author from the feed's avatar "+" (WEB-EXPLORE-FOLLOW-002). Separate
  // from toggleFollow above, which owns the Search tab's userResults list: this one
  // flips is_following on every feed row by that author (the same creator can appear
  // on several slides) so all their "+" badges disappear together. Optimistic, with
  // a revert if the request fails; the server value wins on success.
  const followFromFeed = async (targetId: string) => {
    if (requireLogin()) return
    const setFollowing = (v: boolean) =>
      setReviews(prev => prev.map(r => (r.user_id === targetId ? { ...r, is_following: v } : r)))
    setFollowing(true)
    try {
      const res = await fetch(`/api/users/${targetId}/follow`, { method: 'POST' })
      if (!res.ok) throw new Error('follow_failed')
      const d = await res.json()
      setFollowing(!!d.following)
    } catch {
      setFollowing(false)
    }
  }

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
      // Report plain data into the session (§3.3) — the session never reads the
      // DOM (P4). A scroll arriving while the session is RESTORING marks user
      // input, so the user wins any restore race (F7/BT-25). Emits nothing.
      sessionRef.current?.reportActiveItem({ reviewId: reviewsRef.current[idx]?.id ?? null, index: idx, scrollOffset: c.scrollTop })
      if (hasMore.current && c.scrollTop + c.clientHeight >= c.scrollHeight - c.clientHeight * 0.5) {
        hasMore.current = false
        pageRef.current += 1
        fetch_(pageRef.current, true, feedType)
      }
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    return () => c.removeEventListener('scroll', onScroll)
  }, [loading, fetch_, feedType])

  // ── ExploreSession edges (spec §8, Web binding) ─────────────────────────
  // Departure signals: route-change (link-click capture on the page root +
  // App-Router segment teardown below), tab-switch (handleSetTab), background
  // (pagehide / tab hidden). Arrival signals: mount, feed-tab return,
  // pageshow / tab visible. History events play no part in any of them (I1/I4).
  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    // Re-enter after a freeze that had no real departure: dev StrictMode's
    // simulated remount, bfcache returns and tab-visible returns all land here.
    const reenter = () => {
      if (s.getPhase() !== 'frozen') return
      s.enterExplore()
      // Explore is still mounted with its feed already loaded — resolve the
      // restore immediately (the load-driven effect below has no changed deps
      // to fire on, BT-18). The UI never moved, so no scroll is applied.
      if (s.getPhase() === 'restoring' && reviewsRef.current.length > 0) {
        s.restore(reviewsRef.current.map(r => r.id))
      }
    }
    reenter()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') s.leaveExplore('background')
      else reenter()
    }
    const onPageHide = () => { s.leaveExplore('background') } // full-document teardown: reload, external nav, tab close
    const onPageShow = () => reenter() // bfcache return
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      // App-Router segment teardown is the only observable signal for
      // programmatic navigations this page doesn't own (router.push from a
      // child modal, auth redirects). Freeze is idempotent (I7): when a click /
      // tab / background signal already froze, this returns that same snapshot
      // and changes nothing. It reads no UI values — the state it seals was
      // reported continuously via reportActiveItem — so this is §8 signal
      // conversion, not a revival of the legacy L9 unmount marker.
      s.leaveExplore('route-change')
    }
  }, [])

  // Restore — spec §3.5 (replaces the legacy L10 marker effect). Runs when the
  // feed tab is visible with a loaded feed and the session is RESTORING — a
  // phase only enterExplore sets, never a history event (I4). `tab` is a
  // dependency because returning to the feed tab re-evaluates with zero
  // history entries (BT-02/I9); `authResolved` gates F10 ordering.
  useEffect(() => {
    const s = sessionRef.current
    if (!s || !authResolved || loading || reviews.length === 0 || tab !== 'home') return
    if (s.getPhase() !== 'restoring') return
    const result = s.restore(reviews.map(r => r.id))
    const idx = result.resolvedIndex
    if (idx === null || idx <= 0) return // top needs no scroll; every outcome was already reported by the session (I6)
    let tries = 0
    const apply = () => {
      const c = containerRef.current
      if (!c || c.clientHeight === 0) {
        // F11: container not measured yet — defer a frame, bounded retries.
        if (++tries <= 10) { requestAnimationFrame(apply); return }
        // Exhausted: the feed is rendering at the top — keep session = UI truth.
        s.reportActiveItem({ reviewId: reviews[0]?.id ?? null, index: 0, scrollOffset: 0 })
        return
      }
      c.scrollTo({ top: idx * c.clientHeight, behavior: 'auto' })
      setActiveIndex(idx)
    }
    apply()
  }, [authResolved, loading, reviews, feedType, tab])

  // UI ⇄ session position reconciliation. ExploreSession stays the single
  // owner of position (I2): the UI only reports via reportActiveItem and,
  // here, FOLLOWS the session when the rows change underneath it. This
  // replaces the old settled-slide echo, whose blind report was the second
  // half of the proven Scenario-A failure chain
  // (docs/web-sprint/EXPLORE_NAV_SCENARIO_A_EVIDENCE.md): the signed-in
  // personalization refetch REPLACED the rows post-restore, the video window
  // tracked a stale index, and the echo absorbed whatever id landed in the
  // stale slot — so the NEXT Back restored the wrong clip. Reconciliation is
  // id-first, same principle as restore (I5):
  //  - session id found in rows → align UI (scroll + video window) to its
  //    possibly-new index and re-report the SAME id;
  //  - session id gone from the rows (F1/F2 shape) → hold the slot, adopt that
  //    slot's id through the sanctioned write path;
  //  - session id null (fresh feed, never scrolled) → report the settled slide
  //    so leaving Clip 0 still freezes an id (I5).
  useEffect(() => {
    const s = sessionRef.current
    if (!s || loading || reviews.length === 0 || tab !== 'home') return
    if (s.getPhase() === 'restoring') return // the restore effect owns entry alignment
    const c = containerRef.current
    const wanted = s.getState().activeReviewId
    if (wanted === null) {
      s.reportActiveItem({ reviewId: reviews[activeIndex]?.id ?? null, index: activeIndex, scrollOffset: c?.scrollTop ?? 0 })
      return
    }
    if (reviews[activeIndex]?.id === wanted) return // aligned: append, stable order, or normal user scroll
    const newIdx = reviews.findIndex(r => r.id === wanted)
    if (newIdx >= 0) {
      if (c) c.scrollTo({ top: newIdx * c.clientHeight, behavior: 'auto' })
      setActiveIndex(newIdx)
      s.reportActiveItem({ reviewId: wanted, index: newIdx, scrollOffset: c ? newIdx * c.clientHeight : 0 })
    } else {
      const idx = Math.min(activeIndex, reviews.length - 1)
      if (c) c.scrollTo({ top: idx * c.clientHeight, behavior: 'auto' })
      setActiveIndex(idx)
      s.reportActiveItem({ reviewId: reviews[idx]?.id ?? null, index: idx, scrollOffset: c ? idx * c.clientHeight : 0 })
    }
  }, [loading, reviews, activeIndex, tab])

  // BT-11: a restored query re-runs its search once so results reappear.
  useEffect(() => {
    if (searchQuery) doSearch(searchQuery)
    // mount-only: typing already triggers doSearch via the input itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Explicit route-change departure intent (I3): any internal link inside the
  // page that leaves /reviews freezes the session at click time — before the
  // router acts. `/reviews` itself (?tab= echoes) stays inside Explore.
  // External and hash links never leave the SPA route, so they don't freeze.
  // Desktop wheel forwarding. The feed column is ~448px of a 1920px window
  // (23%) and the page shell is `overflow-hidden`, so a wheel gesture anywhere
  // in the surrounding black area hit a non-scrollable element and did nothing
  // — the feed read as "stuck, cannot reach the other clips". Forward those
  // gestures to the feed, ONE slide per gesture to match the on-screen arrows
  // and the scroll-snap behaviour (a raw deltaY of ~100px would just snap back
  // to the same slide). Pointer already over a scrollable surface → leave it
  // to the browser.
  const wheelLockRef = useRef(0)
  const onPageWheel = (e: ReactWheelEvent) => {
    if (tab !== 'home' || !containerRef.current) return
    const t = e.target as HTMLElement
    if (t.closest?.('.snap-y') || t.closest?.('[data-scrollable]')) return
    if (Math.abs(e.deltaY) < 8) return
    const now = Date.now()
    if (now - wheelLockRef.current < 350) return // one slide per gesture, not per tick
    wheelLockRef.current = now
    scrollFeed(e.deltaY > 0 ? 1 : -1)
  }

  const onLeaveByLink = (e: ReactMouseEvent) => {
    // Modifier / non-primary clicks open a NEW tab — THIS tab never leaves, so
    // freezing here would strand the session in FROZEN and a later real
    // departure would idempotently return the stale snapshot (audit finding).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || a.target === '_blank') return
    const href = a.getAttribute('href') ?? ''
    if (!href.startsWith('/')) return
    if (href.split(/[?#]/)[0] === '/reviews') return
    sessionRef.current?.leaveExplore('route-change')
  }

  return (
    <div className="bg-black h-dvh overflow-hidden flex" onClickCapture={onLeaveByLink} onWheel={onPageWheel}>
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
                    {reviews.map((r, i) => <Post key={r.id} r={r} me={me} feedType={feedType} renderVideo={Math.abs(i - activeIndex) <= 1} active={i === activeIndex} onFeedTypeChange={handleFeedTypeChange} onLike={like} onLikeDouble={likeOnly} onSave={save} onComment={setCommentOf} onShare={handleShare} onDelete={del} onSoundTap={setSoundTrackId} onFollow={followFromFeed} />)}
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
                    onChange={e => { updateSearchQuery(e.target.value); searchMode === 'review' ? doSearch(e.target.value) : doUserSearch(e.target.value) }}
                    placeholder={searchMode === 'review' ? t('reviews.searchPlaceholderReview') : t('reviews.searchPlaceholderUser')}
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => { updateSearchQuery(''); setSearchResults([]); setUserResults([]); setSearchError(false); setUserSearchError(false) }}>
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
                        return (
                          <div key={r.id} className="relative aspect-[4/5] bg-gray-900">
                            {/* Shared poster: photo → thumbnail → platform placeholder. Never blank. */}
                            <LinkPoster review={r} />
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
              notifsError={false}
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
