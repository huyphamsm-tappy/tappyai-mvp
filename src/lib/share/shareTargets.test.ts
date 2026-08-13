// The share targets — one place that decides what URL leaves TappyAI.
//
// Before this, ~14 components each called navigator.share()/clipboard directly
// with their own URL string. On Windows desktop that meant the entire share
// experience was whatever the OS Share Sheet happened to offer — Nearby
// Sharing, Teams, Outlook — while Facebook, TikTok and Zalo were simply absent.
//
// The security half matters as much as the UX half: a share URL is the one
// thing a user deliberately hands to a third party, so it must never carry a
// token, an internal API path, a storage object URL, or private content.
//
// TikTok has no public web endpoint for handing off an arbitrary link. That is
// represented honestly here — `buildShareUrl` returns null and the caller falls
// back to copy — rather than inventing a URL that would 404 or, worse, a
// success message for something that never happened.

import { describe, it, expect } from 'vitest'
import {
  SHARE_TARGETS,
  buildShareUrl,
  isShareableUrl,
  shareTarget,
  type ShareTargetId,
} from './shareTargets'

const SITE = 'https://www.tappyai.com'
const env = { NEXT_PUBLIC_SITE_URL: SITE } as unknown as NodeJS.ProcessEnv
const REVIEW = `${SITE}/reviews/af7dfbea-b41f-41e3-853c-9a5403ca1f3d`

// ------------------------------------------------------------ the target set
describe('SHARE_TARGETS', () => {
  it('offers exactly the product-required targets, in order', () => {
    expect(SHARE_TARGETS.map((t) => t.id)).toEqual([
      'facebook',
      'tiktok',
      'zalo',
      'copy',
      'native',
    ])
  })

  it.each(['facebook', 'tiktok', 'zalo', 'copy', 'native'] as ShareTargetId[])(
    '%s has a localization key rather than a hardcoded label',
    (id) => {
      const target = shareTarget(id)
      expect(target.labelKey).toMatch(/^share\./)
    }
  )

  // TikTok is the social app, never the commerce partner.
  it('labels TikTok as TikTok, never TikTok Shop', () => {
    expect(shareTarget('tiktok').labelKey).toBe('share.tiktok')
    expect(JSON.stringify(SHARE_TARGETS)).not.toMatch(/tiktok shop/i)
  })
})

// ------------------------------------------------------- URL construction
describe('buildShareUrl', () => {
  it('sends Facebook the canonical URL, encoded', () => {
    const out = buildShareUrl('facebook', REVIEW)
    expect(out).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(REVIEW)}`)
  })

  it('sends Zalo the canonical URL, encoded', () => {
    const out = buildShareUrl('zalo', REVIEW)
    expect(out).toContain('zalo.me')
    expect(out).toContain(encodeURIComponent(REVIEW))
  })

  // The honest answer: TikTok has no public web share endpoint.
  it('returns null for TikTok rather than inventing an endpoint', () => {
    expect(buildShareUrl('tiktok', REVIEW)).toBeNull()
  })

  it.each(['copy', 'native'] as ShareTargetId[])('returns null for %s — not a URL handoff', (id) => {
    expect(buildShareUrl(id, REVIEW)).toBeNull()
  })

  it('produces https handoff URLs', () => {
    for (const id of ['facebook', 'zalo'] as ShareTargetId[]) {
      expect(buildShareUrl(id, REVIEW)).toMatch(/^https:\/\//)
    }
  })

  // A handoff for an unshareable URL must not be built at all.
  it.each([
    'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/videos/1.mp4',
    'https://storage.googleapis.com/tappyai-media-prod/videos/u/a.mp4',
    `${SITE}/api/reviews/feed`,
    `${SITE}/reviews/x?token=secret123`,
    'http://www.tappyai.com/reviews/x',
    'javascript:alert(1)',
    '',
  ])('refuses to build a handoff for %s', (bad) => {
    expect(buildShareUrl('facebook', bad, env)).toBeNull()
    expect(buildShareUrl('zalo', bad, env)).toBeNull()
  })
})

// --------------------------------------------------------- the URL guard
describe('isShareableUrl — what may leave TappyAI', () => {
  it('accepts a canonical public page', () => {
    expect(isShareableUrl(REVIEW, env)).toBe(true)
    expect(isShareableUrl(`${SITE}/`, env)).toBe(true)
  })

  // Each of these is a real leak class, not a hypothetical.
  it.each([
    ['vercel blob object', 'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/a.mp4'],
    ['gcs object', 'https://storage.googleapis.com/tappyai-media-prod/videos/u/a.mp4'],
    ['internal api path', `${SITE}/api/reviews/feed`],
    ['auth token in query', `${SITE}/reviews/x?token=abc`],
    ['access_token in query', `${SITE}/x?access_token=abc`],
    ['preview deployment', 'https://tappyai-mvp-abc123.vercel.app/reviews/x'],
    ['foreign host', 'https://evil.test/reviews/x'],
    ['plain http', 'http://www.tappyai.com/x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative path', '/reviews/x'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    expect(isShareableUrl(url, env)).toBe(false)
  })

  // The apex redirects to www, and both are ours.
  it('accepts the apex domain', () => {
    expect(isShareableUrl('https://tappyai.com/reviews/x', env)).toBe(true)
  })

  // A suffixed impostor must never pass.
  it('rejects a lookalike host', () => {
    expect(isShareableUrl('https://www.tappyai.com.evil.test/x', env)).toBe(false)
  })
})

// --------------------------------------------------- private chat boundary
describe('private chat is not shareable', () => {
  // Public review pages carry Part B metadata; a conversation carries none and
  // is behind auth. Offering it as a share URL would invite pasting a link that
  // only ever shows the recipient a login page.
  it('refuses a chat conversation URL', () => {
    expect(isShareableUrl(`${SITE}/chat/6164ff68-eae6-49da-abe7-525fbccf2827`, env)).toBe(false)
  })

  it('builds no handoff for a chat URL', () => {
    const chat = `${SITE}/chat/6164ff68-eae6-49da-abe7-525fbccf2827`
    expect(buildShareUrl('facebook', chat, env)).toBeNull()
    expect(buildShareUrl('zalo', chat, env)).toBeNull()
  })

  // The invariant, stated directly: no conversation text can ride along.
  it.each([
    'Tôi bị đau dạ dày',
    'my password is hunter2',
    'Ngày 1 - Đến & Khám phá',
  ])('no message text can appear in a handoff URL: %s', (secret) => {
    const url = `${SITE}/reviews/abc`
    const out = [buildShareUrl('facebook', url, env), buildShareUrl('zalo', url, env)].join(' ')
    expect(out).not.toContain(secret)
    expect(out).not.toContain(encodeURIComponent(secret))
  })
})
