'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Sparkles, Loader2, MessageCircle, MapPin, Users, Heart, ChevronRight, Star } from 'lucide-react'
import { TappyMascot } from '@/components/TappyMascot'
import { getTappyPose } from '@/lib/TappyMascotState'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { RecPhoto, RecFacts } from './RecPlaceDetails'
import { apiFetch } from '@/lib/account/ageGateClient'
import { goBack } from '@/lib/nav/inAppBack'
import { SMART_TOOLS_HREF } from '@/lib/tools/registry'

// Shape of /api/recommendations (unchanged). The card shows ONLY these facts: the
// design's photo, verified badge, category line, address, rating/visit chips and
// "Recently Active" have no field in this payload, so they are not drawn — a chip
// is never rendered for data that does not exist.
interface Rec {
  placeId: string
  placeName: string
  finalScore: number
  matchedSignals: string[]
  /** Additive fields (2026-09-28) from the place's community reviews; absent on older servers. */
  address?: string | null
  photoUrl?: string | null
  averageRating?: number | null
  reviewCount?: number
  latestReviewAt?: string | null
}

/** Where "Hỏi Tappy về chỗ này" goes: chat, prefilled with a question naming the place. */
// Not exported: a Next.js page module may only export the page and route config.
function askTappyHref(prompt: string): string {
  return `/chat?q=${encodeURIComponent(prompt)}`
}

// "Xem thêm" opens the community Explore feed — the same review data these places come from.
const SEE_MORE_HREF = '/reviews'

const HIGHLIGHTS = [
  { key: 'recommendations.highlight.discover', icon: MapPin, tone: 'text-primary-500 bg-primary-500/10 ring-primary-500/30' },
  { key: 'recommendations.highlight.community', icon: Users, tone: 'text-indigo-400 bg-indigo-500/10 ring-indigo-500/30' },
  { key: 'recommendations.highlight.life', icon: Heart, tone: 'text-pink-500 bg-pink-500/10 ring-pink-500/30' },
] as const

/** Decorative skyline behind the mascot — inline, theme-coloured, no remote image. */
function CitySkyline() {
  return (
    <svg viewBox="0 0 220 80" className="absolute bottom-0 right-0 h-20 w-56 text-primary-500/40" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M0 79h220" />
      <path d="M110 79V40h18v39M132 79V24h22v55M158 79V46h16v33M178 79V30h20v49M202 79V52h14v27" />
      <path d="M137 32h4M147 32h4M137 42h4M147 42h4M137 52h4M147 52h4M183 38h4M191 38h4M183 48h4M191 48h4M114 48h4M122 48h4" />
      <circle cx="176" cy="14" r="6" />
      <path d="M176 20v6" />
    </svg>
  )
}

export default function RecommendationsPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [recs, setRecs] = useState<Rec[]>([])
  const [explanation, setExplanation] = useState<string[]>([])
  const [personalized, setPersonalized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Age refusals redirect to /age-check via the ONE shared handler; every other
    // response behaves exactly as before.
    apiFetch('/api/recommendations')
      .then(async (r) => {
        if (r.status === 401) throw new Error('auth')
        if (!r.ok) throw new Error('load')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setRecs(d.recommendations ?? [])
        setExplanation(d.explanation ?? [])
        setPersonalized(!!d.personalized)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message === 'auth' ? 'auth' : 'load')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gray-50 dark:bg-gray-950 pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
        <div className="max-w-5xl mx-auto grid grid-cols-[1fr_auto_1fr] items-center px-4 h-14">
          {/* Back pops in-app history (Smart Tools tile, Home "see all", sidebar row); a deep
              link falls back to /tools. It used to push Home unconditionally and say so. */}
          <button onClick={() => goBack(router, SMART_TOOLS_HREF)} className="flex items-center gap-2 justify-self-start text-sm font-medium text-gray-700 dark:text-gray-200" data-in-app-back={SMART_TOOLS_HREF}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10 text-link">
              <ArrowLeft size={18} />
            </span>
            {t('common.back')}
          </button>
          <h1 className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
            <Sparkles size={18} className="text-accent-400" aria-hidden />
            {t('recommendations.headerTitle')}
          </h1>
          <span />
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Hero */}
        <section data-rec-hero className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900 dark:text-white">
              {t('recommendations.heroTitleLead')}{' '}
              <span data-rec-accent className="text-primary-500 dark:text-primary-400">{t('recommendations.heroTitleAccent')}</span>
            </h2>
            <p className="mt-2 text-sm sm:text-base text-content-secondary">{t('recommendations.heroSubtitle')}</p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-3" aria-label={t('recommendations.heroSubtitle')}>
              {HIGHLIGHTS.map(({ key, icon: Icon, tone }) => (
                <li key={key} data-rec-highlight className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-1 ${tone}`}>
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="max-w-[9rem] leading-snug">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative hidden sm:block h-44 w-72 justify-self-end select-none" aria-hidden>
            <CitySkyline />
            <div className="absolute bottom-0 left-8 h-40 w-40">
              <TappyMascot pose={getTappyPose({ category: 'recommendation' })} size={160} eager animated className="h-full w-full" />
            </div>
            <p className="absolute right-0 top-0 max-w-[10rem] rounded-2xl rounded-bl-sm bg-primary-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-primary-500/30">
              {t('recommendations.mascotBubble')}
            </p>
          </div>
        </section>

        {/* Places */}
        <section data-rec-section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <MapPin size={18} className="text-primary-500" aria-hidden />
              {personalized ? t('recommendations.subtitle') : t('recommendations.popularNearby')}
            </h2>
            <Link href={SEE_MORE_HREF} data-rec-see-more className="inline-flex items-center gap-0.5 text-sm font-medium text-link">
              {t('recommendations.seeMore')} <ChevronRight size={15} aria-hidden />
            </Link>
          </div>

          {loading && (
            <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
          )}

          {!loading && error && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">{t(error === 'auth' ? 'recommendations.error.auth' : 'recommendations.error.load')}</div>
          )}

          {!loading && !error && explanation.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {explanation.map((e, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300">{e}</span>
              ))}
            </div>
          )}

          {!loading && !error && recs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-content-secondary">
              <div className="w-14 h-14 rounded-2xl overflow-hidden select-none">
                <TappyMascot pose={getTappyPose({ category: 'recommendation' })} size={56} animated />
              </div>
              <p className="text-sm">{t('recommendations.notEnough')}</p>
              <p className="text-xs">{t('recommendations.notEnoughHint')}</p>
            </div>
          )}

          {!loading && !error && recs.map((r, i) => {
            const name = r.placeName || t('recommendations.place')
            const prompt = t('recommendations.askPrompt', { place: r.placeName || t('recommendations.thisPlace') })
            return (
              <article
                key={r.placeId}
                data-rec-card
                className="flex flex-col gap-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 sm:p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                  <RecPhoto photoUrl={r.photoUrl} rank={i + 1} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{name}</h3>
                    <RecFacts facts={r} />
                    {r.matchedSignals.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5" data-rec-signals>
                        {r.matchedSignals.slice(0, 4).map((s, j) => (
                          <li key={j} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/5 ring-1 ring-gray-200 dark:ring-white/10 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-200">
                            {s.includes('★') && <Star size={11} className="text-accent-400" fill="currentColor" aria-hidden />}
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:flex-shrink-0">
                  <Link
                    href={askTappyHref(prompt)}
                    data-rec-ask
                    className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-full bg-primary-500 hover:bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary-500/25 transition-colors"
                  >
                    <MessageCircle size={17} aria-hidden /> {t('recommendations.askTappy')}
                  </Link>
                  <ChevronRight size={20} className="text-content-secondary" aria-hidden />
                </div>
              </article>
            )
          })}
        </section>

        {/* Footer */}
        <footer data-rec-footer className="pt-6 text-center">
          <div className="mx-auto mb-4 flex max-w-2xl items-center gap-4" aria-hidden>
            <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
            <Sparkles size={16} className="text-primary-500" />
            <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
          </div>
          <p className="mx-auto max-w-sm text-base sm:text-lg text-gray-700 dark:text-gray-200">{t('recommendations.footerLine')}</p>
          <Heart size={16} className="mx-auto my-3 text-primary-500" fill="currentColor" aria-hidden />
          <p className="text-sm text-content-secondary">{t('recommendations.footerCta')}</p>
        </footer>
      </main>
    </div>
  )
}
