'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// ── P4-03 · ConfirmationPrompt (DD-006) ─────────────────────────────────────
//
// The user-facing form of the action boundary:
//
//     User → AI understanding/consultation → recommendation → USER DECISION → Controller/action
//
// The AI advises; it never commits. This component is where the user crosses that line, and it is
// deliberately the only place a consequential action can be triggered from a structured block.
//
// FAIL CLOSED. Dismissing, cancelling, pressing Escape or navigating away all resolve to CANCEL.
// There is no code path where an abandoned prompt confirms — an unattended dialog must never spend
// money, send a message, or delete anything.
//
// STATE OF THE ACTION, NOT OF THE UI. `error` is shown and the prompt STAYS OPEN, because a failed
// action the user cannot see is worse than one that failed loudly. The action is never retried
// silently — the user presses confirm again, or cancels.

export interface ConfirmationPromptProps {
  /** What will happen, in plain language. Never "Are you sure?" (DD-006). */
  consequence: string
  /** Concrete facts that change — party size, time, contact. Rendered as a list. */
  changes?: string[]
  /** Destructive actions name their object and use the danger colour. */
  destructive?: boolean
  confirmLabel?: string
  cancelLabel?: string
  /**
   * Runs the action. Resolve = success, reject = failure.
   * Anything consequential here goes through the Controller — never through the model.
   */
  onConfirm: () => Promise<void> | void
  onCancel: () => void
  /** Reported plainly when the action succeeds. */
  successMessage?: string
}

type Phase = 'idle' | 'working' | 'error' | 'success'

export default function ConfirmationPrompt({
  consequence,
  changes = [],
  destructive = false,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  successMessage,
}: ConfirmationPromptProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus lands on CANCEL, not confirm. For a destructive action the safe choice must be the one
  // a reflexive Enter press selects; for a benign one it costs a single Tab.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Escape cancels. Consistent with overlay-dismiss and with the fail-closed rule.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'working') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, phase])

  async function handleConfirm() {
    if (phase === 'working') return // no double-submit
    setPhase('working')
    setErrorText(null)
    try {
      await onConfirm()
      setPhase('success')
    } catch (err) {
      // Say what failed and leave the prompt open. Never retry on the user's behalf.
      setErrorText(err instanceof Error && err.message ? err.message : t('confirm.failed'))
      setPhase('error')
    }
  }

  if (phase === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="confirmation-success"
        className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
      >
        ✓ {successMessage ?? t('confirm.succeeded')}
      </div>
    )
  }

  const working = phase === 'working'

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={consequence}
      data-testid="confirmation-prompt"
      className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <p className="text-sm text-gray-900 dark:text-gray-100">{consequence}</p>

      {changes.length > 0 && (
        <>
          <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            {t('confirm.whatChanges')}
          </p>
          <ul className="mt-1 space-y-0.5" data-testid="confirmation-changes">
            {changes.map((c, i) => (
              <li key={i} className="flex gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                <span aria-hidden="true" className="text-gray-400">·</span>
                <span className="min-w-0">{c}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {errorText && (
        <p
          role="alert"
          data-testid="confirmation-error"
          className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
        >
          {errorText}
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={working}
          data-testid="confirmation-cancel"
          className="min-h-[44px] rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {cancelLabel ?? t('confirm.cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={working}
          aria-busy={working}
          data-testid="confirmation-confirm"
          className={
            destructive
              ? 'min-h-[44px] rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50'
              : 'min-h-[44px] rounded-2xl bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover disabled:opacity-50'
          }
        >
          {working ? t('confirm.working') : (confirmLabel ?? t('confirm.confirm'))}
        </button>
      </div>
    </div>
  )
}
