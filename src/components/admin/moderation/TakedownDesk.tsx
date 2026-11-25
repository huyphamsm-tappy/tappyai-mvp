'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// The authority takedown desk (owner 25/11/2026): the register of requests to remove content, with the legal clock, and the form to record a new one.
// Authorization lives in the API (every action re-checks its own permission, and an account needs the ban permission too); the `can` flags only decide which buttons are drawn.
// Nothing here removes anything by itself: a person records a request and a person presses "take down now" after a confirmation. The order of the list is the server's (most urgent first).

type Urgency = 'standard_24h' | 'emergency_6h' | 'complaint_48h'
type TargetType = 'review' | 'comment' | 'plan_share' | 'user'
type Status = 'received' | 'actioned' | 'rejected' | 'needs_info'
type Clock = 'closed' | 'ok' | 'at_risk' | 'overdue'
interface Row {
  id: string; received_at: string; source: 'authority' | 'user_complaint'; agency: string; reference_no: string | null; legal_basis: string | null
  urgency: Urgency; due_at: string; target_type: TargetType; target_id: string; status: Status; action_taken: 'hidden' | 'deleted' | 'banned' | 'none' | null
  actioned_at: string | null; notes: string | null; clock: Clock; minutes_left: number | null
}

export interface TakedownCapabilities { hide: boolean; ban: boolean }
type View = 'open' | 'recent'
type Load = 'loading' | 'ok' | 'error'
type Act = { id: string; kind: 'execute' | 'reject' | 'needs_info' }

const NOTE_MIN = 3
const fmt = (iso: string) => new Date(iso).toLocaleString()
const CLOCK_KEY = { ok: 'admin.takedown.clock.ok', at_risk: 'admin.takedown.clock.at_risk', overdue: 'admin.takedown.clock.overdue', closed: 'admin.takedown.clock.closed' } as const
const STATUS_KEY = { received: 'admin.takedown.status.received', needs_info: 'admin.takedown.status.needs_info', actioned: 'admin.takedown.status.actioned', rejected: 'admin.takedown.status.rejected' } as const
const TARGET_KEY = { review: 'admin.takedown.target.review', comment: 'admin.takedown.target.comment', plan_share: 'admin.takedown.target.plan_share', user: 'admin.takedown.target.user' } as const
const URGENCY_KEY = { standard_24h: 'admin.takedown.urgency.standard_24h', emergency_6h: 'admin.takedown.urgency.emergency_6h', complaint_48h: 'admin.takedown.urgency.complaint_48h' } as const
const TAKEN_KEY = { hidden: 'admin.takedown.action.taken.hidden', deleted: 'admin.takedown.action.taken.deleted', banned: 'admin.takedown.action.taken.banned', none: 'admin.takedown.action.taken.none' } as const
const CLOCK_VARIANT: Record<Clock, 'default' | 'warning' | 'destructive'> = { closed: 'default', ok: 'default', at_risk: 'warning', overdue: 'destructive' }

/** The value of a <input type="datetime-local"> for "now" in the person's own time zone. */
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

interface Form { source: 'authority' | 'user_complaint'; agency: string; reference_no: string; legal_basis: string; urgency: Urgency; received: string; target_type: TargetType; target_id: string; notes: string; execute: boolean }
const emptyForm = (): Form => ({ source: 'authority', agency: '', reference_no: '', legal_basis: '', urgency: 'standard_24h', received: nowLocal(), target_type: 'review', target_id: '', notes: '', execute: true })

export function TakedownDesk({ can }: { can: TakedownCapabilities }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [view, setView] = useState<View>('open')
  const [load, setLoad] = useState<Load>('loading')
  const [rows, setRows] = useState<Row[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [act, setAct] = useState<Act | null>(null)
  const [note, setNote] = useState('')
  const [form, setForm] = useState<Form>(emptyForm())

  const read = useCallback(async (v: View) => {
    setLoad('loading')
    try {
      const res = await fetch(`/api/admin/takedowns?view=${v}`)
      if (!res.ok) return setLoad('error')
      const json = await res.json()
      if (!Array.isArray(json?.data)) return setLoad('error')
      setRows(json.data as Row[])
      setLoad('ok')
    } catch { setLoad('error') }
  }, [])
  useEffect(() => { void read(view) }, [view, read])

  async function send(url: string, body: unknown, okMsg: string, errFor?: (code: string | undefined) => string | null): Promise<boolean> {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const code = (await res.json().catch(() => null))?.error?.code as string | undefined
        setNotice((errFor && errFor(code)) ?? t('admin.takedown.act.error'))
        return false
      }
      setNotice(okMsg)
      return true
    } catch { setNotice(t('admin.takedown.act.error')); return false } finally { setBusy(false) }
  }

  const canExecute = (r: Row) => can.hide && (r.target_type !== 'user' || can.ban)
  const clockText = (r: Row) => {
    if (r.minutes_left === null) return null
    const m = Math.abs(r.minutes_left)
    const vars = { h: String(Math.floor(m / 60)), m: String(m % 60) }
    return r.minutes_left < 0 ? t('admin.takedown.late', vars) : t('admin.takedown.left', vars)
  }

  async function submitAct(r: Row) {
    if (!act) return
    if (act.kind === 'execute') {
      if (await send(`/api/admin/takedowns/${encodeURIComponent(r.id)}`, { action: 'execute' }, t('admin.takedown.act.done'))) { setAct(null); await read(view) }
      return
    }
    if (note.trim().length < NOTE_MIN) return
    if (await send(`/api/admin/takedowns/${encodeURIComponent(r.id)}`, { action: act.kind, notes: note.trim() }, t('admin.takedown.act.done'))) { setAct(null); setNote(''); await read(view) }
  }

  const formReady = form.agency.trim().length > 0 && form.target_id.trim().length > 0 && form.received.length > 0
  async function submitNew() {
    if (!formReady) return
    const body: Record<string, unknown> = {
      source: form.source, agency: form.agency.trim(), urgency: form.urgency, received_at: new Date(form.received).toISOString(), target_type: form.target_type, target_id: form.target_id.trim(), execute: form.execute && can.hide && (form.target_type !== 'user' || can.ban),
    }
    if (form.reference_no.trim()) body.reference_no = form.reference_no.trim()
    if (form.legal_basis.trim()) body.legal_basis = form.legal_basis.trim()
    if (form.notes.trim()) body.notes = form.notes.trim()
    const ok = await send('/api/admin/takedowns', body, t('admin.takedown.new.done'), (code) => code === 'NOT_FOUND' ? t('admin.takedown.new.notFound') : code === 'CONFLICT' ? t('admin.takedown.new.duplicate') : code === 'VALIDATION_ERROR' ? t('admin.takedown.new.invalid') : null)
    if (ok) { setForm(emptyForm()); await read(view) }
  }

  const field = 'border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
  const counts = { open: rows.filter((r) => r.clock !== 'closed').length, at_risk: rows.filter((r) => r.clock === 'at_risk').length, overdue: rows.filter((r) => r.clock === 'overdue').length }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t('admin.takedown.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('admin.takedown.subtitle')}</p>
        <p className="text-muted-foreground text-xs">{t('admin.takedown.windows')}</p>
        {!can.hide && <p className="text-destructive text-xs">{t('admin.takedown.noPerm')}</p>}
        {can.hide && !can.ban && <p className="text-muted-foreground text-xs">{t('admin.takedown.noPermBan')}</p>}
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        <Button role="tab" aria-selected={view === 'open'} size="sm" variant={view === 'open' ? 'default' : 'outline'} onClick={() => { setView('open'); setNotice(null) }}>{t('admin.takedown.view.open')}</Button>
        <Button role="tab" aria-selected={view === 'recent'} size="sm" variant={view === 'recent' ? 'default' : 'outline'} onClick={() => { setView('recent'); setNotice(null) }}>{t('admin.takedown.view.recent')}</Button>
      </div>

      {load === 'ok' && (
        <dl className="grid grid-cols-3 gap-3">
          <div className="border-border rounded-md border p-3"><dt className="text-muted-foreground text-xs">{t('admin.takedown.count.open')}</dt><dd className="text-xl font-semibold">{counts.open}</dd></div>
          <div className="border-border rounded-md border p-3"><dt className="text-muted-foreground text-xs">{t('admin.takedown.count.atRisk')}</dt><dd className="text-xl font-semibold">{counts.at_risk}</dd></div>
          <div className="border-border rounded-md border p-3"><dt className="text-muted-foreground text-xs">{t('admin.takedown.count.overdue')}</dt><dd className="text-xl font-semibold">{counts.overdue}</dd></div>
        </dl>
      )}

      {notice && <p className="text-sm" role="status">{notice}</p>}
      {load === 'loading' && <p className="text-muted-foreground text-sm">{t('admin.takedown.loading')}</p>}
      {load === 'error' && <p className="text-destructive text-sm">{t('admin.takedown.error')}</p>}
      {load === 'ok' && rows.length === 0 && <p className="text-muted-foreground text-sm">{view === 'open' ? t('admin.takedown.empty.open') : t('admin.takedown.empty.recent')}</p>}

      {load === 'ok' && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={CLOCK_VARIANT[r.clock]}>{t(CLOCK_KEY[r.clock])}</Badge>
                    <Badge variant="default">{t(STATUS_KEY[r.status])}</Badge>
                    {clockText(r) && <span className="text-sm font-medium">{clockText(r)}</span>}
                    <span className="text-muted-foreground text-xs">{t(URGENCY_KEY[r.urgency])}</span>
                  </div>
                  <p className="text-sm">{t('admin.takedown.agency')}: <b>{r.agency}</b>{r.reference_no ? <> · {t('admin.takedown.reference')}: {r.reference_no}</> : null}</p>
                  {r.legal_basis && <p className="text-sm">{t('admin.takedown.basis')}: {r.legal_basis}</p>}
                  <p className="text-sm break-all">{t('admin.takedown.target')}: {t(TARGET_KEY[r.target_type])} · <code>{r.target_id}</code></p>
                  <p className="text-muted-foreground text-xs">{t('admin.takedown.received')}: {fmt(r.received_at)} · {t('admin.takedown.due')}: {fmt(r.due_at)}{r.actioned_at ? ` · ${r.action_taken ? t(TAKEN_KEY[r.action_taken]) : ''} ${fmt(r.actioned_at)}` : ''}</p>
                  {r.notes && <p className="text-sm break-words whitespace-pre-wrap">{t('admin.takedown.notes')}: {r.notes}</p>}

                  {(r.status === 'received' || r.status === 'needs_info') && can.hide && (
                    act?.id !== r.id ? (
                      <div className="flex flex-wrap gap-2">
                        {canExecute(r) && <Button size="sm" disabled={busy || guard.disabled} title={guard.title} onClick={() => { setAct({ id: r.id, kind: 'execute' }); setNote('') }}>{t('admin.takedown.act.execute')}</Button>}
                        <Button size="sm" variant="outline" disabled={busy || guard.disabled} title={guard.title} onClick={() => { setAct({ id: r.id, kind: 'needs_info' }); setNote('') }}>{t('admin.takedown.act.needsInfo')}</Button>
                        <Button size="sm" variant="outline" disabled={busy || guard.disabled} title={guard.title} onClick={() => { setAct({ id: r.id, kind: 'reject' }); setNote('') }}>{t('admin.takedown.act.reject')}</Button>
                      </div>
                    ) : (
                      <div className="border-border space-y-2 rounded-md border p-3">
                        {act.kind === 'execute' ? (
                          <p className="text-sm font-medium">{r.target_type === 'user' ? t('admin.takedown.act.confirmBan') : t('admin.takedown.act.confirm', { what: t(TARGET_KEY[r.target_type]) })}</p>
                        ) : (
                          <>
                            <label className="block text-sm font-medium" htmlFor={`n-${r.id}`}>{t('admin.takedown.act.noteLabel')}</label>
                            <textarea id={`n-${r.id}`} rows={2} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
                          </>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={busy || guard.disabled || (act.kind !== 'execute' && note.trim().length < NOTE_MIN)} onClick={() => void submitAct(r)}>{act.kind === 'execute' ? t('admin.takedown.act.confirmYes') : t('admin.takedown.act.send')}</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAct(null); setNote('') }}>{t('admin.takedown.act.cancel')}</Button>
                        </div>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {can.hide && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('admin.takedown.new.title')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="td-source">{t('admin.takedown.new.source')}</label>
            <select id="td-source" className={field} value={form.source} onChange={(e) => { const source = e.target.value as Form['source']; setForm({ ...form, source, urgency: source === 'user_complaint' ? 'complaint_48h' : form.urgency === 'complaint_48h' ? 'standard_24h' : form.urgency }) }}>
              <option value="authority">{t('admin.takedown.new.source.authority')}</option>
              <option value="user_complaint">{t('admin.takedown.new.source.user_complaint')}</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="td-urgency">{t('admin.takedown.new.urgency')}</label>
            <select id="td-urgency" className={field} value={form.urgency} disabled={form.source === 'user_complaint'} onChange={(e) => setForm({ ...form, urgency: e.target.value as Urgency })}>
              <option value="standard_24h">{t('admin.takedown.urgency.standard_24h')}</option>
              <option value="emergency_6h">{t('admin.takedown.urgency.emergency_6h')}</option>
              <option value="complaint_48h" disabled={form.source === 'authority'}>{t('admin.takedown.urgency.complaint_48h')}</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="td-agency">{t('admin.takedown.agency')}</label>
            <input id="td-agency" className={field} maxLength={200} value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
            <label className="block text-sm font-medium" htmlFor="td-ref">{t('admin.takedown.reference')}</label>
            <input id="td-ref" className={field} maxLength={100} value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} />
            <label className="block text-sm font-medium" htmlFor="td-basis">{t('admin.takedown.basis')}</label>
            <input id="td-basis" className={field} maxLength={500} value={form.legal_basis} onChange={(e) => setForm({ ...form, legal_basis: e.target.value })} />
            <label className="block text-sm font-medium" htmlFor="td-received">{t('admin.takedown.new.receivedAt')}</label>
            <input id="td-received" type="datetime-local" className={field} value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} />
            <label className="block text-sm font-medium" htmlFor="td-type">{t('admin.takedown.new.targetType')}</label>
            <select id="td-type" className={field} value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value as TargetType })}>
              <option value="review">{t('admin.takedown.target.review')}</option>
              <option value="comment">{t('admin.takedown.target.comment')}</option>
              <option value="plan_share">{t('admin.takedown.target.plan_share')}</option>
              <option value="user">{t('admin.takedown.target.user')}</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="td-id">{t('admin.takedown.new.targetId')}</label>
            <input id="td-id" className={field} maxLength={64} value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })} />
            <p className="text-muted-foreground text-xs">{t('admin.takedown.new.targetHelp')}</p>
            <label className="block text-sm font-medium" htmlFor="td-notes">{t('admin.takedown.notes')}</label>
            <textarea id="td-notes" rows={2} className={field} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.execute} onChange={(e) => setForm({ ...form, execute: e.target.checked })} />
              {t('admin.takedown.new.executeNow')}
            </label>
            <Button size="sm" disabled={busy || !formReady || guard.disabled} title={guard.title} onClick={() => void submitNew()}>{t('admin.takedown.new.submit')}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
