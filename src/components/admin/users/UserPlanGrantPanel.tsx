'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// Grant a paid plan to one account (owner 26/11/2026). It sits on the user detail, next to the other things an operator does to one person.
//
// AUTHORIZATION LIVES IN THE API. `can` arrives as a prop from `permissionEngine.can` on the server and gates the AFFORDANCE only: this file names
// no role. `POST /api/admin/users/[id]/plan` enforces `users.plan.grant` on every request.
//
// The plan list is the one sold today (the same five ids the server accepts), named the way people see them. Stored ids differ from the names:
// pip = MoMo (7-day trial), momo / coco = Coco 1 / 3 months, promax1m / promax3m = Tappy. The Free plan is not grantable (nothing to grant).

type GrantablePlan = 'pip' | 'momo' | 'coco' | 'promax1m' | 'promax3m'
const GRANTABLE: readonly GrantablePlan[] = ['pip', 'momo', 'coco', 'promax1m', 'promax3m']
// Names and lengths come from the ONE plan table, so this list can never drift from what is sold.
const PLANS: ReadonlyArray<{ id: GrantablePlan; label: string; days: number }> = GRANTABLE.map((id) => ({
  id,
  label: `${PLAN_CONFIG[id].label} · ${PLAN_CONFIG[id].periodLabelVi ?? ''}`.trim(),
  days: PLAN_CONFIG[id].durationDays ?? 30,
}))

/** Matches the server schema, so the form refuses what the API would refuse. */
const REASON_MIN = 10
const REASON_MAX = 300
const DAYS_MAX = 365

type State = 'idle' | 'saving' | 'done' | 'error'

export function UserPlanGrantPanel({ userId, can }: { userId: string; can: boolean }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [plan, setPlan] = useState<(typeof PLANS)[number]['id']>('promax1m')
  const [days, setDays] = useState('30')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<State>('idle')

  const daysNum = Number(days)
  const ready = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= DAYS_MAX && reason.trim().length >= REASON_MIN

  const submit = useCallback(async () => {
    if (!ready) return
    setState('saving')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, days: daysNum, reason: reason.trim() }),
      })
      if (!res.ok) {
        setState('error')
        return
      }
      setReason('')
      setState('done')
    } catch {
      setState('error')
    }
  }, [ready, userId, plan, daysNum, reason])

  if (!can) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.plan.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('admin.plan.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="plan-grant-plan">
            {t('admin.plan.planLabel')}
          </label>
          <select
            id="plan-grant-plan"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={plan}
            onChange={(e) => {
              const next = PLANS.find((p) => p.id === e.target.value)
              if (next) {
                setPlan(next.id)
                setDays(String(next.days))
              }
              setState('idle')
            }}
          >
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="plan-grant-days">
            {t('admin.plan.daysLabel')}
          </label>
          <Input
            id="plan-grant-days"
            type="number"
            min={1}
            max={DAYS_MAX}
            value={days}
            onChange={(e) => {
              setDays(e.target.value)
              setState('idle')
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="plan-grant-reason">
            {t('admin.plan.reasonLabel')}
          </label>
          <Input
            id="plan-grant-reason"
            value={reason}
            maxLength={REASON_MAX}
            placeholder={t('admin.plan.reasonPlaceholder')}
            onChange={(e) => {
              setReason(e.target.value)
              setState('idle')
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void submit()} title={guard.title} disabled={!ready || state === 'saving' || guard.disabled}>
            {t('admin.plan.submit')}
          </Button>
          {state === 'done' && <span className="text-xs text-green-600 dark:text-green-400">{t('admin.plan.done')}</span>}
          {state === 'error' && <span className="text-xs text-destructive">{t('admin.plan.error')}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
