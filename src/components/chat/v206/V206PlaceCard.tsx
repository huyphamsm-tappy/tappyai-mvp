'use client'
// Workspace v206 look (NEXT_PUBLIC_WORKSPACE_V206 + NEXT_PUBLIC_RESPONSE_PRESENTATION): the place card of the RFC-001 mockup - a dark glass card with a type badge, a rating chip, the name with a
// small arrow, the address, a mono row of hours / price, one full-width primary button and a row of small secondary buttons.
// Every field and every control comes from the REAL card: one with no data behind it is not drawn (no photo is faked, there is no description or menu link on a card, so none is shown).
// "Xem hồ sơ" opens the profile drawer; "Lưu" uses the saved-places API the app already has (POST / DELETE /api/favorites).
import { useMemo, useState } from 'react'
import { Bookmark, BookmarkCheck, ExternalLink, Globe, Map as MapIcon, Phone, Ticket, Utensils, BedDouble, CalendarCheck, UserRound } from 'lucide-react'
import '../v206.css'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { redirectIfAccountRequired } from '@/lib/auth/accountRequiredClient'
import { actionLabel } from '@/lib/recommendation/actionLabel'
import { commerceTap } from '@/lib/recommendation/handoff'
import { stayOfferLine } from '@/lib/recommendation/stayOffer'
import { track } from '@/lib/tracking/tracker'
import type { LivePlace } from '@/lib/recommendation/liveView'
import { buildEntityProfile } from '@/lib/chat/v206'
import { FAVORITES_CHANGED_EVENT, placeCardView, saveablePlace } from '@/lib/chat/v206Look'
import { v206Store } from '@/lib/chat/v206Store'
import { useEntityLabels } from './V206Drawers'

/** Actions that DO the thing (order, book, reserve, buy): they stay on the card exactly as before, above the profile button. */
const BOOK_KINDS: ReadonlySet<string> = new Set(['order', 'delivery', 'booking', 'reservation', 'ticket', 'purchase'])
/** Kinds the card already draws as its own control (map, website, hotline). */
const OWN_KINDS: ReadonlySet<string> = new Set(['maps', 'directions', 'website', 'call'])

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

function SaveButton({ place }: { place: LivePlace }) {
  const { t } = useTranslation()
  const body = saveablePlace(place)
  const [state, setState] = useState<SaveState>('idle')
  if (!body) return null
  async function toggle() {
    if (state === 'saving' || !body) return
    const removing = state === 'saved'
    setState('saving')
    try {
      const res = removing
        ? await fetch(`/api/favorites?placeId=${encodeURIComponent(body.placeId)}`, { method: 'DELETE' })
        : await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        // owner 28/11/2026: saving a place needs an account; a visitor is taken to sign in and brought back to the chat
        if (await redirectIfAccountRequired(res)) { setState(removing ? 'saved' : 'idle'); return }
        throw new Error(String(res.status))
      }
      if (!removing) track('search_result_saved', { place_type: 'saved' })
      setState(removing ? 'idle' : 'saved')
      window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT))
    } catch {
      setState(removing ? 'saved' : 'failed')
    }
  }
  const Icon = state === 'saved' ? BookmarkCheck : Bookmark
  return (
    <button type="button" onClick={toggle} aria-pressed={state === 'saved'} disabled={state === 'saving'} data-testid="v206-pc-save" data-state={state} className="v206-pc-btn" data-active={state === 'saved' ? 'true' : undefined}>
      <Icon size={13} aria-hidden="true" />
      {state === 'saved' ? t('v206.card.saved') : state === 'failed' ? t('v206.card.saveFailed') : t('v206.card.save')}
    </button>
  )
}

/** `solo`: the card standing alone under its own text (wide; shows the place's real photo when it has one) instead of one card of a swipeable group. */
export default function V206PlaceCard({ p, position, ranked, solo, notes, noteSources }: { p: LivePlace; position: number; ranked: boolean; solo?: boolean; /** the points the answer gave about this venue (the model's declared subject card for it): drawn as the "highlights" box */ notes?: ReadonlyArray<{ lead?: string; text: string }>; /** the names of the sources those points rest on, shown under them */ noteSources?: readonly string[] }) {
  const { t, locale } = useTranslation()
  const labels = useEntityLabels()
  const v = useMemo(() => placeCardView(p, locale), [p, locale])
  // the profile drawer: real fields of this card; the map link is the card's own
  const profile = useMemo(
    () => buildEntityProfile(p, v.maps ? { name: p.name, maps_link: v.maps } : null, labels),
    [p, v.maps, labels],
  )
  // a stay's reference price from the provider's own structured figure; its platform is a source of the box
  const stayLine = useMemo(() => stayOfferLine(p.stayOffer, t, locale), [p.stayOffer, t, locale])
  const allNoteSources = useMemo(() => (stayLine && p.stayOffer ? [...new Set([p.stayOffer.platform, ...(noteSources ?? [])])] : [...(noteSources ?? [])]), [stayLine, p.stayOffer, noteSources])
  const lead = p.actions.find(a => a.commerce?.primary === true)
  // two buttons that say the same thing ("Đặt chỗ" twice) are one: the first of each label stays (the lead's label counts)
  const seenLabels = new Set<string>(lead ? [actionLabel(lead, t)] : [])
  const bookAll = p.actions.filter(a => a !== lead && BOOK_KINDS.has(a.kind))
  const books = bookAll.filter(a => { const l = actionLabel(a, t); if (seenLabels.has(l)) return false; seenLabels.add(l); return true })
  const extra = p.actions.filter(a => a !== lead && !bookAll.includes(a) && !OWN_KINDS.has(a.kind))
  const open = () => { if (profile) v206Store.openEntity(profile) }

  return (
    <div
      data-testid="place-card"
      data-v206-card="true"
      data-rank={ranked ? position + 1 : undefined}
      data-lead={ranked && position === 0 ? 'true' : undefined}
      onClick={() => track('recommendation_click', { domain: p.domain })}
      className="v206-pc"
      data-solo={solo ? 'true' : undefined}
      data-photo={solo && v.image ? 'true' : undefined}
    >
      {solo && v.image && (
        <div className="v206-pc-solo-photo" data-testid="place-solo-photo">
          <img src={v.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
        </div>
      )}
      {/* the first layout's card of a group: the place's real picture on top with the rank badge on it (a card with no picture keeps the badge in its first row) */}
      {!solo && v.image && (
        <div className="v206-pc-thumb" data-testid="place-thumb">
          <img src={v.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
          {v.badge && <span className="v206-pc-badge v206-pc-thumb-badge" data-testid="v206-pc-badge">{v.badge}</span>}
        </div>
      )}
      {(v.rating || (v.badge && !(!solo && v.image))) && (
        <div className="v206-pc-top">
          {v.badge && !(!solo && v.image) ? <span className="v206-pc-badge" data-testid="v206-pc-badge">{v.badge}</span> : <span />}
          {v.rating && (
            <span
              className="v206-pc-rating"
              data-testid="v206-pc-rating"
              aria-label={v.rating.count ? t('v206.card.ratingLabel', { rating: v.rating.value, count: v.rating.count }) : t('v206.card.ratingOnly', { rating: v.rating.value })}
            >
              <span aria-hidden="true">★ {v.rating.value}</span>
              {v.rating.count && <span className="v206-pc-count" aria-hidden="true"> ({v.rating.count})</span>}
            </span>
          )}
        </div>
      )}

      <h4 className="v206-pc-name">
        {profile ? (
          <button type="button" onClick={open} aria-label={t('v206.card.openProfile', { name: p.name })} className="v206-pc-namebtn">
            <span>{p.name}</span><ExternalLink size={12} aria-hidden="true" className="v206-pc-arrow" />
          </button>
        ) : <span>{p.name}</span>}
      </h4>

      {v.address && <p className="v206-pc-addr" data-testid="v206-pc-address">{v.address}</p>}

      {v.hasMeta && (
        <p className="v206-pc-meta" data-testid="v206-pc-meta">
          {(v.hours || v.open) && (
            <span className="v206-pc-hours" data-open={v.open ?? undefined}>
              <span className="v206-pc-dot" aria-hidden="true" />
              {v.hours}
              {v.open && <span className="v206-pc-state">{v.hours ? ' · ' : ''}{v.open === 'open' ? t('v206.card.open') : t('v206.card.closed')}</span>}
            </span>
          )}
          {v.price && <span className="v206-pc-price" data-testid="v206-pc-price">{v.price}</span>}
        </p>
      )}

      {((notes && notes.length > 0) || stayLine) && (
        <div className="v206-pc-notes" data-testid="v206-pc-notes">
          <p className="v206-pc-notes-title">{t('v206.card.highlights')}</p>
          <ul>
            {stayLine && <li data-testid="v206-pc-stay-price">{stayLine}</li>}
            {notes?.map((n, i) => <li key={i}>{n.lead && <strong>{n.lead}: </strong>}{n.text}</li>)}
          </ul>
          {allNoteSources.length > 0 && <p className="v206-pc-notes-src" data-testid="v206-pc-notes-src">{t('v206.profile.sources')}: {allNoteSources.join(', ')}</p>}
        </div>
      )}

      {lead && (
        <a data-testid="commerce-lead" href={lead.url} target="_blank" rel="noopener noreferrer" onClick={() => commerceTap(lead, p.domain)} className="v206-pc-primary" data-kind="lead">
          {actionLabel(lead, t)}
        </a>
      )}
      {books.length > 0 && (
        <div className="v206-pc-row" data-testid="place-book">
          {books.map(a => {
            const Icon = a.kind === 'order' || a.kind === 'delivery' ? Utensils : a.kind === 'ticket' ? Ticket : a.kind === 'booking' ? BedDouble : CalendarCheck
            return (
              <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" data-action-kind={a.kind} onClick={a.commerce ? () => commerceTap(a, p.domain) : undefined} className="v206-pc-primary" data-kind="book">
                <Icon size={14} aria-hidden="true" /> {actionLabel(a, t)}
              </a>
            )
          })}
        </div>
      )}
      {profile && (
        <button type="button" onClick={open} className="v206-pc-primary" data-testid="v206-pc-profile">
          <UserRound size={14} aria-hidden="true" /> {t('v206.card.profile')}
        </button>
      )}

      <div className="v206-pc-row v206-pc-small">
        {v.maps && <a href={v.maps} target="_blank" rel="noopener noreferrer" className="v206-pc-btn" data-testid="v206-pc-map"><MapIcon size={13} aria-hidden="true" />{t('v206.card.map')}</a>}
        {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" className="v206-pc-btn" data-testid="v206-pc-website"><Globe size={13} aria-hidden="true" />{t('v206.card.website')}</a>}
        {v.phone && <a href={v.phone.href} className="v206-pc-btn" data-testid="v206-pc-hotline" title={v.phone.display}><Phone size={13} aria-hidden="true" />{t('v206.card.hotline')}</a>}
        <SaveButton place={p} />
        {extra.map(a => (
          <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" onClick={a.commerce ? () => commerceTap(a, p.domain) : undefined} className="v206-pc-btn" data-action-kind={a.kind}>{actionLabel(a, t)}</a>
        ))}
      </div>
    </div>
  )
}
