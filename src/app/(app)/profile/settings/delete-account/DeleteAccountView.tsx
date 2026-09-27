'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { performSignOut } from '@/lib/auth/signOut'
import { goBack } from '@/lib/nav/inAppBack'
import { isConfirmWord } from '@/lib/account/selfDelete'
import { SUPPORT_EMAIL } from '@/components/landing/config'

// ── In-app account deletion (UAT3 P0) ───────────────────────────────────────
//
// Confirm = ONE typed word ("XÓA" / "DELETE") on a page that first lists what goes and what stays.
// The list is the published copy (`lib/i18n/accountDelete.ts` ← DELETE-ACCOUNT-COPY-DRAFT §3/§3b),
// so a person reads exactly what the operator runbook promises before they type the word. The
// server re-checks the word (`/api/account/delete`), so the button being enabled is not the gate.
//
// After success the account is gone: the page signs the browser out and shows what happens next
// in place — it does not navigate to a signed-in route that would bounce to /login.

const REMOVES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const KEPT = [1, 2] as const

type Phase = { kind: 'form' } | { kind: 'deleting' } | { kind: 'done' } | { kind: 'error'; key: string }

export default function DeleteAccountView({ user }: { user: { name?: string | null; avatarUrl?: string | null } | null }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const word = t('accountDelete.confirm.word')
  const ready = isConfirmWord(typed) && phase.kind !== 'deleting'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setPhase({ kind: 'deleting' })
    try {
      const r = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      if (r.ok) {
        await performSignOut()
        setPhase({ kind: 'done' })
        return
      }
      const key = r.status === 409 ? 'accountDelete.error.staff'
        : r.status === 401 ? 'accountDelete.error.signIn'
        : 'accountDelete.error.failed'
      setPhase({ kind: 'error', key })
    } catch {
      setPhase({ kind: 'error', key: 'accountDelete.error.failed' })
    }
  }

  if (phase.kind === 'done') {
    return (
      <V3Shell title={t('accountDelete.title')} activeTab="/profile" user={null}>
        <section className="v3-panel mx-auto w-full max-w-[560px] p-6 text-center" data-delete-done>
          <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--v3-emerald, #34D399)' }} />
          <h1 className="mt-3 text-[18px] font-extrabold" style={{ color: 'var(--v3-fg)' }}>{t('accountDelete.done.title')}</h1>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'var(--v3-fg)' }}>{t('accountDelete.done.p1')}</p>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('accountDelete.done.p2', { email: SUPPORT_EMAIL })}</p>
          {/* A full load, not a client push: every cached signed-in view must go with the session. */}
          <a href="/" className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[14px] font-semibold"
            style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}>
            {t('accountDelete.done.home')}
          </a>
        </section>
      </V3Shell>
    )
  }

  return (
    <V3Shell title={t('accountDelete.title')} activeTab="/profile" user={user}>
      <div className="mx-auto w-full max-w-[560px] space-y-4">
        <button type="button" onClick={() => goBack(router, '/profile/settings')}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--v3-fg-muted)' }}>
          <ArrowLeft size={16} />
          {t('accountDelete.back')}
        </button>

        <section className="v3-panel space-y-4 p-5">
          <p role="note" className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold text-red-600 dark:text-red-400"
            style={{ borderColor: 'rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)' }}>
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            <span>{t('accountDelete.warning')}</span>
          </p>

          <div>
            <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('accountDelete.removes.heading')}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-snug" style={{ color: 'var(--v3-fg)' }}>
              {REMOVES.map((n) => <li key={n}>{t(`accountDelete.removes.${n}`)}</li>)}
            </ul>
          </div>

          <div>
            <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('accountDelete.kept.heading')}</h2>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('accountDelete.kept.lead')}</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
              {KEPT.map((n) => <li key={n}>{t(`accountDelete.kept.${n}`)}</li>)}
            </ul>
            <Link href="/delete-account#data-we-may-retain" className="mt-2 inline-block text-[13px] font-semibold underline" style={{ color: 'var(--v3-accent, #3391FF)' }}>
              {t('accountDelete.retained')}
            </Link>
          </div>

          <form onSubmit={submit} className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--v3-border)' }}>
            <label htmlFor="delete-confirm" className="block text-[13.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
              {t('accountDelete.confirm.label', { word })}
            </label>
            <input
              id="delete-confirm"
              value={typed}
              onChange={(e) => { setTyped(e.target.value); if (phase.kind === 'error') setPhase({ kind: 'form' }) }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={word}
              disabled={phase.kind === 'deleting'}
              className="w-full rounded-xl border px-3 py-2.5 text-[15px] font-semibold tracking-wide outline-none focus:ring-2 focus:ring-red-500"
              style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
              data-delete-confirm-input
            />
            {phase.kind === 'error' && (
              <p role="alert" className="text-[13px] text-red-600 dark:text-red-400" data-delete-error={phase.key}>{t(phase.key)}</p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => goBack(router, '/profile/settings')} disabled={phase.kind === 'deleting'}
                className="min-h-[44px] rounded-xl border px-4 text-[14px] font-semibold"
                style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}>
                {t('accountDelete.cancel')}
              </button>
              <button type="submit" disabled={!ready}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-[14px] font-semibold text-white transition-opacity hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
                data-delete-submit>
                {phase.kind === 'deleting' ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                {phase.kind === 'deleting' ? t('accountDelete.deleting') : t('accountDelete.submit')}
              </button>
            </div>
          </form>
        </section>
      </div>
    </V3Shell>
  )
}
