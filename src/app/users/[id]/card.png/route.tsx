// The social preview for a shared profile (/users/<id>): the profile's own share card — the TappyAI QR card
// composition (lockup, name, the SAME code the profile QR page shows, website) at 1200x630, so Zalo / Facebook /
// Messenger show the card instead of the generic banner (UAT BUG 13).
//
// Served from a `.png` path on purpose: the middleware matcher skips it (no session refresh on a crawler hit),
// and the metadata links it with `?v=<profile updated_at>` so a platform's per-URL cache cannot pin an old card.
//
// 🚨 PRIVACY: reads ONLY `full_name`, `avatar_url` (public `profiles` columns, as `GET /api/users/[id]` serves
// them to anyone). The QR carries the public profile URL and nothing else. An unknown / malformed id gets a
// neutral brand card (still a real 1200x630 PNG — a crawler must never see a broken image), and a short cache.
//
// Edge runtime, as every other ImageResponse route here (see plan/[shareId]/opengraph-image.tsx).

import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, absoluteUrl, brandedOgImage, safeOgImageUrl } from '@/lib/share/openGraph'
import { isProfileId } from '@/lib/share/profileOg'
import { encodeQR, qrToSvg } from '@/lib/qr/qrcode'
import { TAPPY_WORDMARK_BLUE } from '@/components/brand/TappyLockup'
import { OG_FONT_FAMILY, ogFont } from '@/app/plan/[shareId]/ogFont'
import { ogMark } from '@/app/plan/[shareId]/ogMark'

export const runtime = 'edge'

const INK = '#0B1B3F'
const MUTED = '#4F5B76'

/** The name column is 600px wide: a long upper-case Vietnamese name at 72px wraps and pushes the host line out of the card. */
function nameFontSize(len: number): number {
  if (len <= 10) return 72
  if (len <= 16) return 56
  if (len <= 28) return 44
  return 36
}

async function readName(id: string): Promise<{ name: string; avatar: string | null } | null> {
  if (!isProfileId(id)) return null
  try {
    const { data } = await createClient().from('profiles').select('full_name, avatar_url').eq('id', id).maybeSingle()
    const name = data?.full_name ? String(data.full_name).trim().slice(0, 60) : ''
    if (!name) return null
    const safe = safeOgImageUrl(data?.avatar_url ?? undefined)
    return { name, avatar: safe === brandedOgImage().url ? null : safe }
  } catch {
    return null
  }
}

function qrDataUrl(text: string): string {
  const svg = qrToSvg(encodeQR(text), { size: 420, margin: 4, dark: '#000000', light: '#FFFFFF' })
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [p, font, mark] = await Promise.all([readName(params.id), ogFont(), ogMark()])
  const family = font ? OG_FONT_FAMILY : 'sans-serif'
  const qr = p ? qrDataUrl(absoluteUrl(`/users/${params.id}`)) : null
  const web = (() => { try { return new URL(absoluteUrl('/')).host } catch { return '' } })()

  const card = (
    <div style={{ width: 1200, height: 630, display: 'flex', position: 'relative', fontFamily: family, color: INK, background: 'linear-gradient(135deg, #FFFFFF 0%, #F2F7FF 55%, #EAF3FF 100%)' }}>
      <div style={{ position: 'absolute', left: 64, top: 52, display: 'flex', alignItems: 'center' }}>
        {mark && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori markup, not the DOM
          <img src={mark} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover' }} />
        )}
        <div style={{ display: 'flex', marginLeft: mark ? 18 : 0, fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: INK }}>Tappy</span>
          <span style={{ color: TAPPY_WORDMARK_BLUE }}>AI</span>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 64, top: 190, width: qr ? 600 : 1072, display: 'flex', flexDirection: 'column' }}>
        {p?.avatar && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori markup, not the DOM
          <img src={p.avatar} alt="" width={120} height={120} style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover', marginBottom: 24, border: '4px solid #FFFFFF' }} />
        )}
        <div style={{ display: 'flex', fontSize: nameFontSize(p ? p.name.length : 0), lineHeight: 1.1, fontWeight: 800 }}>{p ? p.name : 'TappyAI'}</div>
        <div style={{ display: 'flex', marginTop: 20, fontSize: 30, color: MUTED }}>
          {p ? 'Scan to connect on TappyAI' : 'One Agent. One Conversation. Everyday Life.'}
        </div>
        {web && <div style={{ display: 'flex', marginTop: 28, fontSize: 30, fontWeight: 700, color: TAPPY_WORDMARK_BLUE }}>{web}</div>}
      </div>

      {qr && (
        <div style={{ position: 'absolute', right: 64, top: 105, width: 420, height: 420, display: 'flex', padding: 0, background: '#FFFFFF', borderRadius: 28, boxShadow: '0 12px 40px rgba(30,107,255,0.18)', border: '2px solid #D8E4FA' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori markup, not the DOM */}
          <img src={qr} alt="" width={416} height={416} style={{ width: 416, height: 416, borderRadius: 26 }} />
        </div>
      )}
    </div>
  )

  return new ImageResponse(card, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    ...(font ? { fonts: [{ name: OG_FONT_FAMILY, data: font, weight: 700 as const, style: 'normal' as const }] } : {}),
    headers: {
      'Content-Type': 'image/png',
      // Found: the URL is versioned by `updated_at`, so a day at the edge is safe. Unknown id: stay short.
      'Cache-Control': p ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' : 'public, max-age=300, s-maxage=300',
    },
  })
}
