'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Users, UserPlus, Search, Compass, Loader2, ChevronRight } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
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

  const focusSearch = () => searchRef.current?.focus()

  const current = lists[tab]

  return (
    <V3Shell
      title={t('v3.social.title')}
      subtitle={t('v3.social.tagline')}
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
        // Two columns from `lg` up. This task is desktop-only, so the rail simply
        // stacks under the list below that width rather than getting a layout of
        // its own — nothing mobile is designed or claimed here.
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-4">

            {/* ── Hero ──
                Compact, and only two entry points: both do something. The
                reference's third one names no action, so it is not rendered as
                one. */}
            <section className="v3-panel p-5">
              <h1 className="text-[20px] font-extrabold leading-tight" style={{ color: 'var(--v3-fg)' }}>
                {t('v3.social.title')}
              </h1>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.social.tagline')}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={focusSearch}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors"
                  style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)' }}
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                    aria-hidden="true"
                  >
                    <UserPlus size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.heroFind')}</span>
                    <span className="block truncate text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.social.heroFindDesc')}</span>
                  </span>
                </button>

                {/* A real destination: Explore is the community surface that ships. */}
                <Link
                  href="/reviews"
                  className="flex items-center gap-3 rounded-xl border p-3 transition-colors"
                  style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)' }}
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                    aria-hidden="true"
                  >
                    <Compass size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.heroExplore')}</span>
                    <span className="block truncate text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.social.heroExploreDesc')}</span>
                  </span>
                </Link>
              </div>
            </section>

            {/* ── Tabs ──
                Two, because there are two directions in `user_follows`. No
                requests tab: friend requests do not exist. */}
            <div className="flex gap-1 border-b" style={{ borderColor: 'var(--v3-border)' }} role="tablist">
              {([
                { id: 'following' as const, labelKey: 'v3.social.tabFollowing' },
                { id: 'followers' as const, labelKey: 'v3.social.tabFollowers' },
              ]).map(entry => {
                const active = tab === entry.id
                return (
                  <button
                    key={entry.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(entry.id)}
                    className="-mb-px border-b-2 px-3 pb-2.5 text-[13.5px] font-semibold transition-colors"
                    style={active
                      ? { borderColor: 'var(--v3-accent)', color: 'var(--v3-accent)' }
                      : { borderColor: 'transparent', color: 'var(--v3-fg-muted)' }}
                  >
                    {t(entry.labelKey)}
                  </button>
                )
              })}
            </div>

            {/* ── List ── */}
            {loading && current === null ? (
              <div className="flex justify-center py-12">
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
              <p className="py-10 text-center text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t(tab === 'following' ? 'v3.social.emptyFollowing' : 'v3.social.emptyFollowers')}
              </p>
            ) : (
              <div className="grid gap-2 xl:grid-cols-2">
                {current!.map(person => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    followsYou={tab === 'followers'}
                    onFollowChange={onFollowChange}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Right rail ── */}
          <aside className="w-full flex-shrink-0 space-y-4 lg:w-[320px]">
            <section className="v3-panel p-4">
              <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.searchTitle')}</h2>
              <div className="relative mt-3">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--v3-fg-muted)' }} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('v3.social.searchPlaceholder')}
                  aria-label={t('v3.social.searchTitle')}
                  className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-[13px] outline-none transition-colors focus:border-[var(--v3-accent)]"
                  style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
                />
              </div>

              <div className="mt-3 space-y-2">
                {query.trim().length < 2 ? (
                  <p className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.social.searchHint')}</p>
                ) : searching ? (
                  <div className="flex justify-center py-3">
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
            <section className="v3-panel p-4">
              <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.quickTitle')}</h2>
              <div className="mt-2 space-y-1">
                {[
                  { icon: Search, titleKey: 'v3.social.quickFind', descKey: 'v3.social.quickFindDesc', run: focusSearch },
                  { icon: Users, titleKey: 'v3.social.quickFollowers', descKey: 'v3.social.quickFollowersDesc', run: () => setTab('followers') },
                  { icon: UserPlus, titleKey: 'v3.social.quickFollowing', descKey: 'v3.social.quickFollowingDesc', run: () => setTab('following') },
                ].map(row => (
                  <button
                    key={row.titleKey}
                    type="button"
                    onClick={row.run}
                    className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors"
                    style={{ background: 'transparent' }}
                  >
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                      aria-hidden="true"
                    >
                      <row.icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t(row.titleKey)}</span>
                      <span className="block truncate text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>{t(row.descKey)}</span>
                    </span>
                    <ChevronRight size={15} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>

            {/* ── Counts ──
                `follower_count` / `following_count` are real trigger-maintained
                columns on `profiles`, shown here instead of the reference's
                invented community tiles. */}
            <section className="v3-panel p-4">
              <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.social.statsTitle')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { labelKey: 'v3.social.tabFollowing', value: lists.following?.length },
                  { labelKey: 'v3.social.tabFollowers', value: lists.followers?.length },
                ].map(stat => (
                  <div
                    key={stat.labelKey}
                    className="rounded-xl border p-3"
                    style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)' }}
                  >
                    {/* An em dash until the list has actually been read. A zero
                        the server never sent is a claim, not a placeholder. */}
                    <p className="text-[18px] font-extrabold tabular-nums" style={{ color: 'var(--v3-fg)' }}>
                      {stat.value ?? '—'}
                    </p>
                    <p className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t(stat.labelKey)}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      <V3Footer />
    </V3Shell>
  )
}
