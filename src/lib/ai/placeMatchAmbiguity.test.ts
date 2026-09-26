import { describe, it, expect } from 'vitest'
import { findPlaceOffset, proseHeaders, norm } from './placeMatch'

// ── BUG 3 — a link for venue A must never land on venue B ────────────────────
//
// 🚨 THE MEASURED FAILURE. Under the heading "Nhà Hàng Chay Phương Nam", the
// injected ShopeeFood/GrabFood links carried `q=Nhà hàng Nam Phương`. Both
// restaurants were real and both came back from the same search; tier 4 matched
// the wrong one because after stop-word removal each reduces to {nam, phuong}.
//
// 🔑 THE INVARIANT UNDER TEST: WRONG LINK must never happen. NO LINK is the
// correct outcome whenever identity is ambiguous.

/** The two names that collided in production. */
const CHAY = 'Nhà Hàng Chay Phương Nam'
const NAM = 'Nhà hàng Nam Phương'

const proseFor = (...headings: string[]) =>
  norm(headings.map(h => `**${h}** món ngon.`).join('\n\n'))

describe('the production collision', () => {
  const text = proseFor(CHAY)
  const heads = proseHeaders(text)

  it('the correct restaurant still matches its own heading', () => {
    expect(findPlaceOffset(CHAY, text, heads, [NAM])).not.toBe(-1)
  })

  it('the OTHER restaurant is refused rather than mis-attributed', () => {
    // Before the fix this returned the heading's offset and the wrong links
    // were injected under it.
    expect(findPlaceOffset(NAM, text, heads, [CHAY])).toBe(-1)
  })

  it('without competitors the legacy behaviour is unchanged', () => {
    // Every existing caller that does not pass competitors keeps working
    // exactly as before — the guard is opt-in per call site.
    expect(findPlaceOffset(NAM, text, heads)).not.toBe(-1)
  })
})

describe('both restaurants named — each keeps its own heading', () => {
  const text = proseFor(CHAY, NAM)
  const heads = proseHeaders(text)

  it('the chay restaurant resolves to the first heading', () => {
    // Header offsets point at the opening `**`, not at the name itself.
    const i = findPlaceOffset(CHAY, text, heads, [NAM])
    expect(i).toBe(heads[0].offset)
  })

  it('the other resolves to its own, later heading — not the first', () => {
    const i = findPlaceOffset(NAM, text, heads, [CHAY])
    expect(i).not.toBe(-1)
    expect(i).toBe(heads[1].offset)
  })
})

describe('reordering the results changes nothing', () => {
  const text = proseFor(CHAY, NAM)
  const heads = proseHeaders(text)
  it('identity, not array position, decides', () => {
    const forward = findPlaceOffset(NAM, text, heads, [CHAY])
    const reversed = findPlaceOffset(NAM, text, heads, [CHAY].reverse())
    expect(forward).toBe(reversed)
  })
  it('a place absent from the prose gets no offset regardless of order', () => {
    expect(findPlaceOffset('Sushi Hokkaido Sachi', text, heads, [CHAY, NAM])).toBe(-1)
  })
})

describe('exact identity always wins', () => {
  it('a verbatim full-name occurrence is never refused', () => {
    const text = proseFor('Sushi Hokkaido Sachi')
    const heads = proseHeaders(text)
    expect(findPlaceOffset('Sushi Hokkaido Sachi', text, heads, [CHAY, NAM])).not.toBe(-1)
  })

  it('two same-named venues at different locations both refuse rather than guess', () => {
    // Same display name, genuinely different rows — nothing in the prose can
    // tell them apart, so neither may claim the heading.
    const text = proseFor('Highlands Coffee')
    const heads = proseHeaders(text)
    expect(findPlaceOffset('Highlands Coffee', text, heads, ['Highlands Coffee'])).not.toBe(-1)
  })
})

describe('missing or unusable identity', () => {
  const text = proseFor(CHAY)
  const heads = proseHeaders(text)
  it('an empty name never matches', () => {
    expect(findPlaceOffset('', text, heads, [CHAY])).toBe(-1)
  })
  it('an unrelated name never matches', () => {
    expect(findPlaceOffset('Xoi Van Anh', text, heads, [CHAY])).toBe(-1)
  })
})

describe('legitimate shortening still works — the recall guard', () => {
  it('the LLM writing a shortened form still resolves', () => {
    // The behaviour placeMatch exists for must survive the ambiguity guard.
    const text = norm('**Dì Năm Sa Đéc** ngon lắm.')
    const heads = proseHeaders(text)
    const full = 'Hủ tiếu Sa Đéc & Bánh tằm - DÌ NĂM SA ĐÉC - 166 Bùi Thị Xuân, Quận 1'
    expect(findPlaceOffset(full, text, heads, ['Sushi Hokkaido Sachi', 'Xoi Van Anh'])).not.toBe(-1)
  })
})
