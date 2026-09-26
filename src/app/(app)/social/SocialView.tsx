'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Users, UserPlus, Search, Compass, Loader2, ChevronRight, Heart } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import TappyPresence from '@/components/v3/TappyPresence'
import PersonCard, { type Person } from '@/components/social/PersonCard'

type Tab = 'following' | 'followers'

// ── V3 Web · Friends / Social ───────────────────────────────────────────────
//
// 🚨 WHAT THE REFERENCE DESIGN ASKED FOR THAT THIS PAGE DOES NOT BUILD, AND WHY.
//
// The reference is a friend-network screen: friend requests with Accept/Reject,
// suggested friends, people-you-may-know, a mutual-friend count on every card,
// contact sync, and interest communities. Behind it, this product has exactly
// one social primitive:
//
//     user_follows(follower_id, following_id)   one row, one direction
//
// There is no friendship model, so there are no friend requests to accept and
// nothing that can honestly be called a friend. There is no people recommender — the only
// recommendation code in the repo (`lib/explore/recommendation.ts`) ranks
// CONTENT for the feed. There is no contact-sync endpoint anywhere on Web. And
// `profiles` carries no interests, so there are no communities to join.
//
// Each of those was omitted rather than mocked. A card showing a mutual-friend
// count over a graph that cannot compute it is not a placeholder — it is a false
// statement about someone's relationships, printed next to their face.
//
// 🚨 AND THE PAGE IS NAMED FOR WHAT IT SHOWS. "Following / Followers", not
// "Friends" — the same rule `v3.profile.followingTitle` already follows.
//
// ── The redesign (owner's Friends / Social reference, 2026-09-12) ───────────
//
// The SKIN caught up with /tools and /music; the DATA did not grow. One framed
// surface, a blue→violet hero with Tappy on the right and the two entry points
// that already existed, pill tabs for the two directions, the list as `tile`
// person cards, and the right rail's three existing sections restyled. Every
// fetch, every action and every string is the one that shipped before — the
// reference's requests, suggestions, mutual counts, sync and invite CTA are
// still absent, for the reasons above, and `socialPage.test.tsx` pins that.

export default function SocialView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  const [tab, setTab] = useState<Tab>('following')
  const [lists, setLists] = useState<Record<Tab, Person[] | null>>({ following: null, followers: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const signedIn = !!user

  const load = useCallback(async (which: Tab) => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch(`/api/social/connections?type=${which}`)
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      setLists(prev => ({ ...prev, [which]: (d.users ?? []) as Person[] }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!signedIn) return
    if (lists[tab] === null) void load(tab)
  }, [tab, signedIn, lists, load])

  // Debounced, and reusing the existing search endpoint — which already carries
  // its own enumeration rate limit and already returns `is_following`.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : { users: [] }))
        .then(d => { if (!cancelled) setResults((d.users ?? []) as Person[]) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  /**
   * One follow toggle, applied everywhere that person appears.
   *
   * 🔑 Driven by the SERVER's answer (see `PersonCard`), so the lists and the
   * search results cannot end up disagreeing about the same person. Following
   * someone from search also drops them into the Following list on its next
   * read, which is why that list is invalidated rather than patched.
   */
  const onFollowChange = useCallback((id: string, isFollowing: boolean, followerCount: number) => {
    const patch = (people: Person[] | null) =>
      people?.map(p => (p.id === id ? { ...p, is_following: isFollowing, follower_count: followerCount } : p)) ?? null
    setResults(patch)
    setLists(prev => ({
      followers: patch(prev.followers),
      // Membership of this list changed, and only the server knows the new order.
      following: null,
    }))
  }, [])

  // The rail stacks under the list below `lg`, so "find people" has to bring the
  // field into view before it can focus it.
  const focusSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    searchRef.current?.focus({ preventScroll: true })
  }

  const current = lists[tab]

  const TABS = [
    { id: 'following' as const, labelKey: 'v3.social.tabFollowing' },
    { id: 'followers' as const, labelKey: 'v3.social.tabFollowers' },
  ]

  const HERO_TILES = [
    { key: 'find', icon: UserPlus, titleKey: 'v3.social.heroFind', descKey: 'v3.social.heroFindDesc', tint: '#3B82F6' },
    { key: 'explore', icon: Compass, titleKey: 'v3.social.heroExplore', descKey: 'v3.social.heroExploreDesc', tint: '#8B5CF6' },
  ] as const

  const QUICK_ROWS = [
    { icon: Search, titleKey: 'v3.social.quickFind', descKey: 'v3.social.quickFindDesc', run: focusSearch, tint: '#3B82F6' },
    { icon: Users, titleKey: 'v3.social.quickFollowers', descKey: 'v3.social.quickFollowersDesc', run: () => setTab('followers'), tint: '#8B5CF6' },
    { icon: UserPlus, titleKey: 'v3.social.quickFollowing', descKey: 'v3.social.quickFollowingDesc', run: () => setTab('following'), tint: '#EC4899' },
  ]

  return (
    <V3Shell
      title={t('v3.social.title')}
      activeTab="/social"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      {!signedIn ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-muted)' }}
            aria-hidden="true"
          >
            <Users size={26} />
          </span>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.signIn')}</p>
        </div>
      ) : (
        <div className="v3-social-frame p-4 sm:p-6 lg:p-8">
          {/* Two columns from `lg` up; the rail stacks under the list below that. */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <div className="min-w-0 flex-1 space-y-6">

              {/* ── Hero ──
                  The two entry points that already existed, now on the family's
                  gradient with Tappy beside them. Below `md` the character sits in the
                  header row next to the title, so it can never cover the copy; from `md`
                  it takes its own column. */}
              <section className="v3-social-hero" aria-labelledby="social-hero-title">
                <Heart className="v3-social-hero-heart hidden md:block" size={22} style={{ right: '9%', top: '14%' }} aria-hidden="true" />
                <Heart className="v3-social-hero-heart hidden lg:block" size={16} style={{ right: '4%', bottom: '22%', color: 'rgba(191,219,254,0.7)' }} aria-hidden="true" />

                <div className="relative grid gap-5 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8 lg:p-9">
                  <div className="flex items-start justify-between gap-4 md:block">
                    <div className="min-w-0">
                      <h1 id="social-hero-title" className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[34px] lg:text-[40px]">
                        {t('v3.social.title')}
                      </h1>
                      <p className="v3-social-hero-muted mt-3 max-w-[40ch] text-[14px] leading-relaxed sm:text-[15.5px]">
                        {t('v3.social.tagline')}
                      </p>
                    </div>
                    <div className="flex-shrink-0 md:hidden" aria-hidden="true">
                      <TappyPresence pose="welcome" size={72} aura="calm" />
                    </div>
                  </div>

                  <div className="hidden md:flex md:justify-end md:pr-2" aria-hidden="true">
                    <TappyPresence pose="welcome" size={150} aura="calm" className="lg:hidden" />
                    <TappyPresence pose="welcome" size={190} aura="calm" className="hidden lg:block" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
                    {HERO_TILES.map(tile => {
                      const Icon = tile.icon
                      const body = (
                        <>
                          <span
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                            style={{ background: tile.tint, color: '#fff' }}
                            aria-hidden="true"
                          >
                            <Icon size={18} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-bold leading-tight">{t(tile.titleKey)}</span>
                            <span className="v3-social-hero-tile-desc mt-0.5 block text-[12.5px] leading-snug">{t(tile.descKey)}</span>
                          </span>
                        </>
                      )
                      // The first focuses the existing search; the second is a real
                      // destination — Explore is the community surface that ships.
                      return tile.key === 'find' ? (
                        <button key={tile.key} type="button" onClick={focusSearch} className="v3-social-hero-tile flex items-center gap-3 rounded-2xl p-3.5 text-left">
                          {body}
                        </button>
                      ) : (
                        <Link key={tile.key} href="/reviews" className="v3-social-hero-tile flex items-center gap-3 rounded-2xl p-3.5">
                          {body}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </section>

              {/* ── Tabs ──
                  Two, because there are two directions in `user_follows`. No
                  requests tab: friend requests do not exist. */}
              <div className="v3-scroll-x -mx-1 flex gap-2.5 px-1 py-1" role="tablist">
                {TABS.map(entry => {
                  const active = tab === entry.id
                  return (
                    <button
                      key={entry.id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(entry.id)}
                      className={`v3-chip v3-social-tab flex-shrink-0 focus:outline-none focus-visible:ring-2 ${active ? 'v3-chip-active' : ''}`}
                    >
                      {t(entry.labelKey)}
                    </button>
                  )
                })}
              </div>

              {/* ── List ── */}
              <section aria-labelledby="social-list-title">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id="social-list-title" className="text-[18px] font-bold tracking-[-0.01em] sm:text-[20px]" style={{ color: 'var(--v3-fg)' }}>
                    {t(tab === 'following' ? 'v3.social.tabFollowing' : 'v3.social.tabFollowers')}
                  </h2>
                  {/* The count is the list the server actually returned — never a number it did not. */}
                  {current && current.length > 0 && (
                    <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}>
                      {current.length}
                    </span>
                  )}
                </div>

                {loading && current === null ? (
                  <div className="flex justify-center py-12" aria-busy="true">
                    <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
                  </div>
                ) : error ? (
                  <p role="alert" className="py-8 text-center text-[13px]" style={{ color: 'var(--v3-rose)' }}>
                    {t('v3.social.error')}
                  </p>
                ) : (current?.length ?? 0) === 0 ? (
                  // Compact and intentional. No action offered, because there is no
                  // action here that would help — following someone happens through
                  // search, which is already on screen.
                  <div className="v3-social-rail-card flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
                      <Users size={22} />
                    </span>
                    <p className="text-[13.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                      {t(tab === 'following' ? 'v3.social.emptyFollowing' : 'v3.social.emptyFollowers')}
                    </p>
                  </div>
                ) : (
                  // 🚨 1 → 3 → 4. Two tiles at 375 measured 125px and wrapped both the count
                  // and the button; below `sm` the tile lays itself out as a full-width row.
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                    {current!.map(person => (
                      <PersonCard
                        key={person.id}
                        person={person}
                        followsYou={tab === 'followers'}
                        onFollowChange={onFollowChange}
                        variant="tile"
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ── Right rail ── */}
            <aside className="w-full flex-shrink-0 space-y-4 lg:w-[320px]" data-social-rail>
              <section className="v3-social-rail-card p-4">
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.searchTitle')}</h2>
                <div className="relative mt-3">
                  <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--v3-fg-muted)' }} />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('v3.social.searchPlaceholder')}
                    aria-label={t('v3.social.searchTitle')}
                    className="v3-social-search w-full rounded-xl py-2.5 pl-10 pr-3 text-[13.5px]"
                  />
                </div>

                <div className="mt-3 space-y-2">
                  {query.trim().length < 2 ? (
                    <p className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.social.searchHint')}</p>
                  ) : searching ? (
                    <div className="flex justify-center py-3" aria-busy="true">
                      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
                    </div>
                  ) : (results?.length ?? 0) === 0 ? (
                    <p className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.social.searchEmpty')}</p>
                  ) : (
                    results!.map(person => (
                      <PersonCard key={person.id} person={person} onFollowChange={onFollowChange} />
                    ))
                  )}
                </div>
              </section>

              {/* ── Quick actions ──
                  Every row goes somewhere real: the search box above, or one of
                  the two tabs. No contact-sync row — Web has no such capability,
                  so the button would have nothing to do. */}
              <section className="v3-social-rail-card p-4">
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.quickTitle')}</h2>
                <div className="mt-2 space-y-1">
                  {QUICK_ROWS.map(row => (
                    <button
                      key={row.titleKey}
                      type="button"
                      onClick={row.run}
                      className="v3-social-row flex w-full items-center gap-3 p-2.5 text-left"
                    >
                      <span
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{ background: row.tint, color: '#fff' }}
                        aria-hidden="true"
                      >
                        <row.icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t(row.titleKey)}</span>
                        <span className="block truncate text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t(row.descKey)}</span>
                      </span>
                      <ChevronRight size={16} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Counts ──
                  `follower_count` / `following_count` are real trigger-maintained
                  columns on `profiles`, shown here instead of the reference's
                  invented community tiles. */}
              <section className="v3-social-rail-card p-4">
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.statsTitle')}</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { labelKey: 'v3.social.tabFollowing', value: lists.following?.length },
                    { labelKey: 'v3.social.tabFollowers', value: lists.followers?.length },
                  ].map(stat => (
                    <div
                      key={stat.labelKey}
                      className="rounded-2xl border p-3"
                      style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)' }}
                    >
                      {/* An em dash until the list has actually been read. A zero
                          the server never sent is a claim, not a placeholder. */}
                      <p className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: 'var(--v3-fg)' }}>
                        {stat.value ?? '—'}
                      </p>
                      <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t(stat.labelKey)}</p>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      <V3Footer />
    </V3Shell>
  )
}
