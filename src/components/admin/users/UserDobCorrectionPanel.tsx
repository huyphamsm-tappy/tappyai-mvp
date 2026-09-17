'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// Module 08 — administrative date-of-birth correction.
//
// CONTRACT: docs/backoffice/phase-reports/V3_DOB_ADMIN_CORRECTION_PATH.md.
// A user gets exactly one self-correction. After that a mis-typed year is
// unrecoverable by the person it affects, and an under-18 value locks them out
// of the product entirely. This form is how support reaches the remedy.
//
// ── TWO FIELDS, AND NO THIRD ─────────────────────────────────────────────────
//
// New date, and the reason. There is deliberately NO display of the current
// date of birth, and this component must never gain one. No PostgREST role
// holds a privilege on the column, `user_age_status()` answers only for the
// CALLER's own `auth.uid()`, and correcting a value does not require seeing it.
// A field showing "current: 2009-04-11" would turn a write-only authority into
// a read surface for the most restricted column in the database — the exact
// exposure ADR-027 removed. The subtitle says so on screen, so an operator
// reads the absence as a decision rather than a bug.
//
// AUTHORIZATION LIVES IN THE API. `can` arrives as a prop from
// `permissionEngine.can` on the server and gates the AFFORDANCE only —
// 12_RBAC.md §4.2: "UI permission checks are for UX only." This file names no
// role and compares nothing; `POST /api/admin/users/[id]/date-of-birth`
// enforces `users.date_of_birth.correct` on every request regardless.
//
// NO AUDIT CALL, HERE OR IN THE ROUTE. The SQL function records the change in
// the same transaction. See the route for the full reasoning.

/** Matches the server schema, so the form refuses what the API would refuse. */
const REASON_MIN = 20
const REASON_MAX = 500
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type State = 'idle' | 'saving' | 'done' | 'error'

export function UserDobCorrectionPanel({ userId, can }: { userId: string; can: boolean }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<State>('idle')

  // Shape only. The server is the authority on whether the date is real — this
  // just stops an obviously-empty submit from costing a round trip.
  const ready = DATE_RE.test(date) && reason.trim().length >= REASON_MIN

  const submit = useCallback(async () => {
    if (!ready) return
    setState('saving')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/date-of-birth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_of_birth: date, reason: reason.trim() }),
      })
      if (!res.ok) {
        setState('error')
        return
      }
      // Cleared on success so the value does not sit in the DOM, in a form
      // restore, or in a screenshot of the next ticket.
      setDate('')
      setReason('')
      setState('done')
    } catch {
      setState('error')
    }
  }, [ready, userId, date, reason])

  if (!can) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.dob.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('admin.dob.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="dob-date">
            {t('admin.dob.dateLabel')}
          </label>
          <Input
            id="dob-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setState('idle')
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="dob-reason">
            {t('admin.dob.reasonLabel')}
          </label>
          <Input
            id="dob-reason"
            value={reason}
            maxLength={REASON_MAX}
            placeholder={t('admin.dob.reasonPlaceholder')}
            onChange={(e) => {
              setReason(e.target.value)
              setState('idle')
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => void submit()}
            title={guard.title}
            disabled={!ready || state === 'saving' || guard.disabled}
          >
            {t('admin.dob.submit')}
          </Button>
          {state === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400">{t('admin.dob.done')}</span>
          )}
          {state === 'error' && (
            <span className="text-xs text-destructive">{t('admin.dob.error')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
