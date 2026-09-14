import { ImageResponse } from 'next/og'
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '@/lib/share/openGraph'
import { planOgCard, planOgContent } from './planOgCard'
import { OG_FONT_FAMILY, ogFont } from './ogFont'
import { ogMark } from './ogMark'

// ── The social preview for /plan/<shareId> ──────────────────────────────────
//
// Composed at request time from the snapshot: the plan's own first photo as
// the backdrop (an allow-listed Google CDN host — `isPlanPhotoUrl` — so the
// renderer only ever fetches from those origins), the "Tappy Plan" eyebrow, the
// real title, the day/stop counts and the TappyAI mark. No plan → the branded
// dark card with the brand alone, still 1200×630, still a real image: a crawler
// must never get a broken preview for a withdrawn link.
//
// File-based metadata: Next wires this route into og:image for the page. Set
// in a Vietnamese-capable face (see ogFont.ts) — the bundled font is Latin-only.
//
// 🚨 EDGE RUNTIME, DELIBERATELY. @vercel/og's node build locates its assets with
// `path.join(import.meta.url, …)`, which on Windows becomes `.\file:\D:\…` and
// throws "Invalid URL" — the image 500s on every Windows dev machine while
// working on Linux. The edge build is bundled by Next and behaves the same
// everywhere. Everything on this route's import path is edge-safe: one RPC
// through the request's own client, fetch, Web Crypto.

export const runtime = 'edge'
export const alt = 'Tappy Plan'
export const size = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { shareId: string } }) {
  const [card, font, mark] = await Promise.all([planOgContent(params.shareId), ogFont(), ogMark()])
  return new ImageResponse(planOgCard(card, font ? OG_FONT_FAMILY : undefined, mark), {
    ...size,
    ...(font ? { fonts: [{ name: OG_FONT_FAMILY, data: font, weight: 700, style: 'normal' as const }] } : {}),
  })
}
