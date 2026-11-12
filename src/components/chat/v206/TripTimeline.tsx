'use client'
// Workspace v206 (NEXT_PUBLIC_WORKSPACE_V206): the itinerary as the RFC-001 mockup draws it - a header, day tabs, a vertical timeline with time chips and each stop's own photo,
// the tips that name a stop beside it, the plan's own budget rows and the share action. Built ONLY from the plan the answer carries (TripPlanCard's data) and the turn's own place
// cards: nothing is added (no destination, dates, pace, verification, partner or discount that the plan does not state). The former TripPlanCard stays the layout when the flag is off.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ExternalLink, Lightbulb, MapPin, Share2, UserRound } from 'lucide-react'
import '../v206.css'
import type { TappyPlan } from '@/components/TripPlanCard'
import ShareMenu from '@/components/share/ShareMenu'
import { buildPlanArtifact } from '@/lib/share/shareArtifact'
import { withPlacePhotos, type PlacePhotoSource } from '@/lib/plans/share/planPhotos'
import { plainTextDeep } from '@/lib/chat/markdownNormalize'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  budgetRows, buildEntityProfile, matchPlace, planTips, splitDayLabel, timeChip, tipsByStop, tripFacts,
  type PlaceFields, type V206Plan,
} from '@/lib/chat/v206'
import { v206Store } from '@/lib/chat/v206Store'
import { useEntityLabels } from './V206Drawers'

type Tab = 'all' | 'budget' | number

export interface TripTimelineProps {
  msgId: string
  plan: TappyPlan
  /** the same turn's place cards: their real fields feed the entity drawer, their photos the shared plan */
  places?: readonly (PlaceFields & PlacePhotoSource)[] | null
}

/** Publishes a message's tips to the store while it is on screen (the header's tips button and the drawer read them). */
export function TipsPublisher({ msgId, tips }: { msgId: string; tips: Parameters<typeof v206Store.publishTips>[1] }) {
  const key = tips.map(t => `${t.id}\u0001${t.title ?? ''}\u0001${t.text}`).join('\u0002')
  const latest = useRef(tips)
  latest.current = tips
  useEffect(() => { v206Store.publishTips(msgId, latest.current) }, [msgId, key])
  useEffect(() => () => v206Store.clearTips(msgId), [msgId])
  return null
}

export function TipsButton({ n }: { n: number }) {
  const { t } = useTranslation()
  if (n <= 0) return null
  return (
    <button type="button" className="v206-link" onClick={() => v206Store.openTips()} data-testid="v206-open-tips">
      <Lightbulb size={14} aria-hidden="true" />{t('v206.tips.openN', { n: String(n) })}
    </button>
  )
}

export default function TripTimeline({ msgId, plan: rawPlan, places }: TripTimelineProps) {
  const { t, locale } = useTranslation()
  const labels = useEntityLabels()
  const plan = useMemo(() => plainTextDeep(rawPlan) as unknown as V206Plan & TappyPlan, [rawPlan])
  const [tab, setTab] = useState<Tab>('all')
  const [shareOpen, setShareOpen] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const facts = tripFacts(plan)
  const rows = budgetRows(plan)
  const tips = useMemo(() => planTips(plan), [plan])
  const beside = useMemo(() => tipsByStop(plan, tips), [plan, tips])
  const artifact = buildPlanArtifact(withPlacePhotos(plan as TappyPlan, places), locale === 'en' ? 'en' : 'vi')

  const tabs: Array<{ id: Tab; label: string }> = [
    ...(plan.days.length > 1 ? [{ id: 'all' as Tab, label: t('v206.trip.allDays', { n: String(plan.days.length) }) }] : []),
    ...plan.days.map((d, i) => ({ id: i as Tab, label: splitDayLabel(d.label).tab || d.label })),
    ...(rows.length ? [{ id: 'budget' as Tab, label: t('v206.trip.budget') }] : []),
  ]
  const current: Tab = tabs.some(x => x.id === tab) ? tab : tabs[0]?.id ?? 'all'
  const panelId = `${msgId}-v206-panel`.replace(/[^A-Za-z0-9_-]/g, '_')
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const to = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    const i = (to + tabs.length) % tabs.length
    setTab(tabs[i].id)
    tabRefs.current[i]?.focus()
  }

  const dayIdx = typeof current === 'number' ? [current] : current === 'all' ? plan.days.map((_, i) => i) : []
  // stops are numbered through the whole trip, so a single day keeps the numbers it has in the "all days" view
  let n = dayIdx.length ? plan.days.slice(0, dayIdx[0]).reduce((s, d) => s + d.items.length, 0) : 0

  return (
    <section className="v206 v206-trip" aria-label={t('v206.trip.label')} data-testid="v206-trip">
      <TipsPublisher msgId={msgId} tips={tips} />
      <header className="v206-trip-head">
        <p className="v206-trip-eyebrow">{t('v206.trip.label')}</p>
        <h3 className="v206-trip-title">{plan.title}</h3>
        <div className="v206-chips">
          {facts.days > 0 && <span className="v206-chip">{t('v206.trip.days', { n: String(facts.days) })}</span>}
          {facts.stops > 0 && <span className="v206-chip">{t('v206.trip.stops', { n: String(facts.stops) })}</span>}
          {facts.people && <span className="v206-chip"><UserRound size={12} aria-hidden="true" />{t('v206.trip.people', { n: String(facts.people) })}</span>}
          {facts.budget && <span className="v206-chip" data-strong="true">{facts.budget}</span>}
        </div>
      </header>

      {tabs.length > 1 && (
        <div role="tablist" aria-label={t('v206.trip.tabs')} className="v206-tabs">
          {tabs.map((x, i) => (
            <button key={String(x.id)} ref={el => { tabRefs.current[i] = el }} type="button" role="tab" id={`${panelId}-t${i}`} aria-selected={x.id === current} aria-controls={panelId}
              tabIndex={x.id === current ? 0 : -1} className="v206-tab" onClick={() => setTab(x.id)} onKeyDown={e => onTabKey(e, i)}>{x.label}</button>
          ))}
        </div>
      )}

      <div role={tabs.length > 1 ? 'tabpanel' : undefined} id={panelId} aria-labelledby={tabs.length > 1 ? `${panelId}-t${Math.max(0, tabs.findIndex(x => x.id === current))}` : undefined} data-testid="v206-panel">
        {current !== 'budget' && dayIdx.map(di => {
          const day = plan.days[di]
          const { theme } = splitDayLabel(day.label)
          return (
            <div key={di}>
              {(dayIdx.length > 1 || theme) && <h4 className="v206-day-title">{day.label}</h4>}
              <ol className="v206-tl" aria-label={day.label}>
                {day.items.map((it, ii) => {
                  n += 1
                  const place = matchPlace(places ?? null, it.name, it.place_id)
                  const profile = buildEntityProfile(place, it, labels)
                  // a profile only where a place card of the turn adds fields the stop itself does not show (rating, hours, phone...): a stop alone would just repeat itself
                  const canProfile = !!profile && !!place
                  const chip = timeChip(it.time)
                  const stopTips = beside.get(`${di}:${ii}`) ?? []
                  const photo = it.photo_url && isSafeHttpsUrl(it.photo_url) ? it.photo_url : null
                  const maps = it.maps_link && isSafeHttpsUrl(it.maps_link) ? it.maps_link : null
                  const book = it.booking_link && isSafeHttpsUrl(it.booking_link) ? it.booking_link : null
                  const addr = it.address && it.address !== 'Xem bản đồ' ? it.address : null
                  return (
                    <li key={ii} className="v206-stop" data-testid="v206-stop">
                      <span className="v206-node" aria-hidden="true">{n}</span>
                      <div className="v206-stop-head">
                        {chip && <span className="v206-time">{chip}</span>}
                        <h5 className="v206-stop-name">{it.emoji ? `${it.emoji} ` : ''}{it.name}</h5>
                        {it.price && <span className="v206-price">{it.price}</span>}
                      </div>
                      {it.description && <p className="v206-desc">{it.description}</p>}
                      {photo && (
                        <span className="v206-photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo} alt={it.name} loading="lazy" referrerPolicy="no-referrer" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
                        </span>
                      )}
                      {addr && <p className="v206-addr"><MapPin size={12} aria-hidden="true" className="mr-1 inline" />{addr}</p>}
                      {(maps || book || canProfile) && (
                        <div className="v206-links">
                          {book && <a href={book} target="_blank" rel="noopener noreferrer" className="v206-link" data-primary="true"><ExternalLink size={13} aria-hidden="true" />{t('v206.trip.book')}</a>}
                          {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="v206-link"><MapPin size={13} aria-hidden="true" />{t('v206.trip.map')}</a>}
                          {canProfile && (
                            <button type="button" className="v206-link" onClick={() => v206Store.openEntity(profile!)} aria-label={t('v206.entity.openNamed', { name: it.name })} data-testid="v206-open-entity">
                              {t('v206.entity.open')}
                            </button>
                          )}
                        </div>
                      )}
                      {stopTips.map(tip => (
                        <p key={tip.id} className="v206-tip" data-testid="v206-inline-tip"><Lightbulb size={13} aria-hidden="true" className="mr-1 inline" />{tip.text}</p>
                      ))}
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}

        {current === 'budget' && rows.length > 0 && (
          <div className="v206-budget" data-testid="v206-budget">
            <h4>{t('v206.trip.budget')}</h4>
            <table>
              <tbody>{rows.map(r => <tr key={r.label}><th scope="row" style={{ fontWeight: 500 }}>{r.label}</th><td>{r.value}</td></tr>)}</tbody>
              {facts.budget && <tfoot><tr><th scope="row">{t('v206.trip.budget')}</th><td>{facts.budget}</td></tr></tfoot>}
            </table>
          </div>
        )}
        {current === 'budget' && <p className="v206-note">{t('v206.trip.costNote')}</p>}
      </div>

      <div className="v206-actions">
        <TipsButton n={tips.length} />
        <button type="button" className="v206-link" data-primary="true" onClick={() => setShareOpen(true)} data-testid="v206-share"><Share2 size={14} aria-hidden="true" />{t('v206.trip.share')}</button>
      </div>
      <ShareMenu artifact={artifact} variant="plan" profileName={plan.title} open={shareOpen} onClose={() => setShareOpen(false)} />
    </section>
  )
}
