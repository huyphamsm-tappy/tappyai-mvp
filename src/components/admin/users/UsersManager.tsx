'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { UserSessionsPanel } from './UserSessionsPanel'

// Module 08 User Management — the Controller surface.
//
// THIS COMPONENT MAKES NO AUTHORIZATION DECISION. It receives booleans the
// server derived from the PDP and renders accordingly; it never sees a role,
// and it never infers one. The API re-enforces every action independently, so a
// tampered `can` prop changes what is drawn and nothing else.
//
// FIELD VISIBILITY IS THE SERVER'S ANSWER, NOT THIS COMPONENT'S. ADR-023 gates
// `email` behind `users.email.read_full` and `ban_reason` behind
// `users.ban_reason.read`, and the API already applies both — it returns the
// masked address with `email_masked`, and null with `ban_reason_withheld`. This
// component renders what it was given. It must never re-derive either, because
// two implementations of one rule is how they drift.

type Standing = 'active' | 'suspended' | 'banned'

interface UserRow {
  id: string
  full_name: string | null
  created_at: string | null
  standing: Standing
  suspended_until: string | null
}

interface UserDetail extends UserRow {
  email: string | null
  email_masked: boolean
  language: string | null
  follower_count: number | null
  is_suspended: boolean
  is_banned: boolean
  ban_reason: string | null
  ban_reason_withheld: boolean
}

export interface UsersCapabilities {
  detail: boolean
  suspend: boolean
  unsuspend: boolean
  ban: boolean
  unban: boolean
  emailSearch: boolean
  /** C11 `security.sessions.read` — may list this subject's sessions. */
  sessionsRead: boolean
  /** C11 `security.sessions.revoke` — may end one. Independent of the above. */
  sessionsRevoke: boolean
}

const STANDING_BADGE: Record<Standing, BadgeProps['variant']> = {
  active: 'success',
  suspended: 'warning',
  banned: 'destructive',
}

type ActionKind = 'suspend' | 'unsuspend' | 'ban' | 'unban'

/** The reason floor is 19_Security.md §5 and the API rejects anything shorter. */
const REASON_MIN = 20

export function UsersManager({ can }: { can: UsersCapabilities }) {
  const { t, locale } = useTranslation()

  const [rows, setRows] = useState<UserRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Standing | 'all'>('all')

  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [action, setAction] = useState<ActionKind | null>(null)
  const [reason, setReason] = useState('')
  const [durationHours, setDurationHours] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fmtDate = useCallback(
    (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB') : '—'),
    [locale]
  )

  const load = useCallback(
    async (opts: { append?: boolean; cursor?: string | null } = {}) => {
      setLoading(true)
      setLoadError(null)
      try {
        const params = new URLSearchParams()
        if (query.trim().length >= 2) params.set('q', query.trim())
        if (status !== 'all') params.set('status', status)
        if (opts.cursor) params.set('cursor', opts.cursor)

        const res = await fetch(`/api/admin/users?${params.toString()}`)
        const json = await res.json()
        if (!res.ok) {
          // The server's own refusal text is shown rather than a generic
          // failure: a 403 on email search and a 503 on the status filter mean
          // different things, and collapsing them hides which one happened.
          const code = json?.error?.code
          throw new Error(
            code === 'FORBIDDEN' && query.includes('@')
              ? t('admin.users.error.emailSearchDenied')
              : (json?.error?.message ?? t('admin.users.error.load'))
          )
        }
        setRows((prev) => (opts.append ? [...prev, ...(json.data ?? [])] : (json.data ?? [])))
        setCursor(json.meta?.page?.cursor ?? null)
        setHasMore(Boolean(json.meta?.page?.hasMore))
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t('admin.users.error.load'))
        if (!opts.append) setRows([])
      } finally {
        setLoading(false)
      }
    },
    // `t` omitted deliberately: useTranslation() returns a fresh closure each
    // render, so depending on it would refetch on every render — an infinite
    // loop. Same reasoning, and the same suppression, as RolesManager.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, status]
  )

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(id: string) {
    if (!can.detail) return
    setDetailLoading(true)
    setAction(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? t('admin.users.error.detail'))
      setDetail(json.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.users.error.detail'))
    } finally {
      setDetailLoading(false)
    }
  }

  async function submitAction() {
    if (!detail || !action) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { reason: reason.trim() }
      if (action === 'suspend' && durationHours.trim()) {
        body.duration_hours = Number(durationHours.trim())
      }
      const res = await fetch(`/api/admin/users/${detail.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? t('admin.users.error.action'))

      // A ban does not end a session (ADR-023 / 10 §4). The API says so in
      // `session_revocation_pending`, and the operator is told rather than left
      // to assume the user is gone.
      toast.success(
        json.data?.session_revocation_pending
          ? t('admin.users.ban.sessionsPending')
          : t('admin.users.action.done')
      )
      setAction(null)
      setReason('')
      setDurationHours('')
      await openDetail(detail.id)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('admin.users.error.action'))
    } finally {
      setSubmitting(false)
    }
  }

  const available: ActionKind[] = detail
    ? ([
        detail.standing !== 'banned' && can.suspend ? 'suspend' : null,
        detail.is_suspended && can.unsuspend ? 'unsuspend' : null,
        detail.standing !== 'banned' && can.ban ? 'ban' : null,
        detail.is_banned && can.unban ? 'unban' : null,
      ].filter(Boolean) as ActionKind[])
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.users.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.users.subtitle')}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              can.emailSearch
                ? t('admin.users.search.placeholderWithEmail')
                : t('admin.users.search.placeholder')
            }
            className="max-w-sm"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as Standing | 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.users.filter.all')}</SelectItem>
              <SelectItem value="active">{t('admin.users.standing.active')}</SelectItem>
              <SelectItem value="suspended">{t('admin.users.standing.suspended')}</SelectItem>
              <SelectItem value="banned">{t('admin.users.standing.banned')}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => void load()} disabled={loading}>
            {t('admin.users.search.button')}
          </Button>
        </CardHeader>

        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">{t('admin.common.loading')}</p>
          ) : loadError ? (
            <p className="text-destructive py-6 text-sm">{loadError}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">{t('admin.users.empty')}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.users.column.name')}</TableHead>
                    <TableHead>{t('admin.users.column.standing')}</TableHead>
                    <TableHead>{t('admin.users.column.joined')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => void openDetail(row.id)}
                      className={can.detail ? 'cursor-pointer' : undefined}
                    >
                      <TableCell>{row.full_name ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={STANDING_BADGE[row.standing]}>
                          {t(`admin.users.standing.${row.standing}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtDate(row.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hasMore && (
                <Button
                  variant="outline"
                  className="mt-4"
                  disabled={loading}
                  onClick={() => void load({ append: true, cursor })}
                >
                  {t('admin.users.loadMore')}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {detailLoading && <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>}

      {detail && !detailLoading && (
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.users.detail.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('admin.users.column.name')}</dt>
                <dd>{detail.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('admin.users.detail.email')}</dt>
                <dd>
                  {detail.email ?? t('admin.users.detail.emailNone')}
                  {detail.email_masked && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      ({t('admin.users.detail.emailMasked')})
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('admin.users.column.standing')}</dt>
                <dd>
                  <Badge variant={STANDING_BADGE[detail.standing]}>
                    {t(`admin.users.standing.${detail.standing}`)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('admin.users.detail.language')}</dt>
                <dd>{detail.language ?? '—'}</dd>
              </div>
              {detail.standing === 'suspended' && (
                <div>
                  <dt className="text-muted-foreground">{t('admin.users.detail.suspendedUntil')}</dt>
                  <dd>
                    {detail.suspended_until
                      ? fmtDate(detail.suspended_until)
                      : t('admin.users.detail.suspendedIndefinite')}
                  </dd>
                </div>
              )}
              {detail.is_banned && (
                <div>
                  <dt className="text-muted-foreground">{t('admin.users.detail.banReason')}</dt>
                  <dd>
                    {detail.ban_reason ??
                      (detail.ban_reason_withheld
                        ? t('admin.users.detail.banReasonWithheld')
                        : t('admin.users.detail.banReasonNone'))}
                  </dd>
                </div>
              )}
            </dl>

            {/* The raw flag and the derived standing disagree exactly when a
                suspension has expired and no cron has tidied it. An admin
                deciding whether to unsuspend needs to see both. */}
            {detail.is_suspended && detail.standing === 'active' && (
              <p className="text-muted-foreground text-xs">{t('admin.users.detail.rawFlagsNote')}</p>
            )}

            {available.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {available.map((kind) => (
                  <Button
                    key={kind}
                    variant={kind === 'ban' ? 'destructive' : 'outline'}
                    onClick={() => {
                      setAction(kind)
                      setReason('')
                      setDurationHours('')
                    }}
                  >
                    {t(`admin.users.action.${kind}`)}
                  </Button>
                ))}
              </div>
            )}

            {action && (
              <div className="space-y-3 rounded-md border p-4">
                <p className="font-medium">{t(`admin.users.action.${action}`)}</p>
                {action === 'ban' && (
                  <p className="text-muted-foreground text-xs">{t('admin.users.ban.warning')}</p>
                )}
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('admin.users.action.reason')}
                />
                {action === 'suspend' && (
                  <Input
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    inputMode="numeric"
                    placeholder={t('admin.users.action.durationHours')}
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => void submitAction()}
                    disabled={submitting || reason.trim().length < REASON_MIN}
                  >
                    {t('admin.users.action.confirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(null)} disabled={submitting}>
                    {t('admin.users.action.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Component 11, and it belongs HERE rather than at a route of its own.
          `11_…` §7 refuses a platform-wide session list outright — "a
          compromise-amplifying surface and nothing requires it" — and scopes
          the inventory to one subject at a time. The user detail IS that
          subject, and it is where an operator already stands when deciding
          whether a ban needs a sign-out to go with it. */}
      {detail && !detailLoading && (
        <UserSessionsPanel
          userId={detail.id}
          can={{ read: can.sessionsRead, revoke: can.sessionsRevoke }}
        />
      )}
    </div>
  )
}
