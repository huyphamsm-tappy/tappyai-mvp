// The branded 1200×630 social preview image.
//
// Served from a VERSIONED path (`tappyai-v1.png`) rather than a query string.
// Social platforms cache OG images by URL and ignore cache headers for long
// stretches, so a per-request parameter would defeat their cache without
// guaranteeing a refresh. To publish a new design, add `tappyai-v2.png` and
// point OG_IMAGE_PATH at it — that is the documented refresh mechanism.
//
// Edge runtime, and composed from text and CSS only. The Node build of
// @vercel/og resolves its font files through `fileURLToPath`, which throws
// `TypeError: Invalid URL` on Windows paths during prerender; the edge build
// does not. Composing without an external asset also means the card renders
// without a network fetch or a disk read, so there is no failure mode where a
// missing file turns the preview into a 500.

import { ImageResponse } from 'next/og'
import { BRAND, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '@/lib/share/openGraph'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0B1220 0%, #0D3B66 55%, #1ABDD4 100%)',
          position: 'relative',
        }}
      >
        {/* One warm accent so the card does not read as a flat blue box. */}
        <div
          style={{
            position: 'absolute',
            top: -170,
            right: -130,
            width: 540,
            height: 540,
            borderRadius: 540,
            background: '#F5821F',
            opacity: 0.22,
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Brand glyph in the logo's teal→orange pairing. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 116,
              height: 116,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #1ABDD4 0%, #F5821F 100%)',
              color: '#FFFFFF',
              fontSize: 68,
              fontWeight: 800,
              marginRight: 30,
            }}
          >
            T
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 104,
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: -2,
            }}
          >
            {BRAND.name}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 38,
            color: '#E8F4FF',
            textAlign: 'center',
            maxWidth: 940,
            lineHeight: 1.35,
          }}
        >
          {BRAND.tagline.vi}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 42,
            paddingLeft: 28,
            paddingRight: 28,
            paddingTop: 12,
            paddingBottom: 12,
            borderRadius: 999,
            background: '#F5821F',
            color: '#FFFFFF',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          www.tappyai.com
        </div>
      </div>
    ),
    { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }
  )
}
