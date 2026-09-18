import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicSharedResult } from '@/lib/share/sharedResultStore'
import { isValidSlug } from '@/lib/share/slug'
import { buildSharedResultMetadata, sharedResultJsonLd } from '@/lib/share/sharedResultMetadata'
import PublicResultView from './PublicResultView'

// ─────────────────────────────────────────────────────────────────────────────
// /r/[slug] — a public, frozen TappyAI result.
//
// THE COST RULE, ENFORCED BY SHAPE: this page reads ONE row and renders its
// frozen payload. It imports nothing from the AI pipeline, has no access to a
// session, memory or conversation, and is ISR-cached — so the 1st and the
// 100,000th view cost the same: zero inference, and (after the first) zero
// database reads until the revalidation window passes.
//
// No login, no teaser, no paywall: the full useful result is the page. The
// follow-up box at the bottom is where a viewer meets Tappy, and THAT path is
// the rate-limited one (see followUpGuard).
// ─────────────────────────────────────────────────────────────────────────────

/** ISR: a frozen payload never changes, so an hour is about counters and withdrawals. */
export const revalidate = 3600
export const dynamicParams = true

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isValidSlug(params.slug)) return { robots: { index: false, follow: false } }
  const row = await getPublicSharedResult(params.slug)
  if (!row) return { robots: { index: false, follow: false } }
  return buildSharedResultMetadata(row)
}

export default async function SharedResultPage({ params }: Props) {
  if (!isValidSlug(params.slug)) notFound()
  const row = await getPublicSharedResult(params.slug)
  if (!row) notFound()

  const jsonLd = sharedResultJsonLd(row)
  return (
    <>
      {/* Structured data for search engines and AI answer engines: the question and the
          answer, as data. Built from the frozen payload only — the same text the page shows. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicResultView result={row} />
    </>
  )
}
