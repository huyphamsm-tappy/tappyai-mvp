'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// The evidence and the decision for ONE video waiting for review (Explore video VID-03).
// Frames come from the frame route (private bucket, never a bucket URL). Permissions only decide which buttons work; the decide route enforces them again.

export interface ResultRow {
  id: number; kind: 'automated' | 'human'; decision: string; category: string | null; confidence: number | null; reasonCode: string
  provider: string | null; model: string | null; policyVersion: string | null; evidence: Record<string, unknown>; transcript: string | null
  actor: string; note: string | null; createdAt: string
}
export interface EventRow { id: number; fromState: string | null; toState: string; eventType: string; actor: string; reason: string | null; createdAt: string }
export interface VideoDetail {
  asset: { id: string; state: string; hasAudio: boolean | null; durationMs: number | null; updatedAt: string }
  severe: boolean
  results: ResultRow[]
  events: EventRow[]
  frameUrl: string
}
export interface VideoCapabilities { approve: boolean; approveSevere: boolean; reject: boolean }

export const NOTE_MIN = 5
const fmt = (iso: string) => new Date(iso).toLocaleString()
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The overlay texts the user put on the video, as the automated step recorded them in the evidence. */
export function overlayTexts(results: ResultRow[]): string[] {
  const out: string[] = []
  for (const r of results) {
    const o = r.evidence.overlay
    if (isObj(o) && Array.isArray(o.texts)) for (const x of o.texts) if (typeof x === 'string' && x.trim()) out.push(x)
  }
  return out
}

export function VideoReviewDetail({ detail, can, busy, notice, onDecide }: {
  detail: VideoDetail
  can: VideoCapabilities
  busy: boolean
  notice: string | null
  onDecide: (decision: 'approve' | 'reject', note: string) => void
}) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [frameBroken, setFrameBroken] = useState(false)

  const open = detail.asset.state === 'review_required'
  const noteOk = note.trim().length >= NOTE_MIN
  const approveAllowed = detail.severe ? can.approve && can.approveSevere : can.approve
  const transcripts = detail.results.filter((r) => r.transcript)
  const overlays = overlayTexts(detail.results)
  const humans = detail.results.filter((r) => r.kind === 'human')
  const base = !open || busy || !noteOk || guard.disabled

  const reasonApprove = !open ? null : !can.approve ? t('admin.video.decide.noApprove') : detail.severe && !can.approveSevere ? t('admin.video.decide.noApproveSevere') : null
  const reasonReject = !open ? null : !can.reject ? t('admin.video.decide.noReject') : null

  const clickApprove = () => { if (detail.severe) setConfirming(true); else onDecide('approve', note.trim()) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{t('admin.video.detail.title')}</h2>
        {detail.severe && <Badge variant="destructive">{t('admin.video.severe')}</Badge>}
        <span className="text-sm">{t('admin.video.detail.state')}: <b data-testid="video-state">{detail.asset.state}</b></span>
      </div>
      {detail.severe && <p className="text-destructive text-sm" role="alert">{t('admin.video.severeNote')}</p>}

      <section aria-labelledby="vm-frames" className="space-y-2">
        <h3 id="vm-frames" className="font-medium">{t('admin.video.frames.heading')}</h3>
        {/* A hidden probe of the same private URL: the six cells are backgrounds, which cannot report a failed load. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={detail.frameUrl} alt="" aria-hidden="true" className="hidden" onError={() => setFrameBroken(true)} />
        {frameBroken ? <p className="text-destructive text-sm" role="alert">{t('admin.video.frames.unavailable')}</p> : (
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                role="img"
                aria-label={t('admin.video.frames.alt', { n: String(i + 1) })}
                data-testid="video-frame"
                className="bg-muted aspect-[9/16] w-full rounded"
                style={{ backgroundImage: `url(${detail.frameUrl})`, backgroundSize: '300% 200%', backgroundPosition: `${(i % 3) * 50}% ${Math.floor(i / 3) * 100}%` }}
              />
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">{t('admin.video.frames.private')}</p>
      </section>

      <section aria-labelledby="vm-ai" className="space-y-2">
        <h3 id="vm-ai" className="font-medium">{t('admin.video.ai.heading')}</h3>
        {detail.results.filter((r) => r.kind === 'automated').length === 0 && <p className="text-muted-foreground text-sm">{t('admin.video.ai.none')}</p>}
        {detail.results.filter((r) => r.kind === 'automated').map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-1 pt-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(`admin.video.ai.decision.${r.decision}`)}</Badge>
                <span>{t('admin.video.category')}: <b>{r.category ?? t('admin.video.noCategory')}</b></span>
                <span>{t('admin.video.confidence')}: <b>{r.confidence === null ? '—' : r.confidence.toFixed(2)}</b></span>
              </div>
              <p>{t('admin.video.ai.reason')}: {r.reasonCode}</p>
              <p className="text-muted-foreground text-xs">
                {t('admin.video.ai.model')}: {r.model ?? '—'} ({r.provider ?? '—'}) · {t('admin.video.ai.policy')}: {r.policyVersion ?? '—'} · {t('admin.video.ai.at')}: {fmt(r.createdAt)}
              </p>
              {Object.entries(r.evidence).map(([kind, ev]) => {
                const e = isObj(ev) ? ev : {}
                const scores = isObj(e.scores) ? Object.entries(e.scores).filter(([, v]) => typeof v === 'number') as [string, number][] : []
                const flagged = Array.isArray(e.flagged) ? e.flagged.filter((x): x is string => typeof x === 'string') : []
                return (
                  <div key={kind} className="border-border rounded border p-2">
                    <div className="font-medium">{['visual', 'speech', 'overlay'].includes(kind) ? t(`admin.video.evidence.${kind}`) : kind}</div>
                    <div className="text-xs">{t('admin.video.ai.status')}: {String(e.status ?? '—')}{typeof e.reason === 'string' ? ` · ${e.reason}` : ''}</div>
                    {scores.length > 0 && (
                      <ul className="text-xs" aria-label={t('admin.video.ai.scores')}>
                        {[...scores].sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k}>{k}: {v.toFixed(2)}</li>)}
                      </ul>
                    )}
                    {flagged.length > 0 && <div className="text-xs">{t('admin.video.ai.flagged')}: {flagged.join(', ')}</div>}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="vm-tr" className="space-y-1">
        <h3 id="vm-tr" className="font-medium">{t('admin.video.transcript.heading')}</h3>
        {transcripts.length === 0 ? <p className="text-muted-foreground text-sm">{t('admin.video.transcript.none')}</p>
          : transcripts.map((r) => <p key={r.id} className="border-border rounded border p-2 text-sm break-words whitespace-pre-wrap">{r.transcript}</p>)}
      </section>

      <section aria-labelledby="vm-ov" className="space-y-1">
        <h3 id="vm-ov" className="font-medium">{t('admin.video.overlay.heading')}</h3>
        {overlays.length === 0 ? <p className="text-muted-foreground text-sm">{t('admin.video.overlay.none')}</p>
          : <ul className="space-y-1">{overlays.map((x, i) => <li key={i} className="border-border rounded border p-2 text-sm break-words whitespace-pre-wrap">{x}</li>)}</ul>}
      </section>

      <section aria-labelledby="vm-hist" className="space-y-1">
        <h3 id="vm-hist" className="font-medium">{t('admin.video.history.heading')}</h3>
        {humans.length === 0 && detail.events.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.video.history.none')}</p>}
        {humans.length > 0 && (
          <ul aria-label={t('admin.video.history.decisions')} className="space-y-1 text-sm">
            {humans.map((r) => <li key={r.id}>{fmt(r.createdAt)} · <b>{t(`admin.video.ai.decision.${r.decision}`)}</b> {t('admin.video.history.by')} {r.actor}{r.note ? ` — ${r.note}` : ''}</li>)}
          </ul>
        )}
        {detail.events.length > 0 && (
          <ul aria-label={t('admin.video.history.events')} className="text-muted-foreground space-y-1 text-xs">
            {detail.events.map((e) => <li key={e.id}>{fmt(e.createdAt)} · {e.eventType}: {e.fromState ?? '—'} → {e.toState} ({e.actor})</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="vm-dec" className="border-border space-y-3 rounded-md border p-3">
        <h3 id="vm-dec" className="font-medium">{t('admin.video.decide.heading')}</h3>
        {!open && <p className="text-sm" role="status">{t('admin.video.decide.closed')}</p>}
        <label className="block text-sm font-medium" htmlFor="vm-note">{t('admin.video.decide.noteLabel', { n: String(NOTE_MIN) })}</label>
        <textarea id="vm-note" rows={3} maxLength={1000} className="border-border bg-background w-full rounded-md border px-2 py-2 text-sm" value={note} disabled={!open} onChange={(e) => setNote(e.target.value)} />
        {reasonApprove && <p id="vm-why-approve" className="text-sm">{reasonApprove}</p>}
        {reasonReject && <p id="vm-why-reject" className="text-sm">{reasonReject}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={base || !approveAllowed} aria-describedby={reasonApprove ? 'vm-why-approve' : undefined} title={guard.title} onClick={clickApprove}>{t('admin.video.decide.approve')}</Button>
          <Button size="sm" variant="outline" disabled={base || !can.reject} aria-describedby={reasonReject ? 'vm-why-reject' : undefined} title={guard.title} onClick={() => onDecide('reject', note.trim())}>{t('admin.video.decide.reject')}</Button>
        </div>
        {confirming && (
          <div role="alertdialog" aria-labelledby="vm-conf-t" aria-describedby="vm-conf-b" className="border-destructive space-y-2 rounded-md border p-3">
            <p id="vm-conf-t" className="font-medium">{t('admin.video.confirm.title')}</p>
            <p id="vm-conf-b" className="text-sm">{t('admin.video.confirm.body')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setConfirming(false); onDecide('approve', note.trim()) }}>{t('admin.video.confirm.yes')}</Button>
              <Button size="sm" variant="ghost" autoFocus onClick={() => setConfirming(false)}>{t('admin.video.confirm.cancel')}</Button>
            </div>
          </div>
        )}
        {notice && <p className="text-sm" role="status">{notice}</p>}
      </section>
    </div>
  )
}
