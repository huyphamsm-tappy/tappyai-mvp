'use client'

// WEB-ONLY Phase 8 / WP-06 — report a review, a comment or a user: one reason from the list the routes accept, an optional note. The server pins
// the reporter; nothing here identifies anyone but the target. Feedback is INLINE (this app has no toast host outside the admin area).

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { loginPathFor, currentDestination } from '@/lib/auth/returnTo'
import { REPORT_NOTE_MAX, REPORT_REASONS, sendReport, type ReportReason, type ReportTarget, type SafetyOutcome } from '@/lib/safety/safetyClient'
import { SafetyModal } from './SafetyModal'

export function ReportDialog({
  open, onOpenChange, target, targetId,
}: { open: boolean; onOpenChange: (open: boolean) => void; target: ReportTarget; targetId: string }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<SafetyOutcome | null>(null)

  const done = outcome === 'ok' || outcome === 'already'

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) { setReason(null); setDetails(''); setOutcome(null) }
  }

  async function submit() {
    if (!reason || busy || done) return
    setBusy(true)
    setOutcome(null)
    const result = await sendReport(target, targetId, reason, details)
    setBusy(false)
    if (result === 'login') { window.location.href = loginPathFor(currentDestination()); return }
    setOutcome(result)
  }

  return (
    <SafetyModal open={open} onOpenChange={close} title={t(`safety.reportTitle.${target}`)} testId="report-dialog">
      {done ? (
        <div className="mt-3">
          <p role="status" className="text-sm">{t('safety.reportSent')}</p>
          <div className="mt-4 flex justify-end">
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold" onClick={() => close(false)} data-testid="report-done">{t('safety.close')}</button>
          </div>
        </div>
      ) : (
        <>
          {/* A message belongs to a private conversation: say, before anything is sent, that reporting it shows it to the moderators. */}
          {target === 'message' && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300" data-testid="report-message-notice">{t('safety.reportMessageNotice')}</p>
          )}
          <fieldset className="mt-3 space-y-1.5">
            <legend className="text-sm font-medium">{t('safety.reportReasonLabel')}</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                {t(`safety.reason.${r}`)}
              </label>
            ))}
          </fieldset>
          {/* The note is read by comment/user reports only (the post-report route stores the reason alone). */}
          {target !== 'review' && (
            <label className="mt-3 block text-sm font-medium">
              {t('safety.reportDetailsLabel')}
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                rows={3}
                maxLength={REPORT_NOTE_MAX}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
          )}
          {(outcome === 'failed' || outcome === 'rate_limited') && (
            <p role="alert" className="mt-3 text-sm text-red-600">{t(outcome === 'rate_limited' ? 'safety.rateLimited' : 'safety.failed')}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={() => close(false)}>{t('safety.cancel')}</button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!reason || busy}
              onClick={submit}
              data-testid="report-submit"
            >
              {t('safety.reportSubmit')}
            </button>
          </div>
        </>
      )}
    </SafetyModal>
  )
}
