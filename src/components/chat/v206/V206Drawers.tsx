'use client'
// Workspace v206: the tips drawer and the entity-profile drawer, and the host that shows whichever the store says is open. They show ONLY what the answer really has:
// the tips are the answer's own (a plan's local tips, the callouts it wrote), the profile is a place card's / plan stop's own fields. No verification claim, no source, no
// partner or discount is ever made up; with nothing real to show the control that opens them is not rendered.
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Lightbulb } from 'lucide-react'
import OverlayDrawer from './OverlayDrawer'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { filterTips, type EntityLabels, type EntityProfile, type PlanTip } from '@/lib/chat/v206'
import { v206Store } from '@/lib/chat/v206Store'
import type { WikiEntity } from '@/lib/chat/entityProfiles'

/** Below this many tips a search box is noise. */
const SEARCH_FROM = 4

export function TipsDrawer({ tips, onClose }: { tips: readonly PlanTip[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const shown = useMemo(() => filterTips(tips, q), [tips, q])
  return (
    <OverlayDrawer title={t('v206.tips.title')} subtitle={t('v206.tips.sub', { n: String(tips.length) })} closeLabel={t('v206.close')} onClose={onClose} testId="v206-tips-drawer"
      footer={<><span>{t('v206.tips.note')}</span><button type="button" className="v206-kbd" onClick={onClose}>{t('v206.close')} [Esc]</button></>}>
      {tips.length >= SEARCH_FROM && (
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('v206.tips.search')} aria-label={t('v206.tips.search')} className="v206-search" data-testid="v206-tips-search" />
      )}
      {shown.length === 0 && <p className="v206-note" role="status">{t('v206.tips.none')}</p>}
      <ol className="m-0 list-none p-0" aria-label={t('v206.tips.title')}>
        {shown.map((tip, i) => (
          <li key={tip.id} className="v206-tipcard" data-testid="v206-tip">
            <span className="v206-tipcard-tag"><Lightbulb size={11} aria-hidden="true" className="mr-1 inline" />{`#${String(i + 1).padStart(2, '0')}`}{tip.place ? ` · ${tip.place}` : tip.general ? ` · ${t('v206.tips.general')}` : ''}</span>
            {tip.title && <h3>{tip.title}</h3>}
            <p>{tip.text}</p>
          </li>
        ))}
      </ol>
    </OverlayDrawer>
  )
}

export function EntityDrawer({ profile, onClose }: { profile: EntityProfile; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <OverlayDrawer title={profile.title} subtitle={profile.subtitle} closeLabel={t('v206.close')} onClose={onClose} testId="v206-entity-drawer"
      footer={<><span>{t('v206.entity.note')}</span><button type="button" className="v206-kbd" onClick={onClose}>{t('v206.close')} [Esc]</button></>}>
      {profile.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.image} alt={profile.title} className="v206-hero" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />
      )}
      {profile.facts.length > 0 && (
        <dl className="v206-facts" data-testid="v206-facts">
          {profile.facts.map((f, i) => <div key={`${f.label}-${i}`}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      )}
      {profile.note && <p className="v206-tipcard" style={{ color: '#c7d1e3', fontSize: 13.5, lineHeight: 1.6 }}>{profile.note}</p>}
      {profile.links.length > 0 && (
        <div className="v206-links">
          {profile.links.map((l, i) => (
            <a key={`${l.kind}-${i}`} href={l.href} className="v206-link" data-primary={i === 0 ? 'true' : undefined}
              {...(l.kind === 'phone' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>{l.label}</a>
          ))}
        </div>
      )}
    </OverlayDrawer>
  )
}

/**
 * The profile a named-entity chip opens: ONLY what Wikipedia's summary said (picture, name, one-line description, extract) and where it is from.
 * No verification badge, no figure of ours, no source that was not fetched.
 */
export function WikiDrawer({ profile, onClose }: { profile: WikiEntity; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <OverlayDrawer title={profile.name} subtitle={profile.description || undefined} closeLabel={t('v206.close')} onClose={onClose} testId="v206-wiki-drawer"
      footer={<><span>{t('v206.wiki.note')}</span><button type="button" className="v206-kbd" onClick={onClose}>{t('v206.close')} [Esc]</button></>}>
      <p className="v206-wiki-kind">{t('v206.wiki.title')}</p>
      {profile.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.image} alt={profile.title} className="v206-hero v206-wiki-photo" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />
      )}
      {profile.title !== profile.name && <p className="v206-wiki-title">{profile.title}</p>}
      <p className="v206-wiki-extract" data-testid="v206-wiki-extract">{profile.extract}</p>
      <p className="v206-wiki-src">
        <span>{t('v206.wiki.source')}</span>
        {' · '}
        <a href={profile.href} target="_blank" rel="noopener noreferrer" className="v206-wiki-link" data-testid="v206-wiki-link">{t('v206.wiki.read')}</a>
      </p>
    </OverlayDrawer>
  )
}

/** The labels of an entity profile in the person's language. */
export function useEntityLabels(): EntityLabels {
  const { t } = useTranslation()
  return useMemo(() => ({
    status: t('v206.entity.status'), address: t('v206.entity.address'), rating: t('v206.entity.rating'), reviews: (n: number) => t('v206.entity.reviews', { n: String(n) }),
    stars: t('v206.entity.stars'), hours: t('v206.entity.hours'), openNow: t('v206.entity.openNow'), closedNow: t('v206.entity.closedNow'), phone: t('v206.entity.phone'),
    price: t('v206.entity.price'), time: t('v206.entity.time'), category: t('v206.entity.category'), distance: t('v206.entity.distance'), maps: t('v206.entity.maps'),
    booking: t('v206.entity.booking'), call: t('v206.entity.call'), description: t('v206.entity.description'),
  }), [t])
}

/** Mounted once by the chat: draws whichever drawer the store says is open (never both). */
export default function V206DrawerHost() {
  const st = useSyncExternalStore(v206Store.subscribe, v206Store.getSnapshot, v206Store.getServerSnapshot)
  if (!st.drawer) return null
  if (st.drawer.kind === 'tips') return <TipsDrawer tips={st.tips} onClose={v206Store.closeDrawer} />
  if (st.drawer.kind === 'wiki') return <WikiDrawer profile={st.drawer.profile} onClose={v206Store.closeDrawer} />
  return <EntityDrawer profile={st.drawer.profile} onClose={v206Store.closeDrawer} />
}
