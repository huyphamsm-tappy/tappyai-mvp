import { MapPin, CalendarDays, Users, Wallet, ArrowRight, Route, ExternalLink, Ticket, Image as ImageIcon } from 'lucide-react'
import type { RequestLocale } from '@/lib/i18n/requestLocale'
import { fill, planBrochureStrings } from '@/lib/i18n/planBrochure'
import { planShareUrl, type PlanBrochure as Brochure, type PlanShareItem } from '@/lib/plans/share/planShare'
import { BRAND } from '@/lib/share/openGraph'
import PlanBrochureShare from './PlanBrochureShare'

// ── The brochure — the approved composition, rendered from the snapshot ─────
//
// Everything on this page is a field of the published snapshot or a count of
// its stops. Sections whose data is absent are not drawn: no photo → the branded
// fallback hero and no highlights panel; no `people` → no travellers row; no
// `budget_total` → no budget row; no summary → no quote card. Nothing is
// substituted, guessed from the title, or pulled from a stock pool.
//
// Server component: no state, no effects. The only client island is the Share
// button in the bar, which reuses the existing ShareMenu with this page's own
// canonical URL — the same targets, contract and copy rules as everywhere else.

interface Props {
  brochure: Brochure
  locale: RequestLocale
  shareId: string
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function PlanBrochure({ brochure, locale, shareId }: Props) {
  const s = planBrochureStrings(locale)
  const { snapshot, hero, dayCount, stopCount, highlights } = brochure
  const canonical = planShareUrl(shareId)

  return (
    <div className="v3-theme dark v3-pb" data-plan-brochure data-share-id={shareId}>
      <header className="v3-pb-bar" data-pb-bar>
        <a href="/" className="v3-pb-brand" aria-label={BRAND.name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local SVG, no pipeline needed */}
          <img src="/logo.svg" alt="" aria-hidden="true" width={26} height={26} className="v3-pb-brand-mark" />
          <span>TAPPY</span>
        </a>
        <PlanBrochureShare url={canonical} title={snapshot.title} label={s.share} />
      </header>

      <main className="v3-pb-main">
        {/* ── Hero: the plan's own first photo, or the branded fallback ── */}
        <section className="v3-pb-hero" data-pb-hero data-has-photo={hero ? 'true' : 'false'}>
          {hero
            // eslint-disable-next-line @next/next/no-img-element -- allow-listed CDN photo from the plan itself
            ? <img src={hero} alt="" className="v3-pb-hero-img" fetchPriority="high" decoding="async" />
            : <div className="v3-pb-hero-fallback" aria-hidden="true"><ImageIcon size={28} strokeWidth={1.5} /><span>{s.noPhoto}</span></div>}
          <div className="v3-pb-hero-shade" aria-hidden="true" />
          <div className="v3-pb-hero-copy">
            <p className="v3-pb-eyebrow">{s.eyebrow}</p>
            <h1 className="v3-pb-title" data-pb-title>{snapshot.title}</h1>
            <ul className="v3-pb-meta" data-pb-meta>
              <li><CalendarDays size={16} aria-hidden="true" />{fill(s.days, dayCount)}</li>
              <li><Route size={16} aria-hidden="true" />{fill(s.stops, stopCount)}</li>
              {snapshot.people && <li data-pb-people><Users size={16} aria-hidden="true" />{fill(s.people, snapshot.people)}</li>}
              {snapshot.budget_total && <li data-pb-budget><Wallet size={16} aria-hidden="true" />{snapshot.budget_total}</li>}
            </ul>
            {snapshot.summary && <p className="v3-pb-summary" data-pb-summary>{snapshot.summary}</p>}
          </div>
        </section>

        <div className="v3-pb-grid">
          {/* ── The itinerary: the primary content ── */}
          <section className="v3-pb-itinerary" id="itinerary" aria-labelledby="pb-itinerary-title" data-pb-itinerary>
            <div className="v3-pb-section-head">
              <h2 id="pb-itinerary-title" className="v3-pb-h2">{s.itinerary}</h2>
              <p className="v3-pb-lead">{s.itineraryLead}</p>
            </div>
            {snapshot.days.map((day, di) => (
              <article key={di} className="v3-pb-day" data-pb-day={di + 1}>
                <header className="v3-pb-day-head">
                  <span className="v3-pb-day-num" aria-hidden="true">{pad(di + 1)}</span>
                  <h3 className="v3-pb-day-label">
                    <span className="sr-only">{fill(s.dayN, di + 1)}: </span>{day.label}
                  </h3>
                </header>
                <ol className="v3-pb-timeline">
                  {day.items.map((it, ii) => <Stop key={ii} item={it} maps={s.maps} booking={s.booking} />)}
                </ol>
              </article>
            ))}
          </section>

          {/* ── Overview + highlights: secondary, real fields only ── */}
          <aside className="v3-pb-side" data-pb-side>
            <section className="v3-pb-panel" aria-labelledby="pb-overview-title" data-pb-overview>
              <h2 id="pb-overview-title" className="v3-pb-panel-title">{s.overview}</h2>
              <dl className="v3-pb-rows">
                <div className="v3-pb-row"><dt><CalendarDays size={18} aria-hidden="true" /><span className="sr-only">{s.day}</span></dt><dd>{fill(s.days, dayCount)} · {fill(s.stops, stopCount)}</dd></div>
                {snapshot.people && <div className="v3-pb-row"><dt><Users size={18} aria-hidden="true" /></dt><dd>{fill(s.people, snapshot.people)}</dd></div>}
                {snapshot.budget_total && (
                  <div className="v3-pb-row"><dt><Wallet size={18} aria-hidden="true" /></dt><dd><span className="v3-pb-row-k">{s.budget}</span>{snapshot.budget_total}</dd></div>
                )}
              </dl>
            </section>

            {highlights.length > 0 && (
              <section className="v3-pb-panel" aria-labelledby="pb-highlights-title" data-pb-highlights>
                <h2 id="pb-highlights-title" className="v3-pb-panel-title">{s.highlights}</h2>
                <ul className="v3-pb-hl">
                  {highlights.map(h => (
                    <li key={h.photo} className="v3-pb-hl-item">
                      {/* eslint-disable-next-line @next/next/no-img-element -- allow-listed CDN photo from the plan itself */}
                      <img src={h.photo} alt="" loading="lazy" decoding="async" />
                      <span>{h.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {snapshot.summary && (
              <section className="v3-pb-panel v3-pb-quote" data-pb-quote>
                <p>{snapshot.summary}</p>
              </section>
            )}
          </aside>
        </div>

        {/* ── The one CTA: this exact plan, on Tappy ── */}
        <div className="v3-pb-cta-wrap">
          <a href={canonical} className="v3-pb-cta" data-pb-cta>
            {s.cta} <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>

        <footer className="v3-pb-foot" data-pb-foot>
          <p>{s.madeBy} <strong>TAPPY</strong></p>
          <p className="v3-pb-foot-line">{s.madeByLine}</p>
        </footer>
      </main>
    </div>
  )
}

/** One stop on the timeline: a compact card, with the real photo when there is one. */
function Stop({ item, maps, booking }: { item: PlanShareItem; maps: string; booking: string }) {
  return (
    <li className="v3-pb-stop" data-pb-stop data-has-photo={item.photo_url ? 'true' : 'false'}>
      <span className="v3-pb-stop-time" data-pb-time>{item.time ?? ''}</span>
      <div className="v3-pb-card">
        {item.photo_url
          // eslint-disable-next-line @next/next/no-img-element -- allow-listed CDN photo from the plan itself
          ? <img src={item.photo_url} alt="" className="v3-pb-card-img" loading="lazy" decoding="async" />
          : <div className="v3-pb-card-img v3-pb-card-fallback" aria-hidden="true">{item.emoji ?? '📍'}</div>}
        <div className="v3-pb-card-body">
          <p className="v3-pb-card-name">{item.name}</p>
          {item.description && <p className="v3-pb-card-desc">{item.description}</p>}
          {item.address && <p className="v3-pb-card-addr"><MapPin size={12} aria-hidden="true" /><span>{item.address}</span></p>}
          {(item.price || item.maps_link || item.booking_link) && (
            <p className="v3-pb-card-links">
              {item.price && <span className="v3-pb-card-price">{item.price}</span>}
              {item.maps_link && <a href={item.maps_link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} aria-hidden="true" />{maps}</a>}
              {item.booking_link && <a href={item.booking_link} target="_blank" rel="noopener noreferrer"><Ticket size={12} aria-hidden="true" />{booking}</a>}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
