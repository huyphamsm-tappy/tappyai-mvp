// THE ONE card-file generator — for "Save to device" AND for "share as a file" (TikTok, the OS
// sheet). Both used to diverge: the approved profile sheet ("Chia sẻ với mọi người") showed the
// TappyAI card, but Save wrote the generic dark recommendation card (`renderArtifactImage`), so the
// downloaded file never matched the layout the user was looking at (owner UAT 2026-09-28).
//
// The layout is the sheet's own `variant`, so what the user SEES decides what the file IS:
//
//  - `profile` / `post`  the approved TappyAI card (`renderBrandedQrCard`, the same design the QR
//                        page downloads): lockup, name/title, caption, a scannable code of the
//                        link, banner, website and feature strip.
//  - `default`           the recommendation / plan brochure card (`renderArtifactImage`).
//
// No new visual design is introduced here — both renderers already exist and are approved.
// Null on any failure: the caller falls back (text file for Save, caption copy for TikTok).

import type { ShareArtifact } from './shareArtifact'
import { renderArtifactImage } from './renderCardImage'
import { renderBrandedQrCard, type BrandedQrOptions } from '@/lib/qr/brandedCard'

export type ShareCardLayout = 'default' | 'profile' | 'post'

/** The copy printed on the TappyAI card (already localised by the caller). */
export interface ShareCardCopy {
  caption: string
  tagline?: string
  invite?: string
  slogan?: string
  sloganSub?: string
  websiteLabel?: string
  features?: string[]
  website?: string
}

export interface ShareCardInput {
  artifact: ShareArtifact
  layout: ShareCardLayout
  /** Name on the TappyAI card: the profile's name, or the post's title. */
  displayName?: string
  copy?: ShareCardCopy
}

export interface ShareCardRenderers {
  branded: (o: BrandedQrOptions) => Promise<Blob | null>
  artifact: (a: ShareArtifact) => Promise<Blob | null>
}

const DEFAULT_RENDERERS: ShareCardRenderers = { branded: renderBrandedQrCard, artifact: renderArtifactImage }

/** The file name says which layout produced it, so a saved file is recognisable. */
export function shareCardFileName(layout: ShareCardLayout, date = new Date()): string {
  return `tappyai-${layout === 'default' ? 'card' : layout}-${date.toISOString().slice(0, 10)}.png`
}

export async function renderShareCard(input: ShareCardInput, renderers: ShareCardRenderers = DEFAULT_RENDERERS): Promise<File | null> {
  let blob: Blob | null = null
  try {
    if (input.layout === 'profile' || input.layout === 'post') {
      const c = input.copy ?? { caption: '' }
      blob = await renderers.branded({
        text: input.artifact.url,
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
    } else {
      blob = await renderers.artifact(input.artifact)
    }
  } catch {
    blob = null
  }
  if (!blob) return null
  return new File([blob], shareCardFileName(input.layout), { type: 'image/png' })
}
