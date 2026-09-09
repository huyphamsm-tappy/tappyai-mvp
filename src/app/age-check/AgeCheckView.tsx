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
      <div className="min-h-dvh flex items-center justify-center bg-white dark:bg-gray-950">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    )
  }

  const blocked = state.ageStatus === 'ineligible'
  const showForm = !blocked || correcting

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col px-6 pt-12 pb-8">
      <Image
        src="/branding/otter-logo.png"
        alt="TappyAI"
        width={32}
        height={32}
        className="h-8 w-8 rounded-[22%] object-cover mb-8"
      />

      <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
        {blocked && !correcting
          ? t('age.blocked.title')
          : correcting
            ? t('age.correct.title')
            : t('age.ask.title')}
      </h1>
      <p className="text-content-secondary text-sm mb-6">
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
                <span className="text-xs font-medium text-content-secondary">{label}</span>
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
                  className="px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </label>
            ))}
          </div>

          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-interactive hover:bg-interactive-hover disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-all"
          >
            {saving
              ? <><Loader2 size={18} className="animate-spin" /> {t('age.submitting')}</>
              : (correcting ? t('age.correct.submit') : t('age.submit'))}
          </button>

          <p className="mt-4 flex items-start gap-2 text-xs text-content-secondary">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            {t('age.ask.privacy')}
          </p>
        </>
      )}

      {blocked && !correcting && (
        <div className="flex flex-col gap-3">
          {state.canCorrectAge ? (
            <button
              onClick={() => { setError(null); setCorrecting(true) }}
              className="w-full py-3 rounded-2xl border-2 border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200"
            >
              {t('age.blocked.correctCta')}
            </button>
          ) : (
            <p className="text-sm text-content-secondary">
              {/* The copy says "contact support". Without the address that is a
                  dead end: this user cannot correct their own date of birth any
                  more, so the ONLY remaining remedy is the audited
                  `admin_set_user_date_of_birth()`, invoked by a keyholder on their
                  behalf, and support is how they ask for it. Reads the ONE support
                  address rather than repeating a second literal. */}
              {t('age.blocked.exhausted')}{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          )}
          <button
            onClick={signOut}
            className="w-full py-3 text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            {t('age.blocked.signOut')}
          </button>
        </div>
      )}
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
