import { describe, it, expect } from 'vitest'
import { isNearMeRequest } from './currentLocation'

// Round 42 (allowlist cons-allowlist-ex1-u4.md): the six approved "gần tôi" phrases, with the false matches they must not cause.
describe('isNearMeRequest — approved additions', () => {
  it.each([
    'quán phở gần tui', 'quan pho gan tui', 'cafe quanh tôi', 'xung quanh tôi có gì ăn', 'quán nào quanh mình', 'coffee near here', 'food around me',
  ])('matches: %s', t => { expect(isNearMeRequest(t)).toBe(true) })

  it.each([
    'quán phở xung quanh Hồ Gươm', 'xung quanh Quận 1 có quán nào', 'quanh Minh Khai có quán nào', 'quán nào mở quanh tối nay',
    'gần tuần sau mình đi Đà Lạt', 'around meeting time',
  ])('does not match (false-match probe): %s', t => { expect(isNearMeRequest(t)).toBe(false) })

  it.each([
    'quán gần em', 'quán gần nhất', 'gần đây có quán nào', 'quán gần nhà', 'quán gần công ty', 'quan gan t', 'close to me', 'close by',
  ])('not added, still does not match: %s', t => { expect(isNearMeRequest(t)).toBe(false) })

  it.each(['quán phở gần tôi', 'quanh đây có gì', 'near me', 'nearby', 'around here'])('earlier phrases unchanged: %s', t => { expect(isNearMeRequest(t)).toBe(true) })
})
