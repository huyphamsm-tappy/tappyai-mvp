'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Loader2, ShieldCheck } from 'lucide-react'
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

function AgeCheckInner() {
  const { t } = useTranslation()
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
  }, [router, safeNext])

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
      const res = await fetch('/api/profile', {
        method: 'PATCH',
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
  }, [day, month, year, router, safeNext, t])

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
    // signed-out or anonymous visitor to /login before the view mounts — so it
    // is dressed as account setup rather than as a public front door: one
    // centred card, no navigation, no marketing, nothing to explore. The dark
    // treatment is fixed rather than theme-reactive because this is a single
    // focused step in a flow, not a surface the user returns to and configures.
    <div className="relative min-h-dvh overflow-hidden bg-[#080A12] flex items-center justify-center px-4 py-10 sm:px-6">
      {/* Ambient glow. Decorative only — aria-hidden, pointer-events-none, and
          behind every interactive element. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-blue-600/20 blur-[110px]" />
        <div className="absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-violet-600/20 blur-[130px]" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
        {/* The official otter lockup, used as a file. Never redrawn in CSS or
            spelled out in text. */}
        <Image
          src="/branding/otter-logo.png"
          alt="TappyAI"
          width={56}
          height={56}
          priority
          className="h-14 w-14 rounded-[22%] object-cover mb-7 ring-1 ring-white/15"
        />

        <h1 className="text-[26px] leading-tight font-black text-white mb-2.5 sm:text-[28px]">
          {blocked && !correcting
            ? t('age.blocked.title')
            : correcting
              ? t('age.correct.title')
              : t('age.ask.title')}
        </h1>
        <p className="text-[15px] leading-relaxed text-white/60 mb-7">
          {blocked && !correcting
            ? t('age.blocked.desc')
            : correcting
              ? t('age.correct.desc')
              : t('age.ask.desc')}
        </p>

        {showForm && (
        <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {([
                [t('age.field.day'), day, setDay, 2, 'DD'],
                [t('age.field.month'), month, setMonth, 2, 'MM'],
                [t('age.field.year'), year, setYear, 4, 'YYYY'],
              ] as const).map(([label, value, setValue, maxLen, placeholder]) => (
                <label key={placeholder} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-white/50">{label}</span>
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
                    className="px-4 py-3 rounded-2xl bg-white/[0.06] border border-white/10 text-center text-base tabular-nums text-white placeholder-white/25 focus:outline-none focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/30 transition-colors"
                  />
                </label>
              ))}
            </div>

            {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}

            <button
              onClick={submit}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 transition-all"
            >
              {saving
                ? <><Loader2 size={18} className="animate-spin" /> {t('age.submitting')}</>
                : (correcting ? t('age.correct.submit') : t('age.submit'))}
            </button>

            {/* The reassurance is a titled block rather than one long line: this
                screen asks for the single most sensitive field the product
                stores, and the promise about it should be as readable as the
                question. Scope only — what it is used for and where it will not
                appear. */}
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
              <div>
                <p className="text-[13px] font-semibold text-white/85">{t('age.ask.privacyTitle')}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t('age.ask.privacy')}</p>
              </div>
            </div>
          </>
        )}

        {blocked && !correcting && (
          <div className="flex flex-col gap-3">
            {state.canCorrectAge ? (
              <button
                onClick={() => { setError(null); setCorrecting(true) }}
                className="w-full py-3.5 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-semibold text-white/85 transition-colors"
              >
                {t('age.blocked.correctCta')}
              </button>
            ) : (
              <p className="text-sm leading-relaxed text-white/55">
                {/* The copy says "contact support". Without the address that is a
                    dead end: this user cannot correct their own date of birth any
                    more, so the ONLY remaining remedy is the audited
                    `admin_set_user_date_of_birth()`, invoked by a keyholder on their
                    behalf, and support is how they ask for it. Reads the ONE support
                    address rather than repeating a second literal. */}
                {t('age.blocked.exhausted')}{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-indigo-300 underline">
                  {SUPPORT_EMAIL}
                </a>
              </p>
            )}
            <button
              onClick={signOut}
              className="w-full py-3 text-center text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              {t('age.blocked.signOut')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// `useSearchParams()` needs a Suspense boundary above it — same reason as
// /onboarding, where the app-root loading.tsx no longer provides one.
export function AgeCheckView() {
  return (
    <Suspense fallback={null}>
      <AgeCheckInner />
    </Suspense>
  )
}
