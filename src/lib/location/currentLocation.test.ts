// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isNearMeRequest, readSessionFix, saveSessionFix } from './currentLocation'

describe('isNearMeRequest — the fixed "gần tôi" list (Round 42 allowlist C)', () => {
  it.each(['quán phở gần tôi', 'Gần mình có quán cafe nào', 'tiệm sửa xe gần chỗ tôi', 'ATM gần chỗ mình', 'quanh đây có gì ăn', 'xung quanh đây có spa không', 'coffee near me', 'nearby pho', 'food around here'])('matches %s', (t) => {
    expect(isNearMeRequest(t)).toBe(true)
  })
  it.each(['phim gần đây có gì hay', 'quán phở ở Quận 3', 'quán ăn gần chợ Bến Thành', 'xung quanh Hồ Gươm có gì chơi', 'quán ăn gần nhà', 'quán cafe view đẹp', ''])('does not match %s', (t) => {
    expect(isNearMeRequest(t)).toBe(false)
  })
})

describe('session fix', () => {
  afterEach(() => { localStorage.clear(); sessionStorage.clear() })
  it('a stored fix without this session\'s mark is not returned, and is not removed', () => {
    const loc = { lat: 16.05, lng: 108.2, address: 'Đà Nẵng', ts: 1 }
    localStorage.setItem('tappy_location', JSON.stringify(loc))
    expect(readSessionFix()).toBeNull()
    expect(JSON.parse(localStorage.getItem('tappy_location') ?? 'null')).toEqual(loc)
  })
  it('a fix saved in this session is returned', () => {
    const loc = { lat: 10.77, lng: 106.7, address: 'Quận 1', ts: 2 }
    saveSessionFix(loc)
    expect(readSessionFix()).toEqual(loc)
  })
})
