import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { BRAND, absoluteUrl } from '@/lib/share/openGraph'
import { normalizeLocale, type RequestLocale } from '@/lib/i18n/requestLocale'
import { fill, planBrochureStrings } from '@/lib/i18n/planBrochure'
import { planSharePath } from '@/lib/plans/share/planShare'
import { getPlanShare } from './getPlanShare'
import PlanBrochure from './PlanBrochure'

// ── /plan/<shareId> — the Tappy Plan brochure a recipient opens ─────────────
//
// A public page for one published plan: the snapshot behind the id (see
// `plan_shares` and `planShare.ts`), rendered as the approved brochure — a
// cinematic hero from the plan's own first photo, the editorial day-by-day
// timeline, the trip overview and highlights, and the one CTA back to this same
// plan on Tappy. Nothing here calls a model or a Places API; the page is one
// RPC and markup.
//
// 🚨 THE PLAN IS THE ONLY INPUT. There is no session, no conversation and no
// owner on this page. A signed-out recipient and the sender see the same thing.
//
// 🚨 A REAL 404. `notFound()` below produces an HTTP 404 because there is no
// `loading.tsx` at the app root (BUG-004) — a wrong or withdrawn link must not
// answer 200 with a "not found" card inside it, or crawlers cache the miss.

interface Props {
  params: { shareId: string }
}

/** A recipient has no app locale; the request's language header decides, Vietnamese by default. */
function recipientLocale(): RequestLocale {
  const tag = headers().get('accept-language')?.split(',')[0]?.trim()
  return normalizeLocale(tag)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brochure = await getPlanShare(params.shareId)
  const locale = recipientLocale()
  const s = planBrochureStrings(locale)
  if (!brochure) {
    return { title: `${s.notFoundTitle} | ${BRAND.name}`, robots: { index: false, follow: false } }
  }
  const { snapshot, dayCount } = brochure
  const title = `${snapshot.title} | ${s.eyebrow}`
  const description = snapshot.summary ?? fill(s.ogDescription, dayCount)
  const url = absoluteUrl(planSharePath(params.shareId))
  // The image is the route's own `opengraph-image.tsx` / `twitter-image.tsx`
  // (file-based metadata, merged by Next): the real hero photo composed with
  // the plan's title — never the generic site card.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND.name,
      type: 'article',
      locale: locale === 'vi' ? 'vi_VN' : 'en_US',
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PlanSharePage({ params }: Props) {
  const brochure = await getPlanShare(params.shareId)
  if (!brochure) notFound()
  const locale = recipientLocale()
  return <PlanBrochure brochure={brochure} locale={locale} shareId={params.shareId} />
}
