// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { devicesIn, deviceLabel, detectWrongModel, rightKeyword, wrongModelBlock, insertBeforeMarkers } from './wrongModel'

// A3 (owner 2026-10-02): «kính cường lực iPhone 17» found only «iPhone 15 Pro Max» listings — shown as one picture alone with «Còn 1 lựa chọn
// nữa». Listing titles below are real ones captured from the local run (serper shopping rows).
const USER = ['Muốn mua kính cường lực cho iphone', 'iPhone 17 · Cường lực mà']
const REAL_17 = [
  'Kính cường lực bảo vệ camera Slimcase cho iPhone 17 Series & iPhone Air iPhone Air',
  'Dán kính cường lực màn hình Apple iPhone 17 Pro Max Mipow ch?',
  'Dán kính cường lực màn hình Apple iPhone 17 Zeelot Solidsleek',
  'Kính cường lực UNIQ OPTIX iPhone 17',
]

describe('devicesIn', () => {
  it('reads generation and variant, folding case and diacritics', () => {
    expect(devicesIn('Kính cường lực cho IPHONE 15 Pro Max').map(deviceLabel)).toEqual(['iPhone 15 Pro Max'])
    expect(devicesIn('iphone 17').map(deviceLabel)).toEqual(['iPhone 17'])
    expect(devicesIn('iPhone 16e vs iPhone 16 Plus').map(deviceLabel)).toEqual(['iPhone 16 e', 'iPhone 16 Plus'])
    expect(devicesIn('Galaxy S24 Ultra').map(deviceLabel)).toEqual(['Galaxy S24 Ultra'])
    expect(devicesIn('ốp lưng điện thoại')).toEqual([])
  })
})

describe('detectWrongModel', () => {
  it('REAL titles that include the requested model: no verdict (the card is a real result)', () => {
    expect(detectWrongModel(USER, REAL_17)).toBeNull()
  })
  it('every listing names iPhone 15 Pro Max, the user asked for iPhone 17: wrong model', () => {
    const w = detectWrongModel(USER, ['Kính cường lực iPhone 15 Pro Max Baseus', 'Dán màn hình iPhone 15 Pro Max chống nhìn trộm'])
    expect(w).not.toBeNull()
    expect(deviceLabel(w!.requested)).toBe('iPhone 17')
    expect(w!.found.map(deviceLabel)).toEqual(['iPhone 15 Pro Max'])
  })
  it('a different VARIANT of the same generation is a different phone (glass for 15 does not fit 15 Pro Max)', () => {
    const w = detectWrongModel(['kính chống nhìn trộm iPhone 15'], ['Kính iPhone 15 Pro Max', 'Kính iPhone 15 Plus'])
    expect(w).not.toBeNull()
    expect(w!.found.map(deviceLabel)).toEqual(['iPhone 15 Pro Max', 'iPhone 15 Plus'])
  })
  it('a «Series» title covers the generation; a listing that names no model is neutral — no verdict either way', () => {
    expect(detectWrongModel(['kính iPhone 17'], ['Kính cho iPhone 17 Series', 'Kính iPhone 15 Pro Max'])).toBeNull()
    expect(detectWrongModel(['kính iPhone 17'], ['Kính cường lực trong suốt 9H', 'Kính iPhone 15 Pro Max'])).toBeNull()
  })
  it('no model asked, or no listing: nothing to judge', () => {
    expect(detectWrongModel(['mua tai nghe'], ['Tai nghe Sony'])).toBeNull()
    expect(detectWrongModel(USER, [])).toBeNull()
  })
  it('the NEWEST user text that names a model wins', () => {
    const w = detectWrongModel(['iPhone 15', 'thôi cho iPhone 17'], ['Kính iPhone 15'])
    expect(deviceLabel(w!.requested)).toBe('iPhone 17')
  })
})

describe('wrongModelBlock — code-built keyword and links', () => {
  const w = detectWrongModel(USER, ['Kính iPhone 15 Pro Max'])!
  it('keeps the tool query when it already names the model, else appends the model', () => {
    expect(rightKeyword('kính cường lực iPhone 17', w.requested)).toBe('kính cường lực iPhone 17')
    expect(rightKeyword('kính cường lực iPhone 15 Pro Max', w.requested)).toBe('kính cường lực iPhone 17')
    expect(rightKeyword('kính cường lực', w.requested)).toBe('kính cường lực iPhone 17')
  })
  it('says what was found, builds Shopee and Lazada search links for the right keyword, in vi and en', () => {
    const vi = wrongModelBlock(w, 'kính cường lực iPhone 17', 'vi')
    expect(vi.text).toContain('iPhone 15 Pro Max')
    expect(vi.text).toContain('iPhone 17')
    expect(vi.links.map(l => l.name)).toEqual(expect.arrayContaining(['Shopee', 'Lazada']))
    for (const l of vi.links) expect(decodeURIComponent(l.url.replace(/\+/g, ' '))).toContain('kính cường lực iPhone 17')
    expect(vi.links.find(l => l.name === 'Shopee')!.url).toMatch(/^https:\/\/shopee\.vn\/search\?keyword=/)
    const en = wrongModelBlock(w, 'screen protector iPhone 17', 'en')
    expect(en.text).toMatch(/only found listings for iPhone 15 Pro Max, not for iPhone 17/)
  })
})

describe('insertBeforeMarkers', () => {
  it('goes after the prose and before the first structured block', () => {
    expect(insertBeforeMarkers('Văn.\n[FOLLOWUPS]a[/FOLLOWUPS]', 'KHỐI')).toBe('Văn.\n\nKHỐI\n\n[FOLLOWUPS]a[/FOLLOWUPS]')
    expect(insertBeforeMarkers('Văn.', 'KHỐI')).toBe('Văn.\n\nKHỐI')
  })
})
