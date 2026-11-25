'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { VideoReviewDetail, type VideoCapabilities, type VideoDetail } from './VideoReviewDetail'

// The human review desk for Explore videos (VID-03). The order of the list is the server's (urgent first, then oldest).
// After every decision the screen shows what the SERVER says the state is, never what the click expected.

interface Item {
  assetId: string; priority: 'urgent' | 'high' | 'normal'; severe: boolean; category: string | null; confidence: number | null
  reasonCode: string | null; hasAudio: boolean | null; durationMs: number | null; waitingSince: string
}
type Load = 'loading' | 'ok' | 'error' | 'forbidden' | 'off' | 'limited'

const VARIANT = { urgent: 'destructive', high: 'warning', normal: 'default' } as const
const loadOf = (status: number): Load => (status === 404 ? 'off' : status === 403 ? 'forbidden' : status === 429 ? 'limited' : 'error')
const hoursSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000))

export function VideoModerationDesk({ can }: { can: VideoCapabilities }) {
  const { t } = useTranslation()
  const [load, setLoad] = useState<Load>('loading')
  const [items, setItems] = useState<Item[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VideoDetail | null>(null)
  const [detailLoad, setDetailLoad] = useState<Load | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const readList = useCallback(async () => {
    setLoad('loading')
    try {
      const res = await fetch('/api/admin/video-moderation')
      if (!res.ok) return setLoad(loadOf(res.status))
      const json = await res.json()
      if (!Array.isArray(json?.data)) return setLoad('error')
      setItems(json.data)
      setLoad('ok')
    } catch { setLoad('error') }
  }, [])
  useEffect(() => { void readList() }, [readList])

  const readDetail = useCallback(async (id: string) => {
    setDetailLoad('loading')
    try {
      const res = await fetch(`/api/admin/video-moderation/${encodeURIComponent(id)}`)
      if (!res.ok) { setDetail(null); return setDetailLoad(res.status === 404 ? 'off' : loadOf(res.status)) }
      const json = await res.json()
      if (!json?.data?.asset) { setDetail(null); return setDetailLoad('error') }
      setDetail(json.data as VideoDetail)
      setDetailLoad('ok')
    } catch { setDetail(null); setDetailLoad('error') }
  }, [])

  const open = (id: string) => { setOpenId(id); setNotice(null); void readDetail(id) }
  const close = () => { setOpenId(null); setDetail(null); setDetailLoad(null); setNotice(null) }

  async function decide(decision: 'approve' | 'reject', note: string) {
    if (!openId) return
    setBusy(true); setNotice(null)
    try {
      const res = await fetch(`/api/admin/video-moderation/${encodeURIComponent(openId)}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }),
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        const state = String(json?.data?.state ?? '—')
        const changed = json?.data?.changed !== false
        setNotice(!changed ? t('admin.video.result.standing', { state }) : decision === 'approve' ? t('admin.video.result.approved', { state }) : t('admin.video.result.rejected', { state }))
        await Promise.all([readList(), readDetail(openId)])
        return
      }
      if (res.status === 409) { setNotice(t('admin.video.result.conflict')); await Promise.all([readList(), readDetail(openId)]) }
      else if (res.status === 403) setNotice(t('admin.video.forbidden'))
      else if (res.status === 404) setNotice(t('admin.video.notFound'))
      else if (res.status === 429) setNotice(t('admin.video.rateLimited'))
      else setNotice(t('admin.video.result.error'))
    } catch { setNotice(t('admin.video.result.error')) } finally { setBusy(false) }
  }

  const problem = (l: Load) => (l === 'off' ? t('admin.video.notEnabled') : l === 'forbidden' ? t('admin.video.forbidden') : l === 'limited' ? t('admin.video.rateLimited') : t('admin.video.error'))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.video.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.video.subtitle')}</p>
      </div>

      {openId ? (
        <div className="space-y-3">
          <Button size="sm" variant="outline" onClick={close}>{t('admin.video.back')}</Button>
          {detailLoad === 'loading' && !detail && <p className="text-muted-foreground text-sm">{t('admin.video.loading')}</p>}
          {detailLoad && detailLoad !== 'loading' && detailLoad !== 'ok' && (
            <p className="text-destructive text-sm" role="alert">{detailLoad === 'off' ? t('admin.video.notFound') : problem(detailLoad)}</p>
          )}
          {detail && <VideoReviewDetail key={detail.asset.id} detail={detail} can={can} busy={busy} notice={notice} onDecide={(d, n) => void decide(d, n)} />}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h2 className="font-medium">{t('admin.video.queue.heading')}</h2>
            <Button size="sm" variant="ghost" onClick={() => void readList()}>{t('admin.video.refresh')}</Button>
          </div>
          {load === 'loading' && <p className="text-muted-foreground text-sm">{t('admin.video.loading')}</p>}
          {load !== 'loading' && load !== 'ok' && <p className="text-destructive text-sm" role="alert">{problem(load)}</p>}
          {load === 'ok' && items.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.video.empty')}</p>}
          {load === 'ok' && items.length > 0 && (
            <ul className="space-y-3" aria-label={t('admin.video.queue.heading')}>
              {items.map((it) => (
                <li key={it.assetId}>
                  <Card>
                    <CardContent className="space-y-2 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={VARIANT[it.priority] ?? 'default'}>{t(`admin.video.priority.${it.priority}`)}</Badge>
                        {it.severe && <Badge variant="destructive">{t('admin.video.severe')}</Badge>}
                        <span className="text-muted-foreground text-xs">{t('admin.video.waiting', { h: String(hoursSince(it.waitingSince)) })} · {new Date(it.waitingSince).toLocaleString()}</span>
                      </div>
                      {it.severe && <p className="text-sm">{t('admin.video.severeNote')}</p>}
                      <p className="text-sm">
                        {t('admin.video.category')}: <b>{it.category ?? t('admin.video.noCategory')}</b>
                        {it.confidence !== null ? <> · {t('admin.video.confidence')}: {it.confidence.toFixed(2)}</> : null}
                        {it.durationMs !== null ? <> · {t('admin.video.duration', { s: String(Math.round(it.durationMs / 1000)) })}</> : null}
                        {it.hasAudio !== null ? <> · {it.hasAudio ? t('admin.video.audio.yes') : t('admin.video.audio.no')}</> : null}
                      </p>
                      <Button size="sm" onClick={() => open(it.assetId)}>{t('admin.video.open')}</Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
