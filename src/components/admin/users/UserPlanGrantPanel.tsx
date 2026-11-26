'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { isLifetimeEnd } from '@/lib/admin/users/planGrant'

// Grant, see and take back a paid plan for one account (owner 26/11/2026). It sits on the user detail, next to the other things an operator does to
// one person.
//
// AUTHORIZATION LIVES IN THE API. `can` / `canRevoke` arrive as props from `permissionEngine.can` on the server and gate the AFFORDANCE only: this file
// names no role. `POST /api/admin/users/[id]/plan` and `…/plan/revoke` enforce `users.plan.grant` / `users.plan.revoke` on every request.
//
// The plan list is the one sold today (the same five ids the server accepts), named the way people see them. Stored ids differ from the names:
// pip = MoMo (7-day trial), momo / coco = Coco 1 / 3 months, promax1m / promax3m = Tappy. The Free plan is not grantable (nothing to grant).
// The length is 1 to 12 months, or no expiry (stored by the server as a date 100 years away; shown here as "no expiry").

type GrantablePlan = 'pip' | 'momo' | 'coco' | 'promax1m' | 'promax3m'
const GRANTABLE: readonly GrantablePlan[] = ['pip', 'momo', 'coco', 'promax1m', 'promax3m']
// Names come from the ONE plan table, so this list can never drift from what is sold.
// One entry per plan NAME: Coco and Tappy each exist as a 1- and a 3-month plan id, but the length is picked separately below, so listing both made "Coco, Coco, Tappy, Tappy".
const PLANS: ReadonlyArray<{ id: GrantablePlan; label: string }> = GRANTABLE
  .map((id) => ({ id, label: PLAN_CONFIG[id].label }))
  .filter((p, i, all) => all.findIndex((o) => o.label === p.label) === i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Matches the server schema, so the form refuses what the API would refuse. */
const REASON_MIN = 10
const REASON_MAX = 300

type State = 'idle' | 'saving' | 'done' | 'error'
interface GrantRow { grant_ref: string; plan: string; label: string; ends_at: string | null; reason: string | null; granted_at: string; revoked: boolean }
interface Current { plan: string; status: string; ends_at: string | null; source: string | null }

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '')

export function UserPlanGrantPanel({ userId, can, canRevoke }: { userId: string; can: boolean; canRevoke: boolean }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [plan, setPlan] = useState<GrantablePlan>('promax1m')
  const [length, setLength] = useState<string>('1') // '1'..'12' or 'lifetime'
  const [reason, setReason] = useState('')
  const [state, setState] = useState<State>('idle')
  const [current, setCurrent] = useState<Current | null>(null)
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({})
  const [revokeState, setRevokeState] = useState<Record<string, State>>({})

  const base = `/api/admin/users/${encodeURIComponent(userId)}/plan`

  const reload = useCallback(async () => {
    try {
      const res = await fetch(base)
      if (!res.ok) return
      const json = await res.json()
      setCurrent(json?.data?.current ?? null)
      setGrants(Array.isArray(json?.data?.grants) ? (json.data.grants as GrantRow[]) : [])
      setLoaded(true)
    } catch {
      /* the list is a convenience; the form still works */
    }
  }, [base])

  useEffect(() => {
    if (can) void reload()
  }, [can, reload])

  const ready = reason.trim().length >= REASON_MIN

  const submit = useCallback(async () => {
    if (!ready) return
    setState('saving')
    try {
      const body = length === 'lifetime' ? { plan, lifetime: true, reason: reason.trim() } : { plan, months: Number(length), reason: reason.trim() }
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        setState('error')
        return
      }
      setReason('')
      setState('done')
      void reload()
    } catch {
      setState('error')
    }
  }, [ready, base, plan, length, reason, reload])

  const revoke = useCallback(
    async (grantRef: string) => {
      const why = (revokeReason[grantRef] ?? '').trim()
      if (why.length < REASON_MIN) return
      setRevokeState((s) => ({ ...s, [grantRef]: 'saving' }))
      try {
        const res = await fetch(`${base}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_ref: grantRef, reason: why }) })
        setRevokeState((s) => ({ ...s, [grantRef]: res.ok ? 'done' : 'error' }))
        if (res.ok) void reload()
      } catch {
        setRevokeState((s) => ({ ...s, [grantRef]: 'error' }))
      }
    },
    [base, revokeReason, reload],
  )

  if (!can) return null

  const endsLabel = (iso: string | null) => (isLifetimeEnd(iso) ? t('admin.plan.noExpiry') : fmtDate(iso))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.plan.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('admin.plan.subtitle')}</p>
        {loaded && (
          <p className="text-xs">
            {current && current.status === 'active' && current.ends_at && new Date(current.ends_at).getTime() > Date.now()
              ? t('admin.plan.current', {
                  plan: PLAN_CONFIG[current.plan as keyof typeof PLAN_CONFIG]?.label ?? current.plan,
                  until: endsLabel(current.ends_at),
                })
              : t('admin.plan.currentNone')}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="plan-grant-plan">
              {t('admin.plan.planLabel')}
            </label>
            <select
              id="plan-grant-plan"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value as GrantablePlan)
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
            <label className="text-xs font-medium" htmlFor="plan-grant-length">
              {t('admin.plan.lengthLabel')}
            </label>
            <select
              id="plan-grant-length"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={length}
              onChange={(e) => {
                setLength(e.target.value)
                setState('idle')
              }}
            >
              {MONTHS.map((m) => (
                <option key={m} value={String(m)}>
                  {t('admin.plan.months', { n: String(m) })}
                </option>
              ))}
              <option value="lifetime">{t('admin.plan.noExpiry')}</option>
            </select>
          </div>
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

        {grants.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium">{t('admin.plan.grantsTitle')}</p>
            <ul className="space-y-2">
              {grants.map((g) => {
                const rs = revokeState[g.grant_ref] ?? 'idle'
                return (
                  <li key={g.grant_ref} className="space-y-1 rounded-md border p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong>{g.label}</strong> · {t('admin.plan.until', { date: endsLabel(g.ends_at) })} · {fmtDate(g.granted_at)}
                      </span>
                      {g.revoked && <span className="text-muted-foreground">{t('admin.plan.revoked')}</span>}
                    </div>
                    {g.reason && <p className="text-muted-foreground">{g.reason}</p>}
                    {canRevoke && !g.revoked && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="h-8 min-w-[12rem] flex-1"
                          value={revokeReason[g.grant_ref] ?? ''}
                          maxLength={REASON_MAX}
                          placeholder={t('admin.plan.revokeReasonPlaceholder')}
                          onChange={(e) => setRevokeReason((s) => ({ ...s, [g.grant_ref]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          title={guard.title}
                          disabled={(revokeReason[g.grant_ref] ?? '').trim().length < REASON_MIN || rs === 'saving' || guard.disabled}
                          onClick={() => void revoke(g.grant_ref)}
                        >
                          {t('admin.plan.revoke')}
                        </Button>
                        {rs === 'error' && <span className="text-destructive">{t('admin.plan.revokeError')}</span>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
