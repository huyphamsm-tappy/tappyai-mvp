// The title a REVIEW is shared under — never the composer's "no place" sentinel.
//
// A clip posted without a venue is stored with `place_name` = "Chia sẻ" (the
// composer's share-only sentinel). The feed already hides the 📍 chip for those
// (`isShareOnlyName`), but both share entry points — the detail page's
// `ReviewShareButton` and the feed's `ShareModal` — handed `review.place_name`
// straight to the share menu as the title, so the preview and every outgoing
// message read "Chia sẻ": an internal marker shown to the recipient as if it
// were the subject.
//
// The rule, in order: the real place name → the clip's own caption → the brand.
// Nothing is invented: a clip with neither a place nor a caption goes out under
// TappyAI's name, not under a made-up venue.
//
// Pure and dependency-light on purpose so both client entry points and any
// server code can share it; `feedShared.tsx` imports the sentinel set from
// here rather than keeping its own copy.

import { BRAND } from './openGraph'

/** The composer's share-only sentinel(s) — a stored placeholder, never a place. */
export const SHARE_ONLY_NAMES: ReadonlySet<string> = new Set(['Chia sẻ', 'Chia se'])

/** True for an absent place AND for the sentinel: nothing a person would call a venue. */
export const isShareOnlyPlaceName = (n?: string | null): boolean => !n?.trim() || SHARE_ONLY_NAMES.has(n.trim())

/** A caption is a caption, not a headline: one line, bounded, with an ellipsis when cut. */
export const REVIEW_SHARE_TITLE_MAX = 80

export function reviewShareTitle(review: { place_name?: string | null; body?: string | null }): string {
  const place = (review.place_name ?? '').trim()
  if (place && !SHARE_ONLY_NAMES.has(place)) return place

  const line = (review.body ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? ''
  if (line) return line.length > REVIEW_SHARE_TITLE_MAX ? `${line.slice(0, REVIEW_SHARE_TITLE_MAX - 1).trimEnd()}…` : line

  return BRAND.name
}
