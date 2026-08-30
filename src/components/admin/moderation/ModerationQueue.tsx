'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// Module 09 — the moderation queue.
//
// CONTRACT — 04 §4.4 (the worklist), 12_RBAC §3 (who may do what), ADR-026
// (reporter provenance never reaches a client).
//
// The ORDER is the server's: `moderationService` asks for urgent-first then
// oldest-first, matching `idx_modq_status`. Re-sorting here would give the API
// and the screen two opinions about which report is next.
//
// AUTHORIZATION LIVES IN THE API. The three `can` flags gate affordances only,
// and this file names no role.
//
// 🔑 WHAT AN OPERATOR NEVER SEES: the reporter. The API projects an explicit
// column list that excludes `metadata`, so `reporter_source_id` is not in the
// payload to be rendered by accident.

interface QueueItem {
  id: string
  type: string
  status: string
  priority: number
  reported_by: string | null
  target_type: string
  target_id: string
  reason: string | null
  created_at: string
}

export interface ModerationCapabilities {
  dismiss: boolean
  hide: boolean
  delete: boolean
}

/** Matches `ResolveSchema` so the form refuses what the API would refuse. */
const REASON_MIN = 10
const reasonReady = (text: string) => text.trim().length >= REASON_MIN

type Load = 'loading' | 'ok' | 'empty' | 'error'
type Kind = 'dismiss' | 'hide' | 'restore' | 'delete'

const fmt = (iso: string) => new Date(iso).toLocaleString()

const PRIORITY_VARIANT: Record<number, 'default' | 'warning' | 'destructive'> = {
  1: 'default',
  2: 'warning',
  3: 'destructive',
}

export function ModerationQueue({ can }: { can: ModerationCapabilities }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [items, setItems] = useState<QueueItem[]>([])
  const [load, setLoad] = useState<Load>('loading')
  const [acting, setActing] = useState<{ id: string; kind: Kind } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const list = useCallback(async () => {
    setLoad('loading')
    try {
      const res = await fetch('/api/admin/moderation?status=pending')
      if (!res.ok) return setLoad('error')
      const json = await res.json()
      // A payload that is not a list is not an empty list — rendering it would
      // take the page down rather than say what went wrong.
      if (!Array.isArray(json?.data)) return setLoad('error')
      setItems(json.data as QueueItem[])
      setLoad(json.data.length === 0 ? 'empty' : 'ok')
    } catch {
      setLoad('error')
    }
  }, [])

  useEffect(() => { void list() }, [list])

  async function submit() {
    if (!acting || !reasonReady(reason)) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/moderation/${encodeURIComponent(acting.id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: acting.kind, reason: reason.trim() }),
      })
      if (!res.ok) {
        setNotice(t('admin.moderation.actionError'))
        return
      }
      setActing(null)
      setReason('')
      // Re-read: the server decides what is still open.
      await list()
    } catch {
      setNotice(t('admin.moderation.actionError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.moderation.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.moderation.subtitle')}</p>
      </div>

      {notice && <p className="text-destructive text-sm">{notice}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.moderation.pending')}</CardTitle>
        </CardHeader>
        <CardContent>
          {load === 'loading' ? (
            <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>
          ) : load === 'error' ? (
            // NOT the empty state. "No reports" is a claim a moderator acts on.
            <p className="text-destructive text-sm">{t('admin.moderation.error')}</p>
          ) : load === 'empty' ? (
            <p className="text-muted-foreground text-sm">{t('admin.moderation.empty')}</p>
          ) : (
            <ul aria-label={t('admin.moderation.pending')} className="divide-border divide-y">
              {items.map((it) => (
                <li key={it.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={PRIORITY_VARIANT[it.priority] ?? 'default'}>
                      {t(`admin.moderation.priority.${it.priority}`)}
                    </Badge>
                    <span className="text-sm font-medium">{t(`admin.moderation.type.${it.type}`)}</span>
                    <span className="text-muted-foreground text-xs">{fmt(it.created_at)}</span>
                  </div>
                  {/* The reported target and the stated reason. No reporter:
                      ADR-026 keeps provenance inside the service tier, and the
                      API never sends it. */}
                  <p className="text-sm">
                    {t('admin.moderation.reason')}: {it.reason ?? t('admin.moderation.noReason')}
                  </p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {it.target_type} · {it.target_id}
                  </p>

                  {acting?.id === it.id ? (
                    <div className="rounded-admin-md border-border space-y-2 border p-3">
                      <label htmlFor={`reason-${it.id}`} className="text-sm font-medium">
                        {t('admin.moderation.reasonLabel')}
                      </label>
                      <Input
                        id={`reason-${it.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t('admin.moderation.reasonPlaceholder')}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={acting.kind === 'delete' ? 'destructive' : 'default'}
                          onClick={() => void submit()}
                          disabled={busy || !reasonReady(reason) || guard.disabled}
                          title={guard.title}
                        >
                          {t(`admin.moderation.confirm.${acting.kind}`)}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setActing(null); setReason('') }}
                        >
                          {t('admin.common.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {can.dismiss && (
                        <Button size="sm" variant="outline" onClick={() => setActing({ id: it.id, kind: 'dismiss' })}>
                          {t('admin.moderation.action.dismiss')}
                        </Button>
                      )}
                      {can.hide && it.target_type === 'review' && (
                        <Button size="sm" variant="outline" onClick={() => setActing({ id: it.id, kind: 'hide' })}>
                          {t('admin.moderation.action.hide')}
                        </Button>
                      )}
                      {can.delete && it.target_type === 'review' && (
                        <Button size="sm" variant="destructive" onClick={() => setActing({ id: it.id, kind: 'delete' })}>
                          {t('admin.moderation.action.delete')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Named rather than silently missing, the same way Module 04 names its
          absent sections. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.moderation.notShipped.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>{t('admin.moderation.notShipped.warn')}</li>
            <li>{t('admin.moderation.notShipped.userActions')}</li>
            <li>{t('admin.moderation.notShipped.contentReports')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
