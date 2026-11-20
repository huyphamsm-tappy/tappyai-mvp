'use client'
// Workspace v206 (NEXT_PUBLIC_WORKSPACE_V206): the itinerary as the RFC-001 mockup draws it - a header, day tabs, a vertical timeline with time chips and each stop's own photo,
// the tips that name a stop beside it, the plan's own budget rows and the share action. Built ONLY from the plan the answer carries (TripPlanCard's data) and the turn's own place
// cards: nothing is added (no destination, dates, pace, verification, partner or discount that the plan does not state). The former TripPlanCard stays the layout when the flag is off.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Download, ExternalLink, Lightbulb, MapPin, Share2, UserRound } from 'lucide-react'
import { downloadReportPdf, type PdfCover } from '@/lib/answerDoc/reportPdf'
import { planMarkdown } from '@/lib/answerDoc/planMarkdown'
import '../v206.css'
import type { TappyPlan } from '@/components/TripPlanCard'
import ShareMenu from '@/components/share/ShareMenu'
import { buildPlanArtifact } from '@/lib/share/shareArtifact'
import { PLAN_SHARE_ID_RE, planShareUrl } from '@/lib/plans/share/planShare'
import { withPlacePhotos, type PlacePhotoSource } from '@/lib/plans/share/planPhotos'
import { plainTextDeep } from '@/lib/chat/markdownNormalize'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  budgetRows, budgetLines, buildEntityProfile, matchPlace, planTips, splitDayLabel, timeChip, tipsByStop, tripFacts, tripWho,
  type PlaceFields, type V206Plan,
} from '@/lib/chat/v206'
import { v206Store } from '@/lib/chat/v206Store'
import { useEntityLabels } from './V206Drawers'
import { subjectKey } from '@/lib/answerDoc/subjectImages'

type Tab = 'all' | 'budget' | number

export interface TripTimelineProps {
  msgId: string
  plan: TappyPlan
  /** the same turn's place cards: their real fields feed the entity drawer, their photos the shared plan */
  places?: readonly (PlaceFields & PlacePhotoSource)[] | null
  /** pictures for the stops that have none of their own (stop name key -> https picture), found after the answer by the server and confirmed by looking at them */
  stopImages?: ReadonlyMap<string, string>
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

/** The mockup's budget table: item / basis / cost, then the total. The basis column exists only when the plan marked its amounts (budgetLines); nothing is summed here. */
function BudgetTable({ plan, total }: { plan: V206Plan; total: string | null }) {
  const { t } = useTranslation()
  const { lines, hasBasis } = budgetLines(plan)
  if (lines.length === 0) return null
  return (
    <div className="v206-budget" data-testid="v206-budget">
      <h4>{t('v206.trip.budget')}</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('v206.budget.colItem')}</th>
            {hasBasis && <th scope="col">{t('v206.budget.colBasis')}</th>}
            <th scope="col">{t('v206.budget.colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(r => (
            <tr key={r.label}>
              <th scope="row" style={{ fontWeight: 500 }}>{r.label}</th>
              {hasBasis && <td data-basis={r.estimate ? 'estimate' : 'found'}>{r.estimate ? t('v206.budget.estimate') : t('v206.budget.found')}</td>}
              <td>{r.amount}</td>
            </tr>
          ))}
        </tbody>
        {total && <tfoot><tr><th scope="row">{t('v206.budget.total')}</th>{hasBasis && <td />}<td>{total}</td></tr></tfoot>}
      </table>
    </div>
  )
}

export default function TripTimeline({ msgId, plan: rawPlan, places, stopImages }: TripTimelineProps) {
  const { t, locale } = useTranslation()
  const labels = useEntityLabels()
  const plan = useMemo(() => plainTextDeep(rawPlan) as unknown as V206Plan & TappyPlan, [rawPlan])
  const [tab, setTab] = useState<Tab>('all')
  const [shareOpen, setShareOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  // owner 20/11: sharing a plan is a LINK to its page (/plan/<id>: photos, stops, cost lines, tips), not a picture (the picture was cut and missed most stops). Signed out or no link: the old share sheet.
  const shareAsLink = async () => {
    setShareBusy(true)
    try {
      const r = await fetch('/api/plans/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: withPlacePhotos(plan as TappyPlan, places) }) })
      const body = r.ok ? ((await r.json()) as { id?: unknown }) : null
      if (!body || typeof body.id !== 'string' || !PLAN_SHARE_ID_RE.test(body.id)) { setShareOpen(true); return }
      const url = planShareUrl(body.id)
      try { await navigator.clipboard.writeText(url); setShareNote(t('v206.trip.linkCopied')) } catch { setShareNote(url) }
      window.setTimeout(() => setShareNote(null), 6000)
    } catch { setShareOpen(true) } finally { setShareBusy(false) }
  }
  // the plan as the designed PDF page (the same layout as a research report): built in the browser, nothing is sent anywhere
  const downloadPlanPdf = async () => {
    setPdfBusy(true)
    try {
      const f = tripFacts(plan)
      const facts = [t('v206.trip.days', { n: String(f.days) }), t('v206.trip.stops', { n: String(f.stops) }), ...(f.people ? [t('v206.trip.people', { n: String(f.people) })] : []), ...(f.budget ? [f.budget] : [])].join(' · ')
      const text = planMarkdown(plan as TappyPlan, { facts, budget: t('v206.trip.budget'), item: t('v206.trip.pdfItem'), cost: t('v206.trip.pdfCost'), tips: t('v206.trip.pdfTips'), total: t('v206.trip.pdfTotal'), stays: t('v206.trip.stays'), dishes: t('v206.trip.dishes') })
      const date = new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN')
      const cover: PdfCover = {
        eyebrow: t('v206.trip.pdfEyebrow'), title: plan.title, facts: [facts, t('report.updated', { date })].filter(Boolean),
        kind: t('v206.trip.pdfEyebrow').split('·')[0].trim(), updated: t('report.updated', { date }), sources: 0, sourcesWord: '',
        words: { scope: t('report.design.scope'), caveats: t('report.design.caveats'), sources: t('report.design.sources'), footer: t('report.design.footer') },
        labels: { line: t('v206.trip.pdfLine'), note: t('v206.trip.pdfNote'), footerBrand: t('v206.trip.pdfFooter') },
      }
      await downloadReportPdf(text, [], plan.title, cover)
    } finally { setPdfBusy(false) }
  }
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const facts = tripFacts(plan)
  const who = tripWho(plan)
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
          {who.traveler.map((x, i) => <span key={`t${i}`} className="v206-chip">{x}</span>)}
        </div>
        {who.assumptions.length > 0 && (
          <p data-testid="v206-assumptions" className="mt-2 text-[12px] leading-snug text-slate-400">{t('v206.trip.assumed')} {who.assumptions.join(' · ')}</p>
        )}
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
                  const fallback = stopImages?.get(subjectKey(it.name))
                  const photo = it.photo_url && isSafeHttpsUrl(it.photo_url) ? it.photo_url : fallback && isSafeHttpsUrl(fallback) ? fallback : null
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
                          {/* the mockup's hero: a caption chip on the picture (the stop's own name and address) and the profile button on it */}
                          <span className="v206-photo-shade" aria-hidden="true" />
                          <span className="v206-photo-bar">
                            <span className="v206-photo-cap" data-testid="v206-photo-caption">{it.name}{addr ? ` · ${addr}` : ''}</span>
                            {canProfile && (
                              <button type="button" className="v206-photo-open" onClick={() => v206Store.openEntity(profile!)} aria-label={t('v206.entity.openNamed', { name: it.name })} data-testid="v206-open-entity">
                                {t('v206.entity.open')} ↗
                              </button>
                            )}
                          </span>
                        </span>
                      )}
                      {addr && !photo && <p className="v206-addr"><MapPin size={12} aria-hidden="true" className="mr-1 inline" />{addr}</p>}
                      {(maps || book || (canProfile && !photo)) && (
                        <div className="v206-links">
                          {book && <a href={book} target="_blank" rel="noopener noreferrer" className="v206-link" data-primary="true"><ExternalLink size={13} aria-hidden="true" />{t('v206.trip.book')}</a>}
                          {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="v206-link"><MapPin size={13} aria-hidden="true" />{t('v206.trip.map')}</a>}
                          {canProfile && !photo && (
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

        {/* the mockup closes the whole trip with its budget table; one day alone does not */}
        {(current === 'budget' || current === 'all') && rows.length > 0 && <BudgetTable plan={plan} total={facts.budget} />}
        {(current === 'budget' || current === 'all') && rows.length > 0 && <p className="v206-note">{t('v206.trip.costNote')}</p>}

        {/* owner 20/11: where to sleep and what to eat as their own sections (the server kept only what the turn's lookups support) */}
        {(current === 'budget' || current === 'all' || plan.days.length === 1) && Array.isArray(plan.stays) && plan.stays.length > 0 && (
          <div data-testid="v206-stays">
            <h4 className="v206-day-title">{t('v206.trip.stays')}</h4>
            <ul>
              {plan.stays.map((s, i) => {
                const book = s.booking_link && isSafeHttpsUrl(s.booking_link) ? s.booking_link : null
                return (
                  <li key={i} className="mt-2">
                    <div className="v206-stop-head"><h5 className="v206-stop-name">{s.name}</h5>{s.price && <span className="v206-price">{s.price}</span>}</div>
                    {s.why && <p className="v206-desc">{s.why}</p>}
                    {s.address && <p className="v206-addr"><MapPin size={12} aria-hidden="true" className="mr-1 inline" />{s.address}</p>}
                    {book && <div className="v206-links"><a href={book} target="_blank" rel="noopener noreferrer" className="v206-link" data-primary="true"><ExternalLink size={13} aria-hidden="true" />{t('v206.trip.book')}</a></div>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {(current === 'budget' || current === 'all' || plan.days.length === 1) && Array.isArray(plan.dishes) && plan.dishes.length > 0 && (
          <div data-testid="v206-dishes">
            <h4 className="v206-day-title">{t('v206.trip.dishes')}</h4>
            <ul>
              {plan.dishes.map((d, i) => (
                <li key={i} className="mt-2">
                  <div className="v206-stop-head"><h5 className="v206-stop-name">{d.dish}</h5>{d.price && <span className="v206-price">{d.price}</span>}</div>
                  {d.venue && <p className="v206-desc">{d.venue}{d.note ? ` · ${d.note}` : ''}</p>}
                  {!d.venue && d.note && <p className="v206-desc">{d.note}</p>}
                  {d.address && <p className="v206-addr"><MapPin size={12} aria-hidden="true" className="mr-1 inline" />{d.address}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="v206-actions">
        <TipsButton n={tips.length} />
        <button type="button" className="v206-link" data-primary="true" disabled={shareBusy} onClick={() => { void shareAsLink() }} data-testid="v206-share"><Share2 size={14} aria-hidden="true" />{t('v206.trip.share')}</button>
        {shareNote && <span className="v206-note" role="status" data-testid="v206-share-note">{shareNote}</span>}
        <button type="button" className="v206-link" disabled={pdfBusy} onClick={() => { void downloadPlanPdf() }} data-testid="v206-pdf"><Download size={14} aria-hidden="true" />{t('v206.trip.pdf')}</button>
      </div>
      <ShareMenu artifact={artifact} variant="plan" profileName={plan.title} open={shareOpen} onClose={() => setShareOpen(false)} />
    </section>
  )
}
