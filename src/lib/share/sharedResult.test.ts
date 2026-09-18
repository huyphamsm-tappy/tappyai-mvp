import { describe, it, expect } from 'vitest'
import { findForbiddenKey, isPublicActionUrl, validateSharedResultPayload, type SharedResultPayload } from './sharedResult'
import { isValidSlug, newSlug, SLUG_LENGTH } from './slug'
import { buildShareContextBlock, followUpIdentity } from './followUpGuard'
import { parseShareRequest, pickShareSource } from './shareRequest'
import { buildSharedResultMetadata, sharedResultJsonLd, sharedResultOgImageUrl, summarize } from './sharedResultMetadata'

const base: SharedResultPayload = {
  v: 1, title: 'Quán cà phê yên tĩnh ở Đà Lạt', query: 'quán cà phê yên tĩnh ở Đà Lạt', domain: 'food', locale: 'vi',
  body: 'Ba quán đáng thử: **A**, B và C.', buttons: [{ label: 'Maps', type: 'maps', url: 'https://maps.app.goo.gl/x', primary: true }],
  images: ['https://cdn.example.com/a.jpg'], suggestedQuestions: ['Có wifi không?'], createdAt: '2026-09-13T00:00:00.000Z',
}

describe('validateSharedResultPayload', () => {
  it('accepts a clean payload', () => expect(validateSharedResultPayload(base)).toBeNull())
  it('rejects wrong version, empty title, bad domain/locale', () => {
    expect(validateSharedResultPayload({ ...base, v: 2 })).toBe('bad_version')
    expect(validateSharedResultPayload({ ...base, title: '  ' })).toBe('bad_title')
    expect(validateSharedResultPayload({ ...base, domain: 'crypto' })).toBe('bad_domain')
    expect(validateSharedResultPayload({ ...base, locale: 'fr' })).toBe('bad_locale')
  })
  it('rejects a residual marker in the body — the sanitizer did not run', () => {
    expect(validateSharedResultPayload({ ...base, body: 'x [TAPPY_PLAN]{}[/TAPPY_PLAN]' })).toBe('marker_in_body')
    expect(validateSharedResultPayload({ ...base, body: 'x [CTA_BUTTONS]' })).toBe('marker_in_body')
  })
  it('rejects private links and non-https buttons', () => {
    expect(validateSharedResultPayload({ ...base, buttons: [{ label: 'x', type: 'website', url: 'https://www.tappyai.com/chat/abc', primary: false }] })).toBe('bad_button')
    expect(validateSharedResultPayload({ ...base, buttons: [{ label: 'x', type: 'website', url: 'http://x.example', primary: false }] })).toBe('bad_button')
    expect(validateSharedResultPayload({ ...base, buttons: [{ label: 'x', type: 'zalo', url: 'https://zalo.me', primary: false }] })).toBe('bad_button')
  })
  it('rejects forbidden keys at any depth — memory, ids, tokens', () => {
    expect(validateSharedResultPayload({ ...base, plan: { title: 'x', type: 'trip', days: [], user_id: 'u' } })).toBe('forbidden_key:plan.user_id')
    expect(validateSharedResultPayload({ ...base, shopping: { v: 1, entities: [{ key: 'k', config: '', matchesRequest: 'chua_ro', recommended: false, priceLow: null, priceHigh: null, image: null, offers: [{ seller: null, url: null, price: null, currency: null, condition: null, access_token: 'x' }] }], recommendation: null } })).toMatch(/^forbidden_key:shopping/)
    expect(findForbiddenKey({ a: { b: [{ Memory: 1 }] } })).toBe('a.b[0].Memory')
    expect(findForbiddenKey({ evidence: 'a reason' })).toBeNull()
  })
  it('rejects oversized payloads', () => {
    expect(validateSharedResultPayload({ ...base, body: 'x'.repeat(12_001) })).toBe('bad_body')
    expect(validateSharedResultPayload({ ...base, images: ['https://a/1', 'https://a/2', 'https://a/3', 'https://a/4'] })).toBe('bad_images')
  })
  it('isPublicActionUrl allows tel: and https only', () => {
    expect(isPublicActionUrl('tel:0283829372')).toBe(true)
    expect(isPublicActionUrl('javascript:alert(1)')).toBe(false)
    expect(isPublicActionUrl('https://www.tappyai.com/food')).toBe(true)
    expect(isPublicActionUrl('https://www.tappyai.com/api/x')).toBe(false)
  })
})

describe('slug', () => {
  it('mints unique, URL-safe, fixed-length slugs', () => {
    const s = new Set(Array.from({ length: 200 }, () => newSlug()))
    expect(s.size).toBe(200)
    for (const v of s) { expect(v).toHaveLength(SLUG_LENGTH); expect(isValidSlug(v)).toBe(true) }
  })
  it('rejects anything that is not exactly a slug', () => {
    for (const bad of ['', 'abc', 'a'.repeat(11), '../../etc', 'AbCdEfGh1!', null, 42, 'AbCdEfGh12/']) expect(isValidSlug(bad)).toBe(false)
  })
})

describe('followUpGuard — pure parts', () => {
  it('identity precedence: uid → anon cookie → ip', () => {
    expect(followUpIdentity({ userId: 'u1', cookieHeader: 'tappy_aid=11111111-1111-4111-8111-111111111111', ip: '1.1.1.1' })).toBe('uid:u1')
    expect(followUpIdentity({ userId: null, cookieHeader: 'tappy_aid=11111111-1111-4111-8111-111111111111', ip: '1.1.1.1' })).toBe('anon:11111111-1111-4111-8111-111111111111')
    expect(followUpIdentity({ userId: null, cookieHeader: 'tappy_aid=junk', ip: '1.1.1.1' })).toBe('ip:1.1.1.1')
  })
  it('context block is public fields only, bounded, and empty for an unknown share', () => {
    expect(buildShareContextBlock(null)).toBe('')
    const block = buildShareContextBlock({ title: 'T'.repeat(500), query: 'Q'.repeat(500) })
    expect(block).toContain('T'.repeat(120))
    expect(block).not.toContain('T'.repeat(121))
    expect(block).not.toContain('Q'.repeat(201))
    expect(block).toMatch(/Khong co thong tin ca nhan/)
  })
})

describe('shareRequest', () => {
  it('parses a valid body and rejects everything else', () => {
    expect(parseShareRequest({ conversationId: '11111111-1111-4111-8111-111111111111', messageIndex: 3, title: 'x', locale: 'en' })).toEqual({ conversationId: '11111111-1111-4111-8111-111111111111', messageIndex: 3, title: 'x', locale: 'en' })
    expect(parseShareRequest({ conversationId: 'nope', messageIndex: 1 })).toBe('invalid_request')
    expect(parseShareRequest({ conversationId: '11111111-1111-4111-8111-111111111111', messageIndex: -1 })).toBe('invalid_request')
    expect(parseShareRequest({ conversationId: '11111111-1111-4111-8111-111111111111', messageIndex: 1.5 })).toBe('invalid_request')
    expect(parseShareRequest(null)).toBe('invalid_request')
  })
  it('picks the assistant answer and its preceding user question; refuses a user turn', () => {
    const msgs = [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' }]
    expect(pickShareSource(msgs, 3)).toEqual({ answer: 'a2', question: 'q2' })
    expect(pickShareSource(msgs, 2)).toBeNull()
    expect(pickShareSource(msgs, 9)).toBeNull()
  })
})

describe('sharedResultMetadata', () => {
  const row = { id: 'id1', slug: 'AbCdEfGh12', query: base.query, payload: base, domain: 'food' as const, locale: 'vi' as const, og_version: 3, view_count: 0, ask_count: 0, created_at: '2026-09-13T00:00:00.000Z' }
  const env = { NEXT_PUBLIC_SITE_URL: "https://www.tappyai.com" } as unknown as NodeJS.ProcessEnv
  it('canonical URL is bare; OG image is absolute and versioned', () => {
    const m = buildSharedResultMetadata(row, env)
    expect(m.alternates?.canonical).toBe('https://www.tappyai.com/r/AbCdEfGh12')
    expect(sharedResultOgImageUrl(row, env)).toBe('https://www.tappyai.com/r/AbCdEfGh12/og.png?v=3')
    expect((m.openGraph as { images: { url: string }[] }).images[0].url).toBe('https://www.tappyai.com/r/AbCdEfGh12/og.png?v=3')
    expect(m.robots).toEqual({ index: true, follow: true })
  })
  it('description and JSON-LD come from the frozen payload only', () => {
    expect(summarize('**Ba** quán đáng thử', 10)).toBe('Ba quán…')
    const ld = sharedResultJsonLd(row, env) as { mainEntity: { text: string; acceptedAnswer: { text: string } } }
    expect(ld.mainEntity.text).toBe(base.query)
    expect(ld.mainEntity.acceptedAnswer.text).toContain('Ba quán')
    expect(JSON.stringify(ld)).not.toMatch(/owner|user_id|anon/)
  })
})
