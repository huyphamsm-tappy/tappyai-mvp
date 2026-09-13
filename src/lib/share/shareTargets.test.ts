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
  WEB_ONLY_SHARE_TARGETS,
  WEB_SHARE_TARGETS,
  TEXT_HANDOFF_MAX,
  buildShareUrl,
  buildTextShareUrl,
  canOpenMessenger,
  isShareableUrl,
  shareTarget,
  type ShareTargetId,
} from './shareTargets'

const SITE = 'https://www.tappyai.com'
const env = { NEXT_PUBLIC_SITE_URL: SITE } as unknown as NodeJS.ProcessEnv
const REVIEW = `${SITE}/reviews/af7dfbea-b41f-41e3-853c-9a5403ca1f3d`

// ------------------------------------------------------------ the target set
describe('SHARE_TARGETS', () => {
  // The eight approved product targets (Facebook/Messenger, Zalo, Viber, LINE,
  // Email, Tappy Inbox, Save, Copy) plus the pre-existing TikTok (Reviews) and
  // the system sheet as the optional last resort.
  it('offers exactly the product-required targets, in order', () => {
    expect(SHARE_TARGETS.map((t) => t.id)).toEqual([
      'facebook',
      'zalo',
      'viber',
      'line',
      'tiktok',
      'email',
      'inbox',
      'save',
      'copy',
      'native',
    ])
  })

  it('classifies each target by what it actually does', () => {
    const kinds = Object.fromEntries(SHARE_TARGETS.map((t) => [t.id, t.kind]))
    expect(kinds).toEqual({
      facebook: 'url-handoff',
      zalo: 'url-handoff',
      viber: 'text-handoff',
      line: 'text-handoff',
      tiktok: 'clipboard',
      email: 'text-handoff',
      inbox: 'inbox',
      save: 'save',
      copy: 'clipboard',
      native: 'native',
    })
  })

  it.each(['facebook', 'zalo', 'viber', 'line', 'tiktok', 'email', 'inbox', 'save', 'copy', 'native'] as ShareTargetId[])(
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

// ------------------------------------------------ the web menu's destinations
describe('WEB_SHARE_TARGETS — the web menu adds Messenger, WhatsApp and Telegram', () => {
  it('keeps the cross-platform contract untouched and adds exactly three web-only destinations', () => {
    expect(WEB_ONLY_SHARE_TARGETS.map((t) => t.id)).toEqual(['messenger', 'whatsapp', 'telegram'])
    for (const t of WEB_ONLY_SHARE_TARGETS) expect(SHARE_TARGETS.find((x) => x.id === t.id)).toBeUndefined()
  })

  it('lists the messaging apps first, then the actions, with nothing missing and nothing twice', () => {
    expect(WEB_SHARE_TARGETS.map((t) => t.id)).toEqual([
      'facebook', 'messenger', 'zalo', 'whatsapp', 'telegram', 'viber', 'line', 'tiktok', 'email',
      'inbox', 'save', 'copy', 'native',
    ])
    expect(new Set(WEB_SHARE_TARGETS.map((t) => t.id)).size).toBe(SHARE_TARGETS.length + WEB_ONLY_SHARE_TARGETS.length)
  })

  it('classifies the three by what they really do', () => {
    expect(shareTarget('messenger').kind).toBe('url-handoff')
    expect(shareTarget('whatsapp').kind).toBe('text-handoff')
    expect(shareTarget('telegram').kind).toBe('text-handoff')
    for (const id of ['messenger', 'whatsapp', 'telegram'] as ShareTargetId[]) expect(shareTarget(id).labelKey).toBe(`share.${id}`)
  })

  // Messenger has only an app scheme. Offering it where nothing can open it would be a dead tile.
  it('Messenger is offered on phones and tablets, not on a desktop browser', () => {
    expect(canOpenMessenger('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(canOpenMessenger('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(true)
    expect(canOpenMessenger('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
    expect(canOpenMessenger('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe(false)
    expect(canOpenMessenger('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15')).toBe(false)
    expect(canOpenMessenger(undefined)).toBe(false)
  })
})

// ------------------------------------------------------- URL construction
describe('buildShareUrl', () => {
  it('sends Messenger its own share deep link with the canonical URL, encoded', () => {
    expect(buildShareUrl('messenger', REVIEW)).toBe(`fb-messenger://share?link=${encodeURIComponent(REVIEW)}`)
    expect(buildShareUrl('messenger', `${SITE}/reviews/x?token=secret123`, env)).toBeNull()
  })

  it.each(['whatsapp', 'telegram'] as ShareTargetId[])('returns null for %s — it carries text, not a bare url', (id) => {
    expect(buildShareUrl(id, REVIEW)).toBeNull()
  })

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

  it.each(['viber', 'line', 'email', 'inbox', 'save', 'copy', 'native'] as ShareTargetId[])(
    'returns null for %s — not a URL handoff',
    (id) => {
      expect(buildShareUrl(id, REVIEW)).toBeNull()
    }
  )

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

// ------------------------------------------------------- text handoffs
describe('buildTextShareUrl — the brochure travels INSIDE the URL', () => {
  const subject = 'TappyAI gợi ý: bún bò'
  const text = 'TappyAI gợi ý: bún bò\n\n1. Quán A\n   📍 12 Lê Lợi\n   Bản đồ: https://maps.google.com/?cid=1\n\nGợi ý bởi TappyAI · www.tappyai.com'

  it('email: mailto with subject and the full body, round-trippable', () => {
    const out = buildTextShareUrl('email', subject, text)!
    expect(out.startsWith('mailto:?subject=')).toBe(true)
    const u = new URL(out)
    expect(u.searchParams.get('subject')).toBe(subject)
    expect(u.searchParams.get('body')).toBe(text)
  })

  it('viber: viber://forward?text= with the body, round-trippable', () => {
    const out = buildTextShareUrl('viber', subject, text)!
    expect(out.startsWith('viber://forward?text=')).toBe(true)
    expect(decodeURIComponent(out.slice('viber://forward?text='.length))).toBe(text)
  })

  it('line: https://line.me/R/share?text= with the body, round-trippable', () => {
    const out = buildTextShareUrl('line', subject, text)!
    expect(out.startsWith('https://line.me/R/share?text=')).toBe(true)
    expect(new URL(out).searchParams.get('text')).toBe(text)
  })

  // No fabricated endpoints: Zalo/Messenger/TikTok have no text handoff, and
  // the non-handoff targets never produce a URL.
  it.each(['facebook', 'zalo', 'tiktok', 'inbox', 'save', 'copy', 'native'] as ShareTargetId[])(
    'returns null for %s',
    (id) => {
      expect(buildTextShareUrl(id, subject, text)).toBeNull()
    }
  )

  it('whatsapp: wa.me click-to-chat with the body as the message, round-trippable', () => {
    const body = 'Bún bò Cô Ba — 123 Lê Lợi\nhttps://www.tappyai.com'
    const out = buildTextShareUrl('whatsapp', 'subj', body)!
    expect(out.startsWith('https://wa.me/?text=')).toBe(true)
    expect(new URL(out).searchParams.get('text')).toBe(body)
  })

  it('telegram: t.me/share/url with the link AND the body when they differ', () => {
    const out = buildTextShareUrl('telegram', 'subj', 'Bún bò Cô Ba — 123 Lê Lợi', 'https://www.tappyai.com')!
    const u = new URL(out)
    expect(u.origin + u.pathname).toBe('https://t.me/share/url')
    expect(u.searchParams.get('url')).toBe('https://www.tappyai.com')
    expect(u.searchParams.get('text')).toBe('Bún bò Cô Ba — 123 Lê Lợi')
  })

  it('telegram: when the text IS the link (a review), the link goes once, as the url', () => {
    const out = buildTextShareUrl('telegram', 'Review', REVIEW, REVIEW)!
    const u = new URL(out)
    expect(u.searchParams.get('url')).toBe(REVIEW)
    expect(u.searchParams.has('text')).toBe(false)
    // …and with no url given, the text is still the link.
    expect(new URL(buildTextShareUrl('telegram', 'Review', REVIEW)!).searchParams.get('url')).toBe(REVIEW)
  })

  it('returns null for an empty body', () => {
    expect(buildTextShareUrl('email', subject, '   ')).toBeNull()
  })

  it('bounds the body at TEXT_HANDOFF_MAX characters', () => {
    const long = 'a'.repeat(TEXT_HANDOFF_MAX + 500)
    const out = buildTextShareUrl('line', subject, long)!
    expect(new URL(out).searchParams.get('text')!.length).toBe(TEXT_HANDOFF_MAX)
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
