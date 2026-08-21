'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Controller V2 — Component 11 Session Security: the Controller surface.
//
// C11's APIs, SQL functions and permissions have been in production since
// 2026-08-15 (ADR-021) with no way to reach them. This panel is that way.
//
// CONTRACT — 11_COMPONENT11_SESSION_SECURITY_CONTRACT.md §7:
//   • ONE SUBJECT AT A TIME, addressed by user_id. §7 refuses a platform-wide
//     listing outright — "a compromise-amplifying surface and nothing requires
//     it" — which is why this is a panel inside the user detail rather than a
//     /admin/security/sessions page.
//   • NEVER EXPOSED: tokens, cookie values, IP address, raw user-agent,
//     credentials, secrets. Only a coarse platform class.
//   • admin surface only; no end-user self-service in v1.
//
// AUTHORIZATION LIVES IN THE API. Both `can` flags arrive as props from
// `permissionEngine.can` on the server and gate AFFORDANCES only. This file
// names no role and compares nothing: the PDP is the single decision path, and
// a component that re-derives permission is a second one.

/** Exactly the eight columns `fn_session_inventory` projects. Nothing else. */
interface SessionRow {
  id: string
  user_id: string
  state: 'active' | 'expired'
  created_at: string | null
  last_refreshed_at: string | null
  expires_at: string | null
  aal: string | null
  client_class: 'web' | 'native' | 'unknown'
}

/** What both revoke endpoints return: a count and WHY it was that count. */
interface RevokeResult {
  revoked: number
  reason: 'ok' | 'not_found' | 'owner_protected'
}

export interface SessionsCapabilities {
  /** `security.sessions.read` — may list this subject's sessions at all. */
  read: boolean
  /** `security.sessions.revoke` — may end a session. */
  revoke: boolean
}

/** §7: limit <= 50. Twenty is the contract's default and plenty for one person. */
const PAGE_SIZE = 20

/**
 * `ForceLogoutSchema` requires a reason of at least 3 characters, and §6 says
 * why: a forced logout with no recorded reason "is indistinguishable from an
 * attack when the audit trail is read later".
 *
 * ONE predicate, used by both the button's disabled state and the handler.
 * Two copies of this rule would let either be deleted with nothing failing —
 * which is exactly what mutation C17/C18/C19 demonstrated when it was two.
 */
const REASON_MIN = 3
const forceLogoutReady = (reason: string) => reason.trim().length >= REASON_MIN

type Load = 'loading' | 'ok' | 'empty' | 'error'

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export function UserSessionsPanel({
  userId,
  can,
}: {
  userId: string
  can: SessionsCapabilities
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<SessionRow[]>([])
  const [load, setLoad] = useState<Load>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forcing, setForcing] = useState(false)
  const [reason, setReason] = useState('')

  const list = useCallback(async () => {
    setLoad('loading')
    try {
      const res = await fetch(
        `/api/admin/security/sessions?userId=${encodeURIComponent(userId)}&limit=${PAGE_SIZE}`
      )
      if (!res.ok) return setLoad('error')
      const json = await res.json()
      const data = (json?.data ?? []) as SessionRow[]
      setRows(data)
      // A failed read already returned above. Reaching here with nothing means
      // the account genuinely has no sessions — a different fact, and one an
      // operator acts on.
      setLoad(data.length === 0 ? 'empty' : 'ok')
    } catch {
      setLoad('error')
    }
  }, [userId])

  useEffect(() => {
    // An actor who may not list must not cause a listing. Checked here rather
    // than only at render, so no request escapes before the early return.
    if (!can.read) return
    void list()
  }, [can.read, list])

  /** Turn a RevokeResult into the sentence it actually justifies. */
  function describe(result: RevokeResult): string {
    if (result.reason === 'owner_protected') return t('admin.sessions.ownerProtected')
    if (result.reason === 'not_found') return t('admin.sessions.notFound')
    return t('admin.sessions.revoked').replace('{count}', String(result.revoked))
  }

  async function run(request: () => Promise<Response>) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await request()
      if (!res.ok) {
        setNotice(t('admin.sessions.revokeError'))
        return
      }
      const json = await res.json()
      setNotice(describe(json?.data as RevokeResult))
      // Re-read rather than splice: the server decides what survived, and a
      // list edited locally can show a session that is already gone.
      await list()
    } catch {
      setNotice(t('admin.sessions.revokeError'))
    } finally {
      setBusy(false)
    }
  }

  const revokeOne = (id: string) =>
    run(() => fetch(`/api/admin/security/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }))

  async function forceLogout() {
    // Same predicate the button uses, so the operator learns the rule from the
    // form rather than from a 422 — and there is only one place to change it.
    if (!forceLogoutReady(reason)) return
    const trimmed = reason.trim()
    await run(() =>
      fetch('/api/admin/security/sessions/force-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: trimmed }),
      })
    )
    setForcing(false)
    setReason('')
  }

  if (!can.read) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t('admin.sessions.title')}</CardTitle>
        {can.revoke && rows.length > 0 && !forcing && (
          <Button variant="outline" size="sm" onClick={() => setForcing(true)} disabled={busy}>
            {t('admin.sessions.forceLogout')}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs">{t('admin.sessions.subtitle')}</p>

        {forcing && (
          <div className="rounded-admin-md border-border space-y-2 border p-3">
            <label htmlFor="session-force-reason" className="text-sm font-medium">
              {t('admin.sessions.reasonLabel')}
            </label>
            <Input
              id="session-force-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('admin.sessions.reasonPlaceholder')}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void forceLogout()}
                disabled={busy || !forceLogoutReady(reason)}
              >
                {t('admin.sessions.forceLogoutConfirm')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setForcing(false)
                  setReason('')
                }}
              >
                {t('admin.common.cancel')}
              </Button>
            </div>
          </div>
        )}

        {notice && <p className="text-sm font-medium">{notice}</p>}

        {load === 'loading' ? (
          <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>
        ) : load === 'error' ? (
          // NOT the empty state. "No active sessions" is a claim an operator
          // acts on; saying it because the read failed is the opposite of true.
          <p className="text-destructive text-sm">{t('admin.sessions.error')}</p>
        ) : load === 'empty' ? (
          <p className="text-muted-foreground text-sm">{t('admin.sessions.empty')}</p>
        ) : (
          <ul aria-label={t('admin.sessions.title')} className="divide-border divide-y">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={s.state === 'active' ? 'default' : 'secondary'}>
                      {t(`admin.sessions.state.${s.state}`)}
                    </Badge>
                    <span className="text-sm">{t(`admin.sessions.client.${s.client_class}`)}</span>
                    {s.aal && <span className="text-muted-foreground text-xs">{s.aal}</span>}
                  </div>
                  {/* Three timestamps and a class. No IP, no user-agent — §7
                      forbids them, and the SQL function never sends them. */}
                  <div className="text-muted-foreground text-xs">
                    {t('admin.sessions.lastActive')}: {fmt(s.last_refreshed_at)} ·{' '}
                    {t('admin.sessions.started')}: {fmt(s.created_at)} ·{' '}
                    {t('admin.sessions.expires')}: {fmt(s.expires_at)}
                  </div>
                </div>
                {can.revoke && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revokeOne(s.id)}
                    disabled={busy}
                  >
                    {t('admin.sessions.revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
