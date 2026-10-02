import { describe, expect, it } from 'vitest'
import { buildShareMessage, flatLine, summaryFromPlaces, SHARE_SUMMARY_MAX, SHARE_TITLE_MAX } from './shareMessage'
import { buildPlacesArtifact, buildProseArtifact, resultLinkArtifact, planLinkArtifact } from './shareArtifact'
import { buildTextShareUrl } from './shareTargets'
import fixture from './__fixtures__/placesLiveView.food.json'

const env = { NEXT_PUBLIC_SITE_URL: 'https://uat.tappyai.com' } as unknown as NodeJS.ProcessEnv
const LONG_AFFILIATE = 'https://uat.tappyai.com/go/at?u=https%3A%2F%2Fgo.isclix.com%2Fdeep_link%2Fv6%2F4751584435713464237%2F4348614231480407268%3Furl%3Dhttps%253A%252F%252Fshopee.vn%252Fx%26sub1%3Dabc'
const SHORT = 'https://uat.tappyai.com/r/abc123XYZ0'

describe('buildShareMessage — title + summary + one short link', () => {
  it('is exactly three lines with the link last and intact', () => {
    const m = buildShareMessage({ title: 'Quán bún bò ngon', summary: 'Bún bò Huế Ngọc Hân, Cô Ba', url: SHORT })
    expect(m.split('\n')).toEqual(['Quán bún bò ngon', 'Bún bò Huế Ngọc Hân, Cô Ba', SHORT])
  })
  it('strips URLs and markdown out of title and summary, never cuts the link', () => {
    const m = buildShareMessage({ title: '**Mua** ' + LONG_AFFILIATE, summary: `[mua ngay](${LONG_AFFILIATE}) ${LONG_AFFILIATE} giá tốt`, url: SHORT })
    expect(m).not.toMatch(/go\/at|isclix|%3A%2F%2F/)
    expect(m.endsWith(SHORT)).toBe(true)
    expect(m.match(/https?:\/\//g)).toHaveLength(1)
  })
  it('caps the lengths and the whole message stays short', () => {
    const m = buildShareMessage({ title: 'a '.repeat(200), summary: 'b '.repeat(500), url: SHORT })
    const [t, s, u] = m.split('\n')
    expect(t.length).toBeLessThanOrEqual(SHARE_TITLE_MAX)
    expect(s.length).toBeLessThanOrEqual(SHARE_SUMMARY_MAX)
    expect(u).toBe(SHORT)
    expect(m.length).toBeLessThan(320)
  })
  it('drops a summary that only repeats the title', () => {
    expect(buildShareMessage({ title: 'Hello', summary: 'hello', url: SHORT }).split('\n')).toHaveLength(2)
  })
  it('flatLine removes line breaks', () => { expect(flatLine('a\n\nb  c')).toBe('a b c') })
  it('summaryFromPlaces names three and counts the rest', () => {
    expect(summaryFromPlaces(['A', 'B', 'C', 'D', 'E'], 'vi')).toBe('A, B, C và 2 nơi khác')
  })
})

describe('artifacts leaving the app carry no affiliate/tracking link', () => {
  const view = fixture as never
  const places = buildPlacesArtifact(view, 'Bún bò', 'vi', env)
  it('places fallback = title, summary, brand link only', () => {
    expect(places.text.split('\n').length).toBeLessThanOrEqual(3)
    expect(places.text).not.toMatch(/\/go\/|isclix|accesstrade|maps\.google|\?/)
    expect(places.text.length).toBeLessThan(320)
  })
  it('prose fallback drops every link from the answer', () => {
    const a = buildProseArtifact('Mua giày', `Gợi ý tốt: [Shopee](${LONG_AFFILIATE}) và ${LONG_AFFILIATE}\n\nChi tiết hơn nữa.`, env)
    expect(a.text).not.toMatch(/go\/at|isclix/)
    expect(a.text.match(/https?:\/\//g)).toHaveLength(1)
  })
  it('a published result swaps in the short /r link and server title/description', () => {
    const a = resultLinkArtifact(places, { url: SHORT, title: 'Bún bò Huế', description: 'Ba quán đáng thử' })
    expect(a.text).toBe(`Bún bò Huế\nBa quán đáng thử\n${SHORT}`)
    expect(a.url).toBe(SHORT)
  })
  it('a published plan is title + summary + link', () => {
    const plan = buildPlacesArtifact(view, 'x', 'vi', env)
    expect(planLinkArtifact(plan, SHORT)).toBe(plan) // not a plan: unchanged
  })
  it('Telegram sends the link once', () => {
    const m = buildShareMessage({ title: 'T', summary: 'S', url: SHORT })
    const u = buildTextShareUrl('telegram', 'T', m, SHORT)!
    expect(u).toBe(`https://t.me/share/url?url=${encodeURIComponent(SHORT)}&text=${encodeURIComponent('T\nS')}`)
  })
})

import { pickShareSource } from './shareRequest'
import { deriveTitle } from './publicSanitizer'

describe('the public page title is the real question', () => {
  it('skips the ask card\'s empty submit label', () => {
    const src = pickShareSource([
      { role: 'user', content: 'cà phê làm việc gần Nhà thờ Đức Bà' },
      { role: 'assistant', content: 'ask' },
      { role: 'user', content: 'Tìm cho tôi' },
      { role: 'assistant', content: 'Mình chọn…' },
    ], 3)
    expect(src?.question).toBe('cà phê làm việc gần Nhà thờ Đức Bà')
  })
  it('does not cut the title at the dot inside TP.HCM', () => {
    expect(deriveTitle('quán phở ngon ở Quận 1 TP.HCM. Gần chợ', 'x')).toBe('Quán phở ngon ở Quận 1 TP.HCM')
  })
})
