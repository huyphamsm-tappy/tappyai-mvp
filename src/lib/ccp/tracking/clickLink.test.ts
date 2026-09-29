import { describe, it, expect } from 'vitest'
import { buildClickUrl, linkActorMarker, newClickSub1, openClickUrl, openIdentity, sealIdentity, unwrapClickUrl, withSub1 } from './clickLink'

const env = { CCP_ATTRIBUTION_SECRET: 'x'.repeat(40), NEXT_PUBLIC_SITE_URL: 'https://uat.tappyai.com' } as unknown as NodeJS.ProcessEnv
const USER = '11111111-1111-4111-8111-111111111111'
const DEEP = 'https://go.isclix.com/deep_link/6277265300509373567/6654251588167732819?url=https%3A%2F%2Fwww.traveloka.com%2Fvi-VN%2Fflight&utm_source=tappyai&utm_medium=ccp'

describe('Phương án C — per-click sub1 through /go/at (owner 29/09)', () => {
  it('seals the identity: ciphertext, fresh each time, opens only with the same secret', () => {
    const a = sealIdentity(USER, env)!, b = sealIdentity(USER, env)!
    expect(a).not.toContain(USER)
    expect(a).not.toBe(b)
    expect(openIdentity(a, env)).toBe(USER)
    expect(openIdentity(a, { CCP_ATTRIBUTION_SECRET: 'y'.repeat(40) } as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(sealIdentity(USER, {} as NodeJS.ProcessEnv)).toBeUndefined()
  })
  it('builds a signed click link that opens back to the deep link + identity; any change is refused', () => {
    const href = buildClickUrl({ wrapperUrl: DEEP, providerId: 'traveloka', seal: sealIdentity(USER, env), actorHash: 'a'.repeat(24) }, env)!
    const u = new URL(href)
    expect(u.origin + u.pathname).toBe('https://uat.tappyai.com/go/at')
    expect(u.searchParams.has('sub1')).toBe(false)
    expect(openClickUrl(u.searchParams, env)).toEqual({ wrapperUrl: DEEP, providerId: 'traveloka', identityId: USER })
    const forged = new URLSearchParams(u.searchParams); forged.set('u', DEEP.replace('go.isclix.com', 'evil.example.com'))
    expect(openClickUrl(forged, env)).toBeNull()
    const swapped = new URLSearchParams(u.searchParams); swapped.set('p', 'lazada')
    expect(openClickUrl(swapped, env)).toBeNull()
    expect(linkActorMarker(href)).toBe('a'.repeat(24))
    expect(unwrapClickUrl(href)).toBe(DEEP)
  })
  it('refuses a signed link that points anywhere but an ACCESSTRADE host (no open redirect)', () => {
    const href = buildClickUrl({ wrapperUrl: 'https://evil.example.com/x', providerId: 'x', seal: sealIdentity(USER, env) }, env)!
    expect(openClickUrl(new URL(href).searchParams, env)).toBeNull()
  })
  it('two clicks, two different random sub1 values', () => {
    const s = new Set(Array.from({ length: 50 }, () => newClickSub1()))
    expect(s.size).toBe(50)
    for (const v of s) expect(v).toMatch(/^[0-9a-f]{24}$/)
    expect(new URL(withSub1(DEEP, 'b'.repeat(24))).searchParams.get('sub1')).toBe('b'.repeat(24))
  })
})
