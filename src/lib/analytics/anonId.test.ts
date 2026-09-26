// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { ANON_ID_COOKIE, ANON_ID_STORAGE_KEY, getAnonId, isAnonId, newAnonId, readAnonIdCookie } from './anonId'
import { buildEnvelope } from '@/lib/tracking/envelope'

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

describe('anon_id — one persistent first-party identity', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); clearCookies() })

  it('mints a UUID on first call and returns the SAME one after', () => {
    const a = getAnonId()
    expect(isAnonId(a)).toBe(true)
    expect(getAnonId()).toBe(a)
    expect(localStorage.getItem(ANON_ID_STORAGE_KEY)).toBe(a)
  })

  it('mirrors the id into a first-party cookie the server can read', () => {
    const a = getAnonId()
    expect(readAnonIdCookie(document.cookie)).toBe(a)
    expect(document.cookie).toContain(`${ANON_ID_COOKIE}=${a}`)
  })

  it('adopts the cookie when localStorage was cleared — never a second identity', () => {
    const a = getAnonId()
    localStorage.clear()
    expect(getAnonId()).toBe(a)
  })

  it('replaces a corrupted stored value with a fresh valid id', () => {
    localStorage.setItem(ANON_ID_STORAGE_KEY, 'not-a-uuid')
    expect(isAnonId(getAnonId())).toBe(true)
  })

  it('is the SAME id the analytics envelope carries (one identity, not one per surface)', () => {
    const a = getAnonId()
    expect(buildEnvelope().anon_id).toBe(a)
  })

  it('never contains anything but a random UUID', () => {
    const ids = new Set(Array.from({ length: 50 }, newAnonId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(isAnonId(id)).toBe(true)
  })

  it('readAnonIdCookie ignores malformed values', () => {
    expect(readAnonIdCookie(`${ANON_ID_COOKIE}=evil; other=1`)).toBeNull()
    expect(readAnonIdCookie(null)).toBeNull()
    expect(readAnonIdCookie(`x=1; ${ANON_ID_COOKIE}=11111111-1111-4111-8111-111111111111`)).toBe('11111111-1111-4111-8111-111111111111')
  })
})
