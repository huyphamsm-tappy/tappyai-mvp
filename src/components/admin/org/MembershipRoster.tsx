'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { getDepartment } from '@/lib/controller/org'

// Department Memberships — the roster (Owner Decision D6, 2026-08-22).
//
// READ-ONLY, and that is a decision rather than an unfinished state. The
// membership API supports assign, suspend and remove; D6 leaves all three where
// they are, because destructive UAT is not authorized and a control that cannot
// be verified on production should not ship. There is no mutation path in this
// file, and a test asserts that.
//
// AUTHORIZATION LIVES IN THE API. This component names no role and takes no
// `can` flags — every operator who can open the page can read the whole roster,
// which is what `security.membership.read` means. There is nothing here to hide
// from some readers and show to others.
//
// WHAT IS SHOWN, AND WHAT IS NOT. The API returns exactly what the membership
// row holds: user id, department, org role, scope, status. It does NOT return
// an email, a name or an avatar, and this file does not go looking for one —
// joining a membership to a profile would put consumer-app identity on a
// Controller screen that never asked for it.
//
// 🔑 THE DEPARTMENT LABEL COMES FROM THE REGISTRY, NOT FROM THE ID. `ai_data`
// is translated under `admin.dept.aiData` and `business_development` under
// `admin.dept.bizDev`, so `admin.dept.${id}` would miss on exactly those two —
// and `translate` falls back to returning the key, which puts a raw i18n key on
// screen. `departments.ts` holds the real key for each id; that is the source.

interface Membership {
  userId: string
  departmentId: string
  orgRole: string
  scope: string
  status: string
}

type Load = 'loading' | 'ok' | 'empty' | 'error'

/** Only the values `types.ts` defines. An unknown one renders verbatim rather
 *  than as a missing-key string — an unrecognised value is data, not a label. */
const ORG_ROLE_KEY: Record<string, string> = {
  ULTIMATE_OWNER: 'admin.memberships.orgRole.ultimateOwner',
  DEPARTMENT_HEAD: 'admin.memberships.orgRole.departmentHead',
  MEMBER: 'admin.memberships.orgRole.member',
}
const STATUS_KEY: Record<string, string> = {
  active: 'admin.memberships.status.active',
  suspended: 'admin.memberships.status.suspended',
}

export function MembershipRoster() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Membership[]>([])
  const [load, setLoad] = useState<Load>('loading')

  const list = useCallback(async () => {
    setLoad('loading')
    try {
      const res = await fetch('/api/admin/org/memberships')
      if (!res.ok) return setLoad('error')
      const json = await res.json()
      // A payload that is not a list is not an empty list. "No memberships" is
      // a claim an operator would act on — it must never stand in for a
      // malformed response.
      if (!Array.isArray(json?.data)) return setLoad('error')
      setRows(json.data as Membership[])
      setLoad(json.data.length === 0 ? 'empty' : 'ok')
    } catch {
      setLoad('error')
    }
  }, [])

  useEffect(() => { void list() }, [list])

  const label = (map: Record<string, string>, value: string) => {
    const key = map[value]
    return key ? t(key) : value
  }
  const departmentLabel = (id: string) => {
    const key = getDepartment(id)?.name
    return key ? t(key) : id
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.memberships.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.memberships.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.memberships.active')}</CardTitle>
        </CardHeader>
        <CardContent>
          {load === 'loading' ? (
            <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>
          ) : load === 'error' ? (
            // NOT the empty state.
            <p className="text-destructive text-sm">{t('admin.memberships.error')}</p>
          ) : load === 'empty' ? (
            <p className="text-muted-foreground text-sm">{t('admin.memberships.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('admin.memberships.active')}>
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">{t('admin.memberships.col.department')}</th>
                    <th className="py-2 pr-4 font-medium">{t('admin.memberships.col.user')}</th>
                    <th className="py-2 pr-4 font-medium">{t('admin.memberships.col.orgRole')}</th>
                    <th className="py-2 pr-4 font-medium">{t('admin.memberships.col.scope')}</th>
                    <th className="py-2 font-medium">{t('admin.memberships.col.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((m) => (
                    <tr key={`${m.userId}:${m.departmentId}`}>
                      <td className="py-2 pr-4">{departmentLabel(m.departmentId)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{m.userId}</td>
                      <td className="py-2 pr-4">{label(ORG_ROLE_KEY, m.orgRole)}</td>
                      <td className="py-2 pr-4">{m.scope}</td>
                      <td className="py-2">
                        <Badge variant={m.status === 'active' ? 'default' : 'warning'}>
                          {label(STATUS_KEY, m.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
