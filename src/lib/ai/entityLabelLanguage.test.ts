// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { groundEntityNames } from './entityNameGuard'

// Live 2026-10-11: an English reply (UI language Vietnamese) got the Vietnamese label "(mình chưa thấy tên này trong nguồn đã tra)".
const EV = { corpus: ['Some unrelated retrieved text about headphones and prices.'], userTexts: ['best headphones for travel?'] }
const EN = 'For long flights I would look at the **Sony WH-1000XM9** because the noise cancelling is strong and the battery lasts long, but check the price before buying.'
const VI = 'Cho chuyến bay dài mình nghiêng về **Sony WH-1000XM9** vì chống ồn tốt và pin trâu, nhưng bạn nên kiểm tra giá trước khi mua.'

describe('the "name not in sources" label follows the language of the reply', () => {
  it('flag on: English reply + Vietnamese UI language → English label', () => {
    const out = groundEntityNames(EN, EV, 'vi', { labelFromText: true })
    expect(out.text).toContain('(not found in the sources I checked)')
    expect(out.text).not.toContain('mình chưa thấy')
  })
  it('flag on: Vietnamese reply + English UI language → Vietnamese label (both directions)', () => {
    const out = groundEntityNames(VI, EV, 'en', { labelFromText: true })
    expect(out.text).toContain('(mình chưa thấy tên này trong nguồn đã tra)')
  })
  it('flag on: a reply whose language cannot be read keeps the UI language', () => {
    const out = groundEntityNames('**Sony WH-1000XM9** ok', EV, 'en', { labelFromText: true })
    expect(out.text).toContain('(not found in the sources I checked)')
  })
  it('CONTROL — flag off: the UI language decides, as before', () => {
    const out = groundEntityNames(EN, EV, 'vi')
    expect(out.text).toContain('(mình chưa thấy tên này trong nguồn đã tra)')
  })
})
