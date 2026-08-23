'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Lock, Mail, KeyRound, Loader2, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { checkCorporateEmailAddress } from '@/lib/controller/auth/corporateIdentity'

// Controller V2 — the sign-in card shown at `/login` when the visitor was sent
// there from the Controller.
//
// EMAIL + PASSWORD (Owner correction, 2026-08-21). This replaced a one-time-code
// flow: the Controller is a corporate back-office whose accounts are
// PROVISIONED, so signing in is proving you hold a credential, not proving you
// can read a mailbox.
//
// 🔑 A REUSE, NOT A NEW AUTH ENGINE. The product already issues password
// credentials — `/register` calls `supabase.auth.signUp({ email, password })`.
// The provider is the same Supabase GoTrue every other sign-in path uses; only
// the primitive on it differs. The consumer app keeps its OTP block, its Google
// and its Zalo untouched.
//
// PRESENTATION AND VALIDATION ONLY. The `signIn` handler is injected by
// `/login`, which owns the Supabase call and the destination. This component
// creates no session and never navigates.
//
// 🔑 THE DOMAIN CHECK IS A COURTESY, NOT A BOUNDARY. It refuses a personal
// address before a credential is sent anywhere, and tells the visitor why
// immediately. Anyone can type `ceo@tappyai.com`; what makes the boundary real
// is `checkCorporateIdentity` on a CONFIRMED session, server-side. It calls the
// SAME rule rather than restating it, so the two cannot drift.

export type LoginOutcome = { ok: true } | { ok: false; message?: string }

export interface ControllerLoginCardProps {
  /** Hand the credential to the existing password primitive. */
  signIn: (email: string, password: string) => Promise<LoginOutcome>
  /** A session now exists. The PAGE owns where to go next. */
  onAuthenticated: () => void
}

export function ControllerLoginCard({ signIn, onAuthenticated }: ControllerLoginCardProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // A REF, not the `busy` state, is what actually prevents a double submit.
  // Two submits dispatched before React re-renders both read the same stale
  // `busy === false`; the ref is written synchronously inside the first.
  const inFlight = useRef(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')

    try {
      const typedEmail = email.trim()
      const verdict = checkCorporateEmailAddress(typedEmail)
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
      if (password.length === 0) {
        setError(t('admin.login.errorPasswordRequired'))
        return
      }

      try {
        const outcome = await signIn(typedEmail, password)
        if (!outcome?.ok) {
          // ONE message for every refusal, deliberately. GoTrue does not tell a
          // wrong password apart from an unknown account, and the UI must not
          // add a distinction the backend withholds — that is how a login form
          // becomes an account-enumeration oracle. It also never echoes the
          // provider's own text, which carries class names and hostnames.
          setError(t('admin.login.errorSignInFailed'))
          return
        }
        onAuthenticated()
      } catch {
        setError(t('admin.login.errorSignInFailed'))
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#4C9AFF] focus:ring-2 focus:ring-[#2E7BF6]/40 disabled:opacity-50'

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1428]/90 p-7 shadow-2xl sm:p-8">
      {/* V2.2 — VISUAL HIERARCHY ONLY (Owner Decision D14). Three lines that
          answer, in order: what is this, what is it for, and who may enter.
          Previously the card led with "Sign in to Controller" and put the
          audience rule directly under it, so the product's PURPOSE was never
          stated on the page an operator sees first. Nothing about
          authentication, the corporate boundary, returnTo or access-denied
          changes here — this block is copy and layout. */}
      <div className="mb-6">
        <span
          aria-hidden="true"
          className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#2E7BF6]/15 text-[#4C9AFF]"
        >
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-bold text-white sm:text-2xl">{t('admin.login.welcome')}</h1>
        <p className="mt-1.5 text-sm font-medium text-[#4C9AFF]">{t('admin.login.tagline')}</p>
        <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-white/50">
          {t('admin.login.subtitle')}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate>
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
            autoComplete="username"
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

        <label
          htmlFor="controller-login-password"
          className="mb-2 mt-4 block text-sm font-semibold text-white/85"
        >
          {t('admin.login.passwordLabel')}
        </label>
        <div className="relative">
          <KeyRound
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
          />
          <input
            id="controller-login-password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('admin.login.passwordPlaceholder')}
            aria-invalid={Boolean(error)}
            className={`${field} pl-11`}
          />
        </div>

        {/* The error slot is INSIDE the flow, so showing it moves the button
            down rather than covering anything, and an empty slot costs no space
            — the layout does not jump on the first error either. */}
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
          {busy ? t('admin.login.signingIn') : t('admin.login.signIn')}
        </button>

        {/* NO "forgot password" control. The product has no password-recovery
            flow at all — `resetPasswordForEmail` has zero call sites in `src/`
            — and inventing a recovery architecture is not this change's to make.
            A button that leads nowhere would be worse than its absence: it
            promises a way back in that does not exist. Raised with the Owner as
            the one outstanding decision. */}
      </form>
    </div>
  )
}
