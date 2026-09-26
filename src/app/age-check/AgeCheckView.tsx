'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
  Loader2, ShieldCheck, Lock, Globe, ArrowRight, EyeOff,
  MessageCircle, ShoppingBag, Users, Sparkles, Heart,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { performSignOut } from '@/lib/auth/signOut'
import { SUPPORT_EMAIL } from '@/components/landing/config'

type AgeStatus = 'eligible' | 'unknown' | 'ineligible'

interface ProfileAgeState {
  ageStatus: AgeStatus
  canCorrectAge: boolean
}

/** Two digits, so a single-digit day or month still forms a valid ISO date. */
const pad = (v: string) => v.padStart(2, '0')

/**
 * `guest` — the trial's self-declaration (owner D1, revised 2026-09-17). The SAME
 * screen and form; only where the answer goes differs: `POST /api/age-declaration`
 * stores it on the device (an HttpOnly cookie) instead of the profile. There is
 * no eligibility to load, no correction allowance to spend and no session to
 * sign out of, so those three affordances are simply not rendered for a guest.
 */
function AgeCheckInner({ guest = false }: { guest?: boolean }) {
  const { t, locale, setLocale } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [state, setState] = useState<ProfileAgeState | null>(null)
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The ineligible user has tapped "I entered the wrong date". */
  const [correcting, setCorrecting] = useState(false)

  const next = searchParams.get('next') || '/'
  // Same restriction the auth callback applies: a relative path only, so this
  // cannot be turned into an open redirect by a crafted link.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  useEffect(() => {
    let cancelled = false
    if (guest) { setState({ ageStatus: 'unknown', canCorrectAge: false }); return () => { cancelled = true } }
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return
        const s: ProfileAgeState = {
          ageStatus: body.ageStatus ?? 'unknown',
          canCorrectAge: body.canCorrectAge ?? true,
        }
        setState(s)
        // Already eligible — there is nothing to ask. replace() so this page
        // never sits in history for someone who passed it.
        if (s.ageStatus === 'eligible') router.replace(safeNext)
      })
      .catch(() => { if (!cancelled) setState({ ageStatus: 'unknown', canCorrectAge: true }) })
    return () => { cancelled = true }
  }, [router, safeNext, guest])

  const submit = useCallback(async () => {
    setError(null)
    const y = year.trim()
    const m = month.trim()
    const d = day.trim()
    if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) {
      setError(t('age.error.invalid'))
      return
    }
    const iso = `${y}-${pad(m)}-${pad(d)}`

    setSaving(true)
    try {
      const res = await fetch(guest ? '/api/age-declaration' : '/api/profile', {
        method: guest ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateOfBirth: iso }),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        // The server owns the sentence for every refusal it can explain — the
        // correction allowance in particular, which this component cannot know
        // the state of on its own.
        setError(body?.message || t('age.error.failed'))
        // A spent correction changes what this page may offer, so re-read it.
        if (body?.error === 'age_correction_exhausted') {
          setState((s) => (s ? { ...s, canCorrectAge: false } : s))
          setCorrecting(false)
        }
        return
      }

      if (body?.ageStatus === 'eligible') {
        router.replace(safeNext)
        return
      }
      // Recorded, and the answer is under 18. Re-render as the blocked state
      // using the server's own verdict rather than computing one here.
      setState({
        ageStatus: body?.ageStatus ?? 'ineligible',
        canCorrectAge: body?.canCorrectAge ?? false,
      })
      setCorrecting(false)
    } catch {
      setError(t('age.error.failed'))
    } finally {
      setSaving(false)
    }
  }, [day, month, year, router, safeNext, t, guest])

  const signOut = useCallback(async () => {
    // The ONE sign-out primitive (`src/lib/auth/signOut.ts`). A second
    // `auth.signOut()` call site here would be the drift that file exists to
    // prevent — it also emits the logout analytics event and releases this
    // browser's push claim, both of which a hand-rolled teardown would forget.
    // It never throws and performs no navigation; where a signed-out person
    // belongs is this surface's decision.
    await performSignOut()
    router.replace('/')
  }, [router])

  if (!state) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#080A12]">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    )
  }

  const blocked = state.ageStatus === 'ineligible'
  const showForm = !blocked || correcting

  return (
    // ── A POST-AUTHENTICATION ONBOARDING STEP, NOT A LANDING PAGE ────────────
    //
    // Nobody reaches this screen without a session — `page.tsx` redirects a
    // signed-out or anonymous visitor to /login before the view mounts. The
    // composition around the card is reassurance and context, never navigation:
    // there is no menu, no link out, nothing to explore. The card is the only
    // interaction on the page.
    //
    // The dark treatment is fixed rather than theme-reactive because this is a
    // single focused step in a flow, not a surface the user returns to.
    <div className="relative min-h-dvh overflow-hidden bg-[#070B18] text-white">
      {/* Ambient field. Decorative only — aria-hidden, pointer-events-none, and
          behind every interactive element. Blurred colour, not an image. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-12rem] h-[38rem] w-[38rem] rounded-full bg-blue-700/25 blur-[150px]" />
        <div className="absolute -right-48 top-1/4 h-[34rem] w-[34rem] rounded-full bg-violet-700/25 blur-[150px]" />
        <div className="absolute bottom-[-16rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-indigo-600/20 blur-[150px]" />
        <div className="absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col px-5 py-4 sm:px-8 lg:px-12">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* The official otter lockup, used as a file. Never redrawn in CSS,
                never cropped out of a mockup, never spelled in text. */}
            <Image
              src="/branding/otter-logo.png"
              alt="TappyAI"
              width={56}
              height={56}
              priority
              className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/15 sm:h-[52px] sm:w-[52px]"
            />
            <div className="leading-tight">
              <p className="text-lg font-black tracking-tight sm:text-xl">
                Tappy<span className="text-blue-400">AI</span>
              </p>
              <p className="hidden text-[11px] text-white/45 sm:block">{t('age.brand.tagline')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.09] sm:px-4"
          >
            <Globe size={16} className="text-white/60" />
            <span>{locale === 'vi' ? 'Tiếng Việt' : 'English'}</span>
          </button>
        </header>

        {/* ── Main composition ───────────────────────────────────────────── */}
        <main className="grid flex-1 items-center gap-8 py-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)_minmax(0,0.75fr)] lg:gap-6 lg:py-1 xl:gap-8">
          {/* LEFT — who this is for. Hidden below lg: on a phone the card is
              the whole screen, and this would become scroll before the question. */}
          <section className="hidden lg:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-400/90">
              {t('age.intro.eyebrow')}
            </p>
            <h2 className="mt-3 text-[32px] font-black leading-[1.15] tracking-tight xl:text-[38px]">
              {t('age.intro.titleLead')}
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
                {t('age.intro.titleAccent')}
              </span>
            </h2>
            <p className="mt-3.5 max-w-sm text-[15px] leading-relaxed text-white/55">
              {t('age.intro.desc')}
            </p>

            <ul className="mt-6 space-y-4">
              {([
                [MessageCircle, 'from-blue-500/25 to-blue-600/10 text-blue-300', 'age.feature.discover.title', 'age.feature.discover.desc'],
                [ShoppingBag, 'from-violet-500/25 to-violet-600/10 text-violet-300', 'age.feature.shop.title', 'age.feature.shop.desc'],
                [Users, 'from-emerald-500/25 to-emerald-600/10 text-emerald-300', 'age.feature.together.title', 'age.feature.together.desc'],
              ] as const).map(([Icon, tint, titleKey, descKey]) => (
                <li key={titleKey} className="flex items-start gap-3.5">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${tint}`}>
                    <Icon size={19} />
                  </span>
                  <span className="pt-0.5">
                    <span className="block text-[15px] font-bold text-white/90">{t(titleKey)}</span>
                    <span className="block text-[13px] leading-relaxed text-white/50">{t(descKey)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* CENTRE — the only interaction on the page. */}
          <section className="mx-auto w-full max-w-[580px]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7 lg:p-6">
              <div className="flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/25 bg-gradient-to-br from-blue-500/25 to-violet-600/20">
                  <ShieldCheck size={24} className="text-blue-300" />
                </span>
              </div>

              <h1 className="mt-4 text-center text-[26px] font-black leading-tight tracking-tight sm:text-[30px]">
                {blocked && !correcting
                  ? t('age.blocked.title')
                  : correcting
                    ? t('age.correct.title')
                    : t('age.ask.title')}
              </h1>
              <p className="mx-auto mt-2.5 max-w-md text-center text-[14px] leading-relaxed text-white/55 sm:text-[15px]">
                {blocked && !correcting
                  ? t('age.blocked.desc')
                  : correcting
                    ? t('age.correct.desc')
                    : t('age.ask.desc')}
              </p>

              {showForm && (
                <>
                  <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
                    {([
                      [t('age.field.day'), day, setDay, 2, 'DD'],
                      [t('age.field.month'), month, setMonth, 2, 'MM'],
                      [t('age.field.year'), year, setYear, 4, 'YYYY'],
                    ] as const).map(([label, value, setValue, maxLen, placeholder]) => (
                      <label key={placeholder} className="flex flex-col gap-2">
                        <span className="text-[13px] font-semibold text-white/70">{label}</span>
                        <input
                          // `inputMode` rather than type="number": a number input on
                          // mobile allows a spinner, an exponent and a minus sign, none
                          // of which are part of a date.
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={maxLen}
                          value={value}
                          placeholder={placeholder}
                          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, maxLen))}
                          className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-base tabular-nums text-white placeholder-white/25 transition-colors focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                        />
                      </label>
                    ))}
                  </div>

                  {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

                  <button
                    onClick={submit}
                    disabled={saving}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:from-blue-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <><Loader2 size={18} className="animate-spin" /> {t('age.submitting')}</>
                    ) : (
                      <>{correcting ? t('age.correct.submit') : t('age.submit')} <ArrowRight size={18} /></>
                    )}
                  </button>

                  {/* Scope only — what the field is used for, and where it will
                      not appear. No advertising, analytics or personalisation. */}
                  <div className="mt-4 flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10">
                      <Lock size={16} className="text-blue-300" />
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold text-white/85">{t('age.ask.privacyTitle')}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-white/55">{t('age.ask.privacy')}</span>
                    </span>
                  </div>
                </>
              )}

              {blocked && !correcting && !guest && (
                <div className="mt-7 flex flex-col gap-3">
                  {state.canCorrectAge ? (
                    <button
                      onClick={() => { setError(null); setCorrecting(true) }}
                      className="w-full rounded-2xl border border-white/15 bg-white/[0.04] py-3.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.08]"
                    >
                      {t('age.blocked.correctCta')}
                    </button>
                  ) : (
                    <p className="text-center text-sm leading-relaxed text-white/55">
                      {/* The copy says "contact support". Without the address that is a
                          dead end: this user cannot correct their own date of birth any
                          more, so the ONLY remaining remedy is the audited
                          `admin_set_user_date_of_birth()`, invoked by a keyholder on their
                          behalf, and support is how they ask for it. Reads the ONE support
                          address rather than repeating a second literal. */}
                      {t('age.blocked.exhausted')}{' '}
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-blue-300 underline">
                        {SUPPORT_EMAIL}
                      </a>
                    </p>
                  )}
                  <button
                    onClick={signOut}
                    className="w-full py-2 text-center text-sm text-white/40 transition-colors hover:text-white/70"
                  >
                    {t('age.blocked.signOut')}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* MASCOT (COMPACT) — below the card on phone and tablet, where the
              three-column composition collapses. Same artwork, smaller, and
              still purely decorative. It sits AFTER the card in source order so
              the question is what a small screen shows first. */}
          <section aria-hidden className="relative flex select-none justify-center lg:hidden">
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-2 -z-10 mx-auto h-36 w-36 rounded-full bg-blue-500/20 blur-[55px]" />
              <Sparkles size={18} className="absolute left-0 top-6 text-amber-300/80" />
              <Sparkles size={14} className="absolute right-1 top-2 text-blue-200/70" />
              <Image
                src="/branding/otter-mascot.png"
                alt=""
                width={400}
                height={400}
                className="w-full max-w-[170px] object-contain drop-shadow-[0_16px_34px_rgba(37,99,235,0.4)] sm:max-w-[190px]"
              />
            </div>
          </section>

          {/* RIGHT — the mascot. Decorative throughout; carries no interaction
              and no information, so the whole column is aria-hidden and a
              screen reader never meets it. Hidden below lg, where the card
              takes the full width; the mascot reappears under the card on
              small screens (see MASCOT (COMPACT) below). */}
          <section aria-hidden className="relative hidden select-none lg:flex lg:items-center lg:justify-center">
            <div className="relative w-full max-w-[330px]">
              {/* Glow pool the character stands in. */}
              <div className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-64 w-64 rounded-full bg-blue-500/20 blur-[70px]" />
              <div className="pointer-events-none absolute bottom-8 left-1/2 -z-10 h-10 w-52 -translate-x-1/2 rounded-[50%] bg-violet-500/30 blur-2xl" />

              {/* Floating chips. Real elements, not artwork baked into the
                  mascot file, so they scale and re-colour with the theme. */}
              <span className="absolute -top-2 left-0 z-10 flex h-11 w-11 items-center justify-center rounded-2xl rounded-bl-md border border-blue-400/30 bg-blue-500/25 shadow-lg shadow-blue-900/40 backdrop-blur-sm">
                <Heart size={18} className="text-blue-100" />
              </span>
              <span className="absolute right-0 top-24 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/25 shadow-lg shadow-violet-900/40 backdrop-blur-sm">
                <ShoppingBag size={17} className="text-violet-100" />
              </span>
              <span className="absolute -right-1 top-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/20 shadow-lg shadow-blue-900/30 backdrop-blur-sm">
                <MessageCircle size={16} className="text-blue-100" />
              </span>
              <Sparkles size={26} className="absolute left-6 top-28 z-10 text-amber-300/90" />
              <Sparkles size={16} className="absolute left-2 top-1/2 z-10 text-amber-200/70" />
              <Sparkles size={14} className="absolute right-16 top-6 z-10 text-blue-200/70" />

              {/* THE APPROVED MASCOT ARTWORK, used as a file and never redrawn.
                  Distinct from `otter-logo.png` (the square app icon), which
                  stays in the header where the lockup belongs. */}
              <Image
                src="/branding/otter-mascot.png"
                alt=""
                width={640}
                height={640}
                priority
                className="relative mx-auto w-full max-w-[300px] object-contain drop-shadow-[0_22px_48px_rgba(37,99,235,0.45)] xl:max-w-[330px]"
              />

              <p className="relative mx-auto mt-1 max-w-[230px] rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-center text-[12.5px] leading-relaxed text-white/70 shadow-lg shadow-black/25 backdrop-blur-sm">
                {t('age.mascot.bubble')}
              </p>
            </div>
          </section>
        </main>

        {/* ── Trust row ──────────────────────────────────────────────────── */}
        <section className="shrink-0">
          {/* A bordered panel rather than a bare row: it closes the composition
              under the card and keeps the three promises reading as one group. */}
          <ul className="grid gap-5 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 sm:grid-cols-3 sm:gap-4 sm:p-5">
            {([
              [Lock, 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300', 'age.trust.privacy.title', 'age.trust.privacy.desc'],
              [EyeOff, 'border-blue-400/20 bg-blue-500/10 text-blue-300', 'age.trust.ageOnly.title', 'age.trust.ageOnly.desc'],
              [ShieldCheck, 'border-violet-400/20 bg-violet-500/10 text-violet-300', 'age.trust.better.title', 'age.trust.better.desc'],
            ] as const).map(([Icon, tint, titleKey, descKey]) => (
              <li key={titleKey} className="flex items-start gap-3 sm:border-l sm:border-white/[0.08] sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${tint}`}>
                  <Icon size={17} />
                </span>
                <span className="pt-0.5">
                  <span className="block text-[13px] font-bold text-white/85">{t(titleKey)}</span>
                  <span className="block max-w-[15rem] text-[12px] leading-relaxed text-white/45">{t(descKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="shrink-0 pb-0 pt-2.5">
          <div className="flex items-center justify-center gap-3">
            <span aria-hidden className="h-px w-12 bg-white/10 sm:w-20" />
            <Heart size={13} className="text-blue-400/70" />
            <span aria-hidden className="h-px w-12 bg-white/10 sm:w-20" />
          </div>
          <p className="mt-2.5 text-center text-[12px] text-white/35">{t('age.footer.tagline')}</p>
        </footer>
      </div>
    </div>
  )
}

// `useSearchParams()` needs a Suspense boundary above it — same reason as
// /onboarding, where the app-root loading.tsx no longer provides one.
export function AgeCheckView({ guest = false }: { guest?: boolean } = {}) {
  return (
    <Suspense fallback={null}>
      <AgeCheckInner guest={guest} />
    </Suspense>
  )
}
