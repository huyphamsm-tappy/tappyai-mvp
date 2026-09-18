// The per-share 1200×630 social card: /r/<slug>/og.png?v=<og_version>
//
// Deterministic composition from the FROZEN payload — title, public question,
// up to three images, brand. No model, no image-generation API. Edge runtime
// for the same reason the branded card uses it (Windows prerender path bug in
// the Node build of @vercel/og), and because it keeps the card off the
// serverless cold path.
//
// CACHING. `?v=` is the cache key platforms honour; the response itself is
// immutable for a year, so Vercel's edge cache and the platforms' own caches
// mean a card is composed once per version, not once per share.
//
// IMAGES. Satori fetches <img> sources itself and fails the whole render if
// one is unreachable, so each candidate is fetched here first with a short
// timeout and inlined as a data URL. An image that does not answer in time
// is simply left off the card; the card never 500s because a merchant CDN
// was slow.

import { ImageResponse } from 'next/og'
import { BRAND, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '@/lib/share/openGraph'
import { isValidSlug } from '@/lib/share/slug'
import { getPublicSharedResult } from '@/lib/share/sharedResultStore'
import { summarize } from '@/lib/share/sharedResultMetadata'
import { CATEGORIES } from '@/lib/utils'

export const runtime = 'edge'

const IMAGE_TIMEOUT_MS = 2500
const MAX_IMAGE_BYTES = 1_500_000

async function inlineImage(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'image/*' } })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!/^image\/(jpeg|png|webp|gif)/i.test(type)) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:${type.split(';')[0]};base64,${btoa(bin)}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Domain chip: the product's own category labels, never a second copy of them.
const domainLabel = (d: string) => d === 'scam' ? 'Scam Shield' : (CATEGORIES.find((c) => c.id === d)?.label ?? BRAND.name)

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  if (!isValidSlug(params.slug)) return new Response('Not found', { status: 404 })
  const row = await getPublicSharedResult(params.slug)
  if (!row) return new Response('Not found', { status: 404 })

  const { payload } = row
  const images = (await Promise.all(payload.images.slice(0, 3).map(inlineImage))).filter((x): x is string => !!x)
  const title = payload.title.length > 90 ? `${payload.title.slice(0, 89)}…` : payload.title
  const summary = summarize(payload.body, images.length ? 110 : 170)
  const requestedVersion = new URL(req.url).searchParams.get('v')
  const immutable = requestedVersion === String(row.og_version)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0B1220 0%, #0D3B66 55%, #1ABDD4 100%)',
          color: '#FFFFFF', padding: 56, position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: -170, right: -130, width: 540, height: 540, borderRadius: 540, background: '#F5821F', opacity: 0.18, display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #1ABDD4 0%, #F5821F 100%)', fontSize: 38, fontWeight: 800, marginRight: 16 }}>T</div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{BRAND.name}</div>
          </div>
          <div style={{ display: 'flex', padding: '8px 20px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', fontSize: 24, fontWeight: 600 }}>
            {domainLabel(payload.domain)}
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, marginTop: 36, gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: images.length ? 46 : 54, fontWeight: 800, lineHeight: 1.15, maxWidth: images.length ? 640 : 1080 }}>{title}</div>
            {summary && (
              <div style={{ display: 'flex', marginTop: 22, fontSize: 26, color: '#DCEBFF', lineHeight: 1.4, maxWidth: images.length ? 640 : 1080 }}>{summary}</div>
            )}
          </div>
          {images.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 380 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[0]} alt="" style={{ width: 380, height: images.length > 1 ? 250 : 400, objectFit: 'cover', borderRadius: 24 }} />
              {images.length > 1 && (
                <div style={{ display: 'flex', gap: 14 }}>
                  {images.slice(1).map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" style={{ width: images.length > 2 ? 183 : 380, height: 136, objectFit: 'cover', borderRadius: 20 }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
          <div style={{ display: 'flex', fontSize: 24, color: '#BFD9F5' }}>{BRAND.tagline[payload.locale]}</div>
          <div style={{ display: 'flex', padding: '10px 24px', borderRadius: 999, background: '#F5821F', fontSize: 24, fontWeight: 700 }}>www.tappyai.com</div>
        </div>
      </div>
    ),
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      headers: {
        'Cache-Control': immutable
          ? 'public, max-age=31536000, s-maxage=31536000, immutable'
          : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
