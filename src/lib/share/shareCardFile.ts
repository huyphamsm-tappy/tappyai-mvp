// THE ONE card-file generator — for "Save to device" AND for "share as a file" (TikTok, the OS
// sheet). Both used to diverge: the approved profile sheet ("Chia sẻ với mọi người") showed the
// TappyAI card, but Save wrote the generic dark recommendation card (`renderArtifactImage`), so the
// downloaded file never matched the layout the user was looking at (owner UAT 2026-09-28).
//
// The LAYOUT decides the file. Owner picks 29/09 (docs/design/share-layouts/README.md):
//
//  - `profile` / `post`   the TappyAI QR card (sample #1, `renderBrandedQrCard`): lockup, name/title,
//                         caption, a scannable code of the link, banner, website and feature strip.
//  - `review` / `clip`    an Explore post's own card in sample #1's style (`renderPostCard`).
//  - `suggestion`         a chat recommendation's places in sample #1's style (`renderSuggestionCard`).
//  - `plan`               the itinerary image in sample #7's style (`renderPlanCard`).
//  - `default`            the legacy brochure card (`renderArtifactImage`) — url-only shares.
//
// 🔑 ONE FILE. The share sheet renders the chosen layout ONCE, shows that very file as its preview,
// and hands the SAME File object to "Lưu về máy" and to TikTok — so what is saved is byte-for-byte
// what the user saw.
//
// Null on any failure: the caller falls back (text file for Save, caption copy for TikTok).

import type { ShareArtifact, SharedPlace } from './shareArtifact'
import { renderArtifactImage } from './renderCardImage'
import { renderBrandedQrCard, type BrandedQrOptions } from '@/lib/qr/brandedCard'
import { renderPostCard, renderSuggestionCard, type ContentCardCopy, type SharePostCard } from './contentCards'
import { renderPlanCard } from './planCard'
import type { PlanShareSnapshot } from '@/lib/plans/share/planShare'
import { planBrochureStrings, type PlanBrochureStrings } from '@/lib/i18n/planBrochure'

export type ShareCardLayout = 'default' | 'profile' | 'post' | 'review' | 'clip' | 'suggestion' | 'plan'

/** The copy printed on a card (already localised by the caller). */
export interface ShareCardCopy {
  caption: string
  tagline?: string
  invite?: string
  slogan?: string
  sloganSub?: string
  websiteLabel?: string
  features?: string[]
  website?: string
  /** Content cards: the media badge per layout, the scan line, the byline, "+n more". */
  badges?: Partial<Record<'review' | 'clip' | 'suggestion', string>>
  scanTitle?: string
  byline?: string
  morePlaces?: string
}

export interface ShareCardInput {
  artifact: ShareArtifact
  layout: ShareCardLayout
  /** Name on the TappyAI QR card: the profile's name, or the post's title. */
  displayName?: string
  copy?: ShareCardCopy
  /** An Explore post's public fields (review / clip layouts). */
  post?: SharePostCard
  /** Plan labels in the viewer's language (plan layout). */
  planStrings?: PlanBrochureStrings
}

export interface ShareCardRenderers {
  branded: (o: BrandedQrOptions) => Promise<Blob | null>
  artifact: (a: ShareArtifact) => Promise<Blob | null>
  post: (card: SharePostCard, url: string, copy: ContentCardCopy) => Promise<Blob | null>
  suggestion: (subject: string, places: SharedPlace[], url: string, copy: ContentCardCopy) => Promise<Blob | null>
  plan: (s: PlanShareSnapshot, url: string, str: PlanBrochureStrings) => Promise<Blob | null>
}

const DEFAULT_RENDERERS: ShareCardRenderers = {
  branded: renderBrandedQrCard,
  artifact: renderArtifactImage,
  post: renderPostCard,
  suggestion: renderSuggestionCard,
  plan: renderPlanCard,
}

export type ShareSheetVariant = 'default' | 'profile' | 'post' | 'suggestion' | 'plan'

/**
 * The layouts a share offers, in order — the first is the default selection. A layout is offered
 * only when its data is present (a plan card needs the snapshot, a suggestion card needs places).
 */
export function shareCardLayouts(input: { variant: ShareSheetVariant; artifact: ShareArtifact; post?: SharePostCard }): ShareCardLayout[] {
  const { variant, artifact, post } = input
  if (variant === 'profile') return ['profile']
  if (variant === 'post') return post ? [post.kind, 'post'] : ['post']
  if (artifact.kind === 'plan' && artifact.plan && artifact.plan.days.length > 0) return ['plan']
  // The suggestion card belongs to the approved sheet; the legacy sheet keeps its legacy card.
  if (variant === 'suggestion' && artifact.kind === 'places' && artifact.places.length > 0) return ['suggestion']
  return ['default']
}

/** The file name says which layout produced it, so a saved file is recognisable. */
export function shareCardFileName(layout: ShareCardLayout, date = new Date()): string {
  return `tappyai-${layout === 'default' ? 'card' : layout}-${date.toISOString().slice(0, 10)}.png`
}

function contentCopy(c: ShareCardCopy, badge: string): ContentCardCopy {
  return {
    tagline: c.tagline,
    badge,
    scanTitle: c.scanTitle ?? c.caption,
    slogan: c.slogan,
    sloganSub: c.sloganSub,
    website: c.website ?? '',
    byline: c.byline,
    morePlaces: c.morePlaces,
  }
}

export async function renderShareCard(input: ShareCardInput, renderers: ShareCardRenderers = DEFAULT_RENDERERS): Promise<File | null> {
  let blob: Blob | null = null
  const c = input.copy ?? { caption: '' }
  const a = input.artifact
  try {
    switch (input.layout) {
      case 'profile':
      case 'post':
        blob = await renderers.branded({
          text: a.url,
          displayName: input.displayName ?? '',
          caption: c.caption,
          tagline: c.tagline,
          invite: c.invite,
          slogan: c.slogan,
          sloganSub: c.sloganSub,
          websiteLabel: c.websiteLabel,
          features: c.features,
          website: c.website,
        })
        break
      case 'review':
      case 'clip':
        blob = input.post ? await renderers.post(input.post, a.url, contentCopy(c, c.badges?.[input.layout] ?? '')) : null
        break
      case 'suggestion':
        blob = await renderers.suggestion(a.subject, a.places, a.url, contentCopy(c, c.badges?.suggestion ?? ''))
        break
      case 'plan':
        blob = a.plan ? await renderers.plan(a.plan, a.url, input.planStrings ?? planBrochureStrings('vi')) : null
        break
      default:
        blob = await renderers.artifact(a)
    }
  } catch {
    blob = null
  }
  if (!blob) return null
  return new File([blob], shareCardFileName(input.layout), { type: 'image/png' })
}
