'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'
import { LADDER, RULE_GROUPS, RULE_GROUP_IDS, suggestPenalty, withinGroupMax, type Outcome, type RuleGroupId, type Severity } from '@/lib/safety/communityRules'

// The moderation desk (owner 01/10) — a reviewer's screen, usable on a phone (single column, wrapping controls).
//
// WHAT IT NEVER DOES: apply a penalty by itself. The ladder's suggestion is a line of text; the button that saves is the reviewer's,
// with a written reason. WHAT IT NEVER SHOWS: who the reporter is. Authorization lives in the API (every action re-checks its own
// permission); the `can` flags only decide which buttons are drawn. The order of the queue is the server's (urgent first, then oldest).

interface Strike { id: string; rule_group: RuleGroupId; feature: string; severity: number; expires: string | null }
interface Item {
  id: string; type: string; status: string; priority: number; reason: string | null; note: string | null; target_type: string; target_id: string
  created_at: string; age_hours: number; overdue: boolean; reports_on_target: number
  target: { exists: boolean; subject_id: string | null; feature: string; summary: string; body: string | null; review_id: string | null }
  strikes: Strike[]; reporter_trust: { total: number; dismissed: number; lowTrust: boolean } | null
}
interface Appeal {
  id: string; decision_id: string; source: 'app' | 'email'; message: string; created_at: string; same_reviewer: boolean
  decision: { rule_group: RuleGroupId; outcome: string; reason: string; created_at: string; feature: string; severity: number; restrict_days: number | null } | null
}
type Stats = Record<string, number | null | Record<string, number>>

export interface DeskCapabilities { dismiss: boolean; hide: boolean; delete: boolean; suspend: boolean; ban: boolean }
type Tab = 'queue' | 'appeals' | 'stats'
type Load = 'loading' | 'ok' | 'error'

const REASON_MIN = 10
const PRIORITY_VARIANT: Record<number, 'default' | 'warning' | 'destructive'> = { 0: 'default', 1: 'default', 2: 'warning', 3: 'destructive' }
const fmt = (iso: string) => new Date(iso).toLocaleString()

type Wire = 'no_violation' | 'hold' | 'warning' | 'remove_post' | 'remove_comment' | 'restrict' | 'ban'
const rankOf = (w: Wire): Outcome => (w === 'remove_post' || w === 'remove_comment' ? 'remove' : w)
interface Form { outcome: Wire | null; group: RuleGroupId | ''; severity: Severity | null; days: number; reason: string }
const EMPTY: Form = { outcome: null, group: '', severity: null, days: LADDER.restrictDaysDefault, reason: '' }

export function ModerationDesk({ can }: { can: DeskCapabilities }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [tab, setTab] = useState<Tab>('queue')
  const [load, setLoad] = useState<Load>('loading')
  const [items, setItems] = useState<Item[]>([])
  const [appeals, setAppeals] = useState<Appeal[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [appealNote, setAppealNote] = useState<Record<string, string>>({})
  const [emailDecision, setEmailDecision] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const read = useCallback(async (view: Tab) => {
    setLoad('loading')
    try {
      const res = await fetch(`/api/admin/moderation/desk?view=${view}`)
      if (!res.ok) return setLoad('error')
      const json = await res.json()
      if (json?.data === undefined) return setLoad('error')
      if (view === 'queue') setItems(Array.isArray(json.data) ? json.data : [])
      else if (view === 'appeals') setAppeals(Array.isArray(json.data) ? json.data : [])
      else setStats(json.data)
      setLoad('ok')
    } catch { setLoad('error') }
  }, [])
  useEffect(() => { void read(tab) }, [tab, read])

  const post = async (url: string, body: unknown, okMsg: string) => {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { setNotice(t('admin.desk.actionError')); return false }
      setNotice(okMsg)
      return true
    } catch { setNotice(t('admin.desk.actionError')); return false } finally { setBusy(false) }
  }

  const open = (it: Item) => { setOpenId(it.id); setForm(EMPTY) }
  const outcomes = useMemo(() => (it: Item): Wire[] => {
    const o: Wire[] = []
    if (can.dismiss) o.push('no_violation')
    if (can.hide && it.target_type === 'review') o.push('hold')
    if (can.hide && it.target.exists) o.push('warning')
    if (it.target.exists && it.target_type === 'review' && can.hide) o.push('remove_post')
    if (it.target.exists && it.target_type === 'comment' && can.delete) o.push('remove_comment')
    if (can.suspend && it.target.exists) o.push('restrict')
    if (can.ban && it.target.exists) o.push('ban')
    return o
  }, [can])

  function evaluate(it: Item) {
    const needsGroup = form.outcome !== null && form.outcome !== 'no_violation' && form.outcome !== 'hold'
    const group = form.group || null
    const severity = (form.severity ?? (group ? RULE_GROUPS[group].defaultSeverity : 1)) as Severity
    const same = it.strikes.filter((s) => group && s.rule_group === group && s.feature === it.target.feature).length
    const suggestion = group ? suggestPenalty({ group, severity, strikesSameGroupFeature: same, strikesTotal: it.strikes.length }) : null
    const beyondMax = needsGroup && group && form.outcome && form.outcome !== 'hold' && form.outcome !== 'no_violation' ? !withinGroupMax(group, rankOf(form.outcome) as Exclude<Outcome, 'hold' | 'no_violation'>) : false
    const banBlocked = form.outcome === 'ban' && severity < 3 && it.strikes.length + 1 < LADDER.banAtStrikes
    const ready = !!form.outcome && form.reason.trim().length >= REASON_MIN && (!needsGroup || !!group) && !beyondMax && !banBlocked
    return { needsGroup, group, severity, suggestion, beyondMax, banBlocked, ready }
  }

  async function submit(it: Item) {
    const ev = evaluate(it)
    if (!form.outcome || !ev.ready) return
    const body: Record<string, unknown> = { outcome: form.outcome, reason: form.reason.trim() }
    if (ev.needsGroup) { body.rule_group = ev.group; body.severity = ev.severity }
    if (form.outcome === 'restrict') body.restrict_days = form.days
    if (await post(`/api/admin/moderation/${encodeURIComponent(it.id)}/decide`, body, t('admin.desk.done'))) { setOpenId(null); setForm(EMPTY); await read('queue') }
  }

  async function resolveAppeal(a: Appeal, result: 'upheld' | 'reversed') {
    const note = (appealNote[a.id] ?? '').trim()
    if (note.length < REASON_MIN) return
    if (await post(`/api/admin/moderation/appeals/${encodeURIComponent(a.id)}/resolve`, { result, note }, t('admin.desk.appeal.done'))) await read('appeals')
  }

  async function addEmailAppeal() {
    if (!emailDecision.trim() || emailMessage.trim().length < REASON_MIN) return
    if (await post('/api/admin/moderation/appeals', { decision_id: emailDecision.trim(), message: emailMessage.trim() }, t('admin.desk.appeal.done'))) { setEmailDecision(''); setEmailMessage(''); await read('appeals') }
  }

  const tabs: Tab[] = ['queue', 'appeals', 'stats']
  const field = 'border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
  const num = (v: unknown) => (typeof v === 'number' ? String(v) : t('admin.desk.stats.none'))
  const dec = (k: string) => (stats?.decisions_30d && typeof stats.decisions_30d === 'object' ? (stats.decisions_30d as Record<string, number>)[k] : undefined)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.desk.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.desk.subtitle')}</p>
        <a className="text-sm underline" href="/community-guidelines" target="_blank" rel="noreferrer">{t('admin.desk.guidelines')}</a>
      </div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((k) => (
          <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => { setTab(k); setNotice(null) }}>{t(`admin.desk.tab.${k}`)}</Button>
        ))}
      </div>
      {notice && <p className="text-sm" role="status">{notice}</p>}
      {load === 'loading' && <p className="text-muted-foreground text-sm">{t('admin.desk.loading')}</p>}
      {load === 'error' && <p className="text-destructive text-sm">{t('admin.desk.error')}</p>}

      {load === 'ok' && tab === 'queue' && (
        items.length === 0 ? <p className="text-muted-foreground text-sm">{t('admin.desk.queue.empty')}</p> : (
          <ul className="space-y-3">
            {items.map((it) => {
              const ev = openId === it.id ? evaluate(it) : null
              return (
                <li key={it.id}>
                  <Card>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={PRIORITY_VARIANT[it.priority] ?? 'default'}>{t(`admin.desk.priority.${it.priority}`)}</Badge>
                        {it.overdue && <Badge variant="destructive">{t('admin.desk.overdue')}</Badge>}
                        <span className="text-sm font-medium">{it.type}</span>
                        <span className="text-muted-foreground text-xs">{t('admin.desk.age', { h: String(it.age_hours) })} · {fmt(it.created_at)}</span>
                      </div>
                      <p className="text-sm">{t('admin.desk.reason')}: <b>{it.reason ?? '—'}</b>{it.note ? <> · {t('admin.desk.note')}: {it.note}</> : null}</p>
                      <p className="text-muted-foreground text-xs">{t('admin.desk.sameTarget', { n: String(it.reports_on_target) })}</p>
                      <div className="border-border rounded-md border p-2 text-sm">
                        <div className="text-muted-foreground mb-1 text-xs">{t('admin.desk.target')} · {it.target_type}</div>
                        {!it.target.exists ? <p>{t('admin.desk.targetGone')}</p> : <p className="break-words whitespace-pre-wrap">{it.target.body ?? it.target.summary}</p>}
                      </div>
                      <p className="text-sm">{it.strikes.length ? t('admin.desk.strikes', { n: String(it.strikes.length) }) : t('admin.desk.noStrikes')}</p>
                      {it.reporter_trust && (
                        <p className="text-muted-foreground text-xs">
                          {t('admin.desk.reporter', { total: String(it.reporter_trust.total), dismissed: String(it.reporter_trust.dismissed) })}
                          {it.reporter_trust.lowTrust ? ` — ${t('admin.desk.reporterLow')}` : ''}
                        </p>
                      )}
                      {openId !== it.id ? (
                        <Button size="sm" onClick={() => open(it)}>{t('admin.desk.decide')}</Button>
                      ) : (
                        <div className="border-border space-y-3 rounded-md border p-3">
                          <div className="flex flex-wrap gap-2">
                            {outcomes(it).map((o) => (
                              <Button key={o} size="sm" variant={form.outcome === o ? 'default' : 'outline'} aria-pressed={form.outcome === o} onClick={() => setForm({ ...form, outcome: o })}>{t(`admin.desk.outcome.${o}`)}</Button>
                            ))}
                          </div>
                          {ev?.needsGroup && (
                            <>
                              <label className="block text-sm font-medium" htmlFor={`g-${it.id}`}>{t('admin.desk.group')}</label>
                              <select id={`g-${it.id}`} className={field} value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as RuleGroupId | '', severity: null })}>
                                <option value="">{t('admin.desk.group.pick')}</option>
                                {RULE_GROUP_IDS.map((g) => <option key={g} value={g}>{t(`legal.community.r.${g}.heading`)}</option>)}
                              </select>
                              <label className="block text-sm font-medium" htmlFor={`s-${it.id}`}>{t('admin.desk.severity')}</label>
                              <select id={`s-${it.id}`} className={field} value={ev.severity} onChange={(e) => setForm({ ...form, severity: Number(e.target.value) as Severity })}>
                                {[1, 2, 3].filter((s) => !ev.group || s <= RULE_GROUPS[ev.group].maxSeverity).map((s) => <option key={s} value={s}>{t(`admin.desk.severity.${s}`)}</option>)}
                              </select>
                            </>
                          )}
                          {form.outcome === 'restrict' && (
                            <>
                              <label className="block text-sm font-medium" htmlFor={`d-${it.id}`}>{t('admin.desk.days')}</label>
                              <input id={`d-${it.id}`} type="number" min={1} max={LADDER.restrictDaysMax} className={field} value={form.days} onChange={(e) => setForm({ ...form, days: Math.max(1, Math.min(LADDER.restrictDaysMax, Number(e.target.value) || 1)) })} />
                            </>
                          )}
                          {ev?.suggestion && <p className="text-muted-foreground text-xs">{t('admin.desk.suggest', { outcome: t(`admin.desk.outcome.${ev.suggestion.outcome}`) })}</p>}
                          {ev?.beyondMax && <p className="text-destructive text-xs">{t('admin.desk.beyondMax')}</p>}
                          {ev?.banBlocked && <p className="text-destructive text-xs">{t('admin.desk.banNeeds')}</p>}
                          <label className="block text-sm font-medium" htmlFor={`r-${it.id}`}>{t('admin.desk.reasonLabel')}</label>
                          <textarea id={`r-${it.id}`} rows={3} className={field} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={busy || !ev?.ready || guard.disabled} title={guard.title} onClick={() => void submit(it)}>{t('admin.desk.submit')}</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setOpenId(null); setForm(EMPTY) }}>{t('admin.desk.cancel')}</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )
      )}

      {load === 'ok' && tab === 'appeals' && (
        <div className="space-y-3">
          {appeals.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.desk.appeals.empty')}</p>}
          {appeals.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{t(`admin.desk.appeal.source.${a.source}`)}</Badge>
                  <span className="text-muted-foreground text-xs">{fmt(a.created_at)}</span>
                </div>
                {a.decision && (
                  <p className="text-sm"><b>{t('admin.desk.appeal.decision')}:</b> {t(`legal.community.r.${a.decision.rule_group}.heading`)} · {a.decision.outcome} · {a.decision.reason}</p>
                )}
                <p className="text-sm break-words whitespace-pre-wrap"><b>{t('admin.desk.appeal.message')}:</b> {a.message}</p>
                {a.same_reviewer && <p className="text-destructive text-xs">{t('admin.desk.appeal.sameReviewer')}</p>}
                <label className="block text-sm font-medium" htmlFor={`an-${a.id}`}>{t('admin.desk.appeal.note')}</label>
                <textarea id={`an-${a.id}`} rows={2} className={field} value={appealNote[a.id] ?? ''} onChange={(e) => setAppealNote({ ...appealNote, [a.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy || !can.delete || guard.disabled} onClick={() => void resolveAppeal(a, 'upheld')}>{t('admin.desk.appeal.upheld')}</Button>
                  <Button size="sm" disabled={busy || !can.delete || guard.disabled} onClick={() => void resolveAppeal(a, 'reversed')}>{t('admin.desk.appeal.reversed')}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {can.hide && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('admin.desk.appeal.addEmail')}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <input aria-label={t('admin.desk.appeal.decisionId')} placeholder={t('admin.desk.appeal.decisionId')} className={field} value={emailDecision} onChange={(e) => setEmailDecision(e.target.value)} />
                <textarea aria-label={t('admin.desk.appeal.message')} rows={3} className={field} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} />
                <Button size="sm" disabled={busy || guard.disabled} onClick={() => void addEmailAppeal()}>{t('admin.desk.appeal.add')}</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {load === 'ok' && tab === 'stats' && stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([
            ['admin.desk.stats.open', num(stats.open)], ['admin.desk.stats.urgent', num(stats.open_urgent)], ['admin.desk.stats.overdue24', num(stats.overdue_24h)],
            ['admin.desk.stats.overdueTarget', num(stats.overdue_target)], ['admin.desk.stats.avg', num(stats.avg_handling_hours_30d)],
            ['admin.desk.stats.resolved', num(stats.resolved_30d)], ['admin.desk.stats.dismissed', num(stats.dismissed_30d)],
            ['admin.desk.stats.appealsPending', num(stats.appeals_pending)], ['admin.desk.stats.appealsReversed', num(stats.appeals_reversed)], ['admin.desk.stats.appealsUpheld', num(stats.appeals_upheld)],
            ['admin.desk.stats.warning', num(dec('warning'))], ['admin.desk.stats.removed', num(dec('content_removed'))], ['admin.desk.stats.restricted', num(dec('restricted'))], ['admin.desk.stats.banned', num(dec('banned'))],
          ] as const).map(([k, v]) => (
            <div key={k} className="border-border rounded-md border p-3">
              <dt className="text-muted-foreground text-xs">{t(k)}</dt>
              <dd className="text-xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
