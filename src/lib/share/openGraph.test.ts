// Social previews — the metadata half of sharing.
//
// Two live defects this pins:
//
//  1. The root layout declared og:type/title/description and nothing else. No
//     image, no url, no site_name, no twitter card — so a pasted TappyAI link
//     rendered as bare text in Zalo/Facebook/Messenger.
//
//  2. /reviews/[id] set og:image from `review.photos[0]`. Those are Vercel Blob
//     URLs, the store is suspended, and they 403 — and when a review has no
//     photo the array was simply empty. Either way the preview showed a broken
//     or missing image.
//
// The rule both defects share: an OG image must be a public, absolute HTTPS URL
// that a crawler can fetch without credentials, and there must always be a
// branded fallback rather than nothing.
//
// Crawlers do not run JavaScript, so everything here has to be decidable on the
// server from data alone.

import { describe, it, expect } from 'vitest'
import {
  BRAND,
  absoluteUrl,
  brandedOgImage,
  safeOgImageUrl,
  buildSiteMetadata,
  buildPrivateMetadata,
} from './openGraph'

const SITE = 'https://www.tappyai.com'
const env = { NEXT_PUBLIC_SITE_URL: SITE } as unknown as NodeJS.ProcessEnv

const BLOB = 'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/reviews/u1/1.png'
const GCS = 'https://storage.googleapis.com/tappyai-media-prod/reviews/u1/abc.png'

// ------------------------------------------------------------------- brand
describe('brand constants', () => {
  it('carries both taglines verbatim', () => {
    expect(BRAND.name).toBe('TappyAI')
    expect(BRAND.tagline.vi).toBe('Chạm đến mọi dịch vụ – AI Agent cá nhân hóa')
    expect(BRAND.tagline.en).toBe('Touch Every Service – Your Personal AI Agent')
  })
})

// ---------------------------------------------------------- canonical URLs
describe('absoluteUrl', () => {
  it('builds an absolute https URL on the canonical host', () => {
    expect(absoluteUrl('/reviews/abc', env)).toBe(`${SITE}/reviews/abc`)
  })

  it('tolerates a missing leading slash', () => {
    expect(absoluteUrl('reviews/abc', env)).toBe(`${SITE}/reviews/abc`)
  })

  it('passes an already-absolute URL through', () => {
    expect(absoluteUrl(GCS, env)).toBe(GCS)
  })

  // A crawler cannot follow a relative URL, and http would be downgraded.
  it.each(['/', '/reviews/x', 'chat'])('is always absolute https for %s', (path) => {
    expect(absoluteUrl(path, env)).toMatch(/^https:\/\//)
  })

  it('never leaks a token or query secret from the path', () => {
    const out = absoluteUrl('/reviews/abc?token=secret123', env)
    expect(out).not.toContain('secret123')
  })
})

// ------------------------------------------------------------- OG image
describe('brandedOgImage — the always-available fallback', () => {
  const img = brandedOgImage(env)

  it('is absolute https', () => {
    expect(img.url).toMatch(/^https:\/\//)
  })

  it('is 1200x630', () => {
    expect(img.width).toBe(1200)
    expect(img.height).toBe(630)
  })

  it.each([
    ['blob:', 'blob:'],
    ['data:', 'data:'],
    ['vercel blob host', 'blob.vercel-storage.com'],
  ])('never uses %s', (_label, forbidden) => {
    expect(img.url).not.toContain(forbidden)
  })

  it('carries no credential or signature', () => {
    expect(img.url).not.toMatch(/token=|signature=|X-Goog-|Authorization/i)
  })
})

describe('safeOgImageUrl — public content images, with a fallback', () => {
  it('keeps a public GCS image', () => {
    expect(safeOgImageUrl(GCS, env)).toBe(GCS)
  })

  // The reason the review preview is broken today.
  it('rejects a suspended Vercel Blob image and falls back to the brand', () => {
    expect(safeOgImageUrl(BLOB, env)).toBe(brandedOgImage(env).url)
  })

  it.each([[null], [undefined], ['']])('falls back to the brand for %s', (value) => {
    expect(safeOgImageUrl(value as unknown as string, env)).toBe(brandedOgImage(env).url)
  })

  it.each(['blob:https://x/y', 'data:image/png;base64,AAA', '/relative.png', 'not a url'])(
    'falls back for a non-public candidate %s',
    (value) => {
      expect(safeOgImageUrl(value, env)).toBe(brandedOgImage(env).url)
    }
  )

  it('rejects a plain http image', () => {
    expect(safeOgImageUrl('http://example.com/a.png', env)).toBe(brandedOgImage(env).url)
  })
})

// --------------------------------------------------------- site metadata
describe('buildSiteMetadata — every tag a crawler needs', () => {
  const vi = buildSiteMetadata('vi', env)
  const en = buildSiteMetadata('en', env)

  it.each([
    ['title', (m: typeof vi) => m.openGraph?.title],
    ['description', (m: typeof vi) => m.openGraph?.description],
    ['url', (m: typeof vi) => m.openGraph?.url],
    ['siteName', (m: typeof vi) => m.openGraph?.siteName],
    ['type', (m: typeof vi) => (m.openGraph as { type?: string } | undefined)?.type],
    ['images', (m: typeof vi) => m.openGraph?.images],
  ])('declares og:%s', (_label, pick) => {
    expect(pick(vi)).toBeTruthy()
  })

  it('declares the twitter card and image', () => {
    expect((vi.twitter as { card?: string } | undefined)?.card).toBe('summary_large_image')
    expect(vi.twitter?.images).toBeTruthy()
  })

  it('sets og:site_name to the brand', () => {
    expect(vi.openGraph?.siteName).toBe('TappyAI')
  })

  it('uses the Vietnamese tagline for vi and the English one for en', () => {
    expect(vi.openGraph?.description).toContain('Chạm đến mọi dịch vụ')
    expect(en.openGraph?.description).toContain('Touch Every Service')
  })

  it('uses an absolute https og:url', () => {
    expect(String(vi.openGraph?.url)).toMatch(/^https:\/\//)
  })
})

// ------------------------------------------------- private content safety
describe('buildPrivateMetadata — a private page reveals nothing', () => {
  const secret = 'Tôi bị đau dạ dày và muốn tìm bác sĩ ở Quận 1'
  const meta = buildPrivateMetadata('vi', env)

  it('never contains the conversation text', () => {
    expect(JSON.stringify(meta)).not.toContain(secret)
  })

  it('uses only the generic brand title and tagline', () => {
    expect(meta.openGraph?.title).toBe(`${BRAND.name} – Trợ lý AI thuần Việt`)
    expect(meta.openGraph?.description).toBe(BRAND.tagline.vi)
  })

  it('uses the branded image, never user media', () => {
    expect(JSON.stringify(meta.openGraph?.images)).toBe(
      JSON.stringify([brandedOgImage(env)])
    )
  })

  it('carries no internal identifier', () => {
    const text = JSON.stringify(buildPrivateMetadata('vi', env))
    expect(text).not.toMatch(/conversation|user_id|message|prompt/i)
  })

  it('has an English variant', () => {
    const en = buildPrivateMetadata('en', env)
    expect(en.openGraph?.description).toBe(BRAND.tagline.en)
  })

  // The invariant, stated directly.
  it.each([
    'Tôi muốn đi Phan Thiết',
    'my bank password is hunter2',
    '<script>alert(1)</script>',
  ])('no caller-supplied text can reach it: %s', (text) => {
    expect(JSON.stringify(buildPrivateMetadata('vi', env))).not.toContain(text)
  })
})
