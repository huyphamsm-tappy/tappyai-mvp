'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Lock, Mail, KeyRound, Loader2, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { checkCorporateEmailAddress } from '@/lib/controller/auth/corporateIdentity'

// Controller V2 — the sign-in card shown at `/login` when the visitor was sent
// there from the Controller.
//
// PRESENTATION AND VALIDATION ONLY. The two async handlers are injected by
// `/login`, which keeps calling the Supabase functions it already had
// (`signInWithOtp` / `verifyOtp`). This component creates no session, adds no
// provider, opens no second auth path, and never navigates.
//
// 🔑 THE DOMAIN CHECK HERE IS A COURTESY, NOT A BOUNDARY. It exists so a
// personal address is refused BEFORE a one-time code is mailed to it, and so the
// visitor is told why immediately instead of completing a whole sign-in and then
// meeting `/access-denied?reason=not_corporate`. The address is unverified —
// anyone can type `ceo@tappyai.com`. What makes the boundary real is
// `checkCorporateIdentity` on a CONFIRMED session, server-side, which this
// cannot reach, weaken, or stand in for. It calls the SAME rule
// (`checkCorporateEmailAddress`) rather than restating it, so the two can never
// drift into disagreeing about what a corporate address is.

export type LoginOutcome = { ok: true } | { ok: false; message?: string }

export interface ControllerLoginCardProps {
  /** Ask the existing backend to mail a one-time code. */
  sendCode: (email: string) => Promise<LoginOutcome>
  /** Hand the typed code to the existing backend. */
  verifyCode: (email: string, code: string) => Promise<LoginOutcome>
  /** A session now exists. The PAGE owns where to go next. */
  onAuthenticated: () => void
}

const CODE_LENGTH = 6

export function ControllerLoginCard({ sendCode, verifyCode, onAuthenticated }: ControllerLoginCardProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // A REF, not the `busy` state, is what actually prevents a double submit.
  // Three clicks dispatched before React re-renders all read the same stale
  // `busy === false`; the ref is written synchronously inside the first one.
  // The `disabled` attribute below is the visible half of the same rule.
  const inFlight = useRef(false)

  /** Map every failure — refusal or thrown — to one translated, opaque message. */
  const fail = (key: string) => {
    // Deliberately ignores the backend's own text. It can carry `PGRST…`,
    // `jwt expired`, a hostname, or a rate-limit internal; none of that belongs
    // on a sign-in screen, and it is never localized.
    setError(t(key))
  }

  const submitEmail = async () => {
    const typed = email.trim()
    const verdict = checkCorporateEmailAddress(typed)

    if (!verdict.ok) {
      setError(
        t(
          verdict.reason === 'NO_EMAIL'
            ? 'admin.login.errorEmailRequired'
            : verdict.reason === 'NON_CORPORATE_DOMAIN'
              ? 'admin.login.errorEmailDomain'
              : 'admin.login.errorEmailMalformed'
        )
      )
      return
    }

    try {
      const outcome = await sendCode(typed)
      if (!outcome?.ok) {
        fail('admin.login.errorSendFailed')
        return
      }
      setStep('code')
    } catch {
      fail('admin.login.errorSendFailed')
    }
  }

  const submitCode = async () => {
    const typed = code.trim()
    if (typed.length < CODE_LENGTH) {
      setError(t('admin.login.errorCodeRequired'))
      return
    }

    try {
      const outcome = await verifyCode(email.trim(), typed)
      if (!outcome?.ok) {
        fail('admin.login.errorVerifyFailed')
        return
      }
      onAuthenticated()
    } catch {
      fail('admin.login.errorVerifyFailed')
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await (step === 'email' ? submitEmail() : submitCode())
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const cta = step === 'email'
    ? busy ? t('admin.login.sending') : t('admin.login.sendCode')
    : busy ? t('admin.login.verifying') : t('admin.login.verify')

  const field =
    'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#4C9AFF] focus:ring-2 focus:ring-[#2E7BF6]/40 disabled:opacity-50'

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1428]/90 p-7 shadow-2xl sm:p-8">
      <div className="mb-6">
        <span
          aria-hidden="true"
          className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#2E7BF6]/15 text-[#4C9AFF]"
        >
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-bold text-white sm:text-2xl">{t('admin.login.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{t('admin.login.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} noValidate>
        {step === 'email' ? (
          <div>
            <label htmlFor="controller-login-email" className="mb-2 block text-sm font-semibold text-white/85">
              {t('admin.login.emailLabel')}
            </label>
            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
              />
              <input
                id="controller-login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                dir="ltr"
                disabled={busy}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('admin.login.emailPlaceholder')}
                aria-invalid={Boolean(error)}
                className={`${field} pl-11`}
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm text-white/60">
              {t('admin.login.codeSentTo')}{' '}
              {/* The address is the visitor's own and is shown so a typo is
                  recoverable without starting over. */}
              <span className="font-semibold text-white/90" dir="ltr">
                {email.trim()}
              </span>
            </p>
            <label htmlFor="controller-login-code" className="mb-2 block text-sm font-semibold text-white/85">
              {t('admin.login.codeLabel')}
            </label>
            <div className="relative">
              <KeyRound
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
              />
              <input
                id="controller-login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                dir="ltr"
                maxLength={CODE_LENGTH}
                disabled={busy}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('admin.login.codePlaceholder')}
                aria-invalid={Boolean(error)}
                className={`${field} pl-11 tracking-[0.4em]`}
              />
            </div>
          </div>
        )}

        {/* The error slot is INSIDE the flow, so showing it moves the button
            down rather than covering anything — and `min-h` is not used, so an
            empty slot costs no space and the layout does not jump on the first
            error either. `role="alert"` announces it. */}
        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        <button
          type="submit"
          data-testid="controller-login-submit"
          disabled={busy}
          aria-busy={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E7BF6] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#1B4FD8]/30 transition-colors hover:bg-[#1B4FD8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C9AFF] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {cta}
        </button>

        {step === 'code' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep('email')
              setCode('')
              setError('')
            }}
            className="mt-3 w-full text-center text-sm font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-50"
          >
            {t('admin.login.changeEmail')}
          </button>
        ) : null}
      </form>
    </div>
  )
}
