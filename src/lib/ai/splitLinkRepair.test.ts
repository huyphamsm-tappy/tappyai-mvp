// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { releasableLiveText } from './streamEnrichment'

// 29/10 (live, localhost): the model copied a dated Vexere train link with a space inside it — "…passenger%5Bad t%5D=2" — so the markdown
// stopped parsing and the reader saw a broken chip. A link whose target, whitespace removed, is EXACTLY a given link is joined back.
const GIVEN = 'https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=24_area&to=15_area&date%5Bdepart%5D=2026-11-20&passenger%5Badt%5D=2'
/** The egress compares normalized URLs (decoded, lower-cased): the allow-set holds them that way. */
const allowed = new Set([decodeURIComponent(GIVEN).toLowerCase()])
const split = (u: string, at: number) => `${u.slice(0, at)} ${u.slice(at)}`

describe('a given link copied with whitespace inside it', () => {
  it('is joined back into the given link, label kept', () => {
    const t = `Đặt vé: [tra cứu vé theo ngày](${split(GIVEN, GIVEN.length - 6)}) — chọn chuyến.`
    expect(releasableLiveText(t, true, allowed)).toBe(`Đặt vé: [tra cứu vé theo ngày](${GIVEN}) — chọn chuyến.`)
  })

  it('a link that, joined, is NOT a given link is not produced: the label stays, no URL survives', () => {
    const other = GIVEN.replace('passenger%5Badt%5D=2', 'passenger%5Badt%5D=9&x=1')
    const t = `Đặt vé: [tra cứu](${split(other, other.length - 6)}) xong.`
    const out = releasableLiveText(t, true, allowed)
    expect(out).not.toContain('adt%5D=9')
    expect(out).not.toContain(GIVEN)
  })

  it('a well-formed given link and ordinary prose are left byte for byte', () => {
    const t = `Xem [lịch tàu](${GIVEN}) nhé. Một câu (có ngoặc và khoảng trắng) bình thường.`
    expect(releasableLiveText(t, true, allowed)).toBe(t)
  })
})
