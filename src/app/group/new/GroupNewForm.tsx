'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import {
  Loader2, Users, Utensils, MapPin, Link2, Sparkles, ClipboardList, AlertCircle, LayoutGrid, type LucideIcon,
} from 'lucide-react'
import { TappyMascot } from '@/components/TappyMascot'

/** The input's `maxLength`; the counter beside it says the same number. */
const NAME_MAX = 80

/**
 * Three tiles, each one true of the group flow: members fill in budget / tastes / area on the
 * join form, the creator copies one link from the group page, and `/api/group/[id]/suggest`
 * asks the model for three places that suit everyone. Nothing here is a speed or quality promise.
 */
const FEATURES: { titleKey: string; descKey: string; icon: LucideIcon; tone: 'blue' | 'cyan' | 'orange' }[] = [
  { titleKey: 'groupNew.featPlan', descKey: 'groupNew.featPlanDesc', icon: ClipboardList, tone: 'blue' },
  { titleKey: 'groupNew.featShare', descKey: 'groupNew.featShareDesc', icon: Link2, tone: 'cyan' },
  { titleKey: 'groupNew.featSuggest', descKey: 'groupNew.featSuggestDesc', icon: Sparkles, tone: 'orange' },
]

/** Static quick picks — shortcuts that fill the field. Not generated, not "AI". */
const PRESETS = ['groupNew.preset1', 'groupNew.preset2', 'groupNew.preset3', 'groupNew.preset4', 'groupNew.preset5']

export default function GroupNewForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.message || t('groupNew.error.create'))
        return
      }
      const data = await res.json()
      router.push(`/group/${data.id}`)
    } catch {
      setError(t('groupNew.error.network'))
    } finally {
      setLoading(false)
    }
  }

  return (
    // `v3-theme` brings the shared tokens to a page that keeps its legacy header and bottom nav.
    <div className="v3-theme v3-group-page flex min-h-dvh flex-col">
      <Header
        showBack
        title={t('groupNew.title')}
        backHref="/"
      />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 pb-24 pt-5 sm:px-6 sm:pt-7" data-group-main>
        {/* ── Hero ── */}
        <section className="v3-group-hero" aria-labelledby="group-hero-title" data-group-hero>
          <div className="v3-group-stars" aria-hidden="true" />
          <div className="flex flex-col gap-5 px-5 pb-4 pt-6 sm:px-8 sm:pb-5 sm:pt-8 md:flex-row md:items-center md:gap-6 lg:gap-8">
            <div className="min-w-0 flex-1">
              <span className="v3-group-eyebrow inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 text-[13px] font-semibold">
                <Users size={15} aria-hidden="true" />
                {t('groupNew.heroEyebrow')}
              </span>
              <h1 id="group-hero-title" className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[38px] lg:text-[42px]">
                {t('groupNew.heroTitle1')}{' '}
                <span className="v3-group-hero-accent">{t('groupNew.heroTitle2')}</span>
              </h1>
              {/* The body is the real flow: create, share the link, members fill in tastes, Tappy suggests places to eat. */}
              <p className="v3-group-hero-muted mt-4 max-w-[50ch] text-[14.5px] leading-relaxed sm:text-[16px]">
                {t('groupNew.heroBody')}
              </p>
            </div>

            {/* The scene: the owner's `thinking`, `searching` and `food` poses side by side —
                think together, find together, eat together — with icon bubbles and a speech
                bubble. Illustration only; nothing here reads or writes group data. */}
            <div className="relative mx-auto h-[230px] w-full max-w-[400px] flex-shrink-0 sm:h-[280px] md:h-[340px] md:w-[48%] md:max-w-[480px]" aria-hidden="true" data-group-scene>
              <span className="v3-group-bloom" style={{ left: '8%', right: '4%', top: '18%', bottom: '-8%' }} />
              <span className="v3-group-orb v3-group-float" data-tone="blue" style={{ left: '12%', top: '4%' }}><Utensils size={20} /></span>
              <span className="v3-group-orb v3-group-float" data-tone="rose" data-delay="1" style={{ left: '30%', top: '12%' }}><MapPin size={20} /></span>
              <span className="v3-group-orb v3-group-float" data-tone="cyan" data-delay="2" style={{ right: '2%', top: '30%' }}><Users size={20} /></span>
              <span className="v3-group-spark" style={{ left: '4%', top: '40%' }}><Sparkles size={20} /></span>
              <span className="v3-group-spark" style={{ right: '0%', top: '58%' }}><Sparkles size={16} /></span>
              <p className="v3-group-bubble" style={{ right: '2%', top: '0%' }} data-group-bubble>{t('groupNew.bubble')}</p>
              <span className="v3-group-mascot" data-role="thinking" style={{ width: '54%', left: '-3%', bottom: '2%' }}>
                <TappyMascot pose="thinking" size={288} eager />
              </span>
              <span className="v3-group-mascot" data-role="searching" style={{ width: '54%', right: '-3%', bottom: '0%' }}>
                <TappyMascot pose="searching" size={288} eager />
              </span>
              <span className="v3-group-mascot" data-role="food" style={{ width: '64%', left: '18%', bottom: '-8%' }}>
                <TappyMascot pose="food" size={288} eager />
              </span>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 px-5 pb-6 sm:grid sm:grid-cols-3 sm:gap-2.5 sm:px-8 sm:pb-8" data-group-features>
            {FEATURES.map(f => (
              <li key={f.titleKey} className="v3-group-feat" data-tone={f.tone}>
                <span className="v3-group-feat-icon" aria-hidden="true"><f.icon size={17} /></span>
                <span className="min-w-0">
                  <span className="v3-group-feat-title block text-[13.5px] font-bold leading-tight">{t(f.titleKey)}</span>
                  <span className="v3-group-feat-desc mt-0.5 hidden text-[12px] leading-snug sm:block">{t(f.descKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Name card ── */}
        <section className="v3-group-card p-4 sm:p-6" aria-labelledby="group-form-title" data-group-card>
          <div className="flex items-center gap-4">
            <span className="v3-group-card-icon" aria-hidden="true"><Users size={26} /></span>
            <div className="min-w-0">
              <h2 id="group-form-title" className="v3-group-card-title text-[18px] font-extrabold leading-tight sm:text-[20px]">{t('groupNew.formTitle')}</h2>
              <p className="v3-group-card-sub mt-1 text-[13.5px] sm:text-[14px]">{t('groupNew.formSubtitle')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label htmlFor="group-name" className="sr-only">{t('groupNew.nameLabel')}</label>
            <div className="v3-group-field">
              <Users size={18} className="v3-group-field-icon" aria-hidden="true" />
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('groupNew.namePlaceholder')}
                maxLength={NAME_MAX}
                autoFocus
                className="v3-group-input"
              />
              <span className="v3-group-counter text-[13px]" data-full={name.length >= NAME_MAX} data-group-counter aria-live="polite">
                {name.length}/{NAME_MAX}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2" data-group-presets>
              <span className="v3-group-quick-label inline-flex items-center gap-2 text-[13.5px] font-semibold">
                <LayoutGrid size={16} aria-hidden="true" />
                {t('groupNew.quickLabel')}
              </span>
              {PRESETS.map(key => {
                const label = t(key)
                return (
                  <button key={key} type="button" className="v3-group-pick" aria-pressed={name === label} onClick={() => setName(label)}>
                    {label}
                  </button>
                )
              })}
            </div>

            {error && (
              <div className="v3-group-error text-[14px]" role="alert" data-group-error>
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="v3-group-cta flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl px-6 text-[17px] font-bold"
              data-group-submit
            >
              {loading ? <Loader2 size={22} className="animate-spin" aria-hidden="true" /> : <Users size={22} aria-hidden="true" />}
              {loading ? t('groupNew.submitting') : t('groupNew.submit')}
            </button>
          </form>
        </section>
      </main>
      <BottomNav />
    </div>
  )
}
