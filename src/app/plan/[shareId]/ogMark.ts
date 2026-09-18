import { absoluteUrl } from '@/lib/share/openGraph'
import { TAPPY_MARK_SRC } from '@/components/brand/TappyLockup'

// The brand mark on the social card.
//
// The card is drawn by Satori, which cannot read `/public` from disk on the edge
// runtime, so the shipped mark (`/branding/otter-logo.png` — the app icon every
// brand surface uses, see TappyLockup) is fetched once per instance from the
// canonical origin and handed to the card as a data URL. Same shape as ogFont:
// one fetch to a fixed, first-party address, cached for the life of the
// instance, and a null on failure so the card still renders — with the
// "Tappy"/"AI" wordmark alone — rather than failing the preview.

let cached: Promise<string | null> | null = null

async function load(): Promise<string | null> {
  try {
    const r = await fetch(absoluteUrl(TAPPY_MARK_SRC))
    if (!r.ok) return null
    const bytes = new Uint8Array(await r.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:image/png;base64,${btoa(bin)}`
  } catch {
    return null
  }
}

/** The mark as a data URL, or null to draw the wordmark alone. */
export function ogMark(): Promise<string | null> {
  if (!cached) cached = load()
  return cached
}
