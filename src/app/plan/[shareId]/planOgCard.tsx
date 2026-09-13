import type { ReactElement } from 'react'
import { fill, planBrochureStrings } from '@/lib/i18n/planBrochure'
import { getPlanShare } from './getPlanShare'

/** What the social card shows. Every field is real or null; the layout drops what is null. */
export interface PlanOgCard {
  eyebrow: string
  title: string
  line: string
  photo: string | null
}

/**
 * The card's content for a share id — the plan's own title, counts and hero,
 * or the brand alone for a link that no longer resolves. One RPC, no model.
 * Pure data, so the composition is testable without the rasteriser.
 */
export async function planOgContent(shareId: string): Promise<PlanOgCard> {
  const brochure = await getPlanShare(shareId)
  const s = planBrochureStrings('vi')
  return brochure
    ? {
        eyebrow: s.eyebrow,
        title: brochure.snapshot.title,
        line: [fill(s.days, brochure.dayCount), fill(s.stops, brochure.stopCount), brochure.snapshot.people ? fill(s.people, brochure.snapshot.people) : null].filter(Boolean).join('  ·  '),
        photo: brochure.hero,
      }
    : { eyebrow: s.eyebrow, title: 'TappyAI', line: s.madeByLine, photo: null }
}

// The 1200×630 card, as Satori-compatible JSX: flex only, absolute positioning,
// no CSS variables, no external stylesheet. Shared by opengraph-image and
// twitter-image so the two can never drift.
export function planOgCard(c: PlanOgCard, fontFamily = 'sans-serif'): ReactElement {
  return (
    <div
      style={{
        width: 1200, height: 630, display: 'flex', position: 'relative',
        background: 'linear-gradient(135deg, #070A12 0%, #0B1220 60%, #14133A 100%)',
        color: '#FFFFFF', fontFamily,
      }}
    >
      {c.photo && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori markup, not the DOM
        <img src={c.photo} alt="" width={1200} height={630} style={{ position: 'absolute', inset: 0, width: 1200, height: 630, objectFit: 'cover' }} />
      )}
      {/* Bottom-left shade so white type reads on any photo. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(180deg, rgba(7,10,18,0.15) 0%, rgba(7,10,18,0.62) 55%, rgba(7,10,18,0.95) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(90deg, rgba(7,10,18,0.75) 0%, rgba(7,10,18,0.25) 60%, rgba(7,10,18,0) 100%)' }} />

      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 56, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 8, textTransform: 'uppercase', color: '#8FB8FF', fontWeight: 600 }}>{c.eyebrow}</div>
        <div style={{ display: 'flex', marginTop: 14, fontSize: c.title.length > 34 ? 60 : 76, lineHeight: 1.08, fontWeight: 800, maxWidth: 1000, textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
          {c.title.length > 70 ? `${c.title.slice(0, 68)}…` : c.title}
        </div>
        {c.line && <div style={{ display: 'flex', marginTop: 20, fontSize: 30, color: 'rgba(255,255,255,0.88)' }}>{c.line}</div>}
      </div>

      <div style={{ position: 'absolute', top: 44, left: 64, display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg, #2F8FFF, #6A5CFF)', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>T</div>
        <div style={{ display: 'flex', marginLeft: 16, fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>TAPPY</div>
      </div>
    </div>
  )
}
