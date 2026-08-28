import { describe, it, expect } from 'vitest'
import { safeFlushPoint } from './progressiveFlush'
import { extractMoneyClaims } from './moneyGuard'
import { guardSnippetPricesInText } from './snippetPriceGuard'

// ── P1: the A5 fix bought safety with a 13-second blank screen ───────────────
//
// #200 closed a real P0 (a food follow-up with no retrieval stated an invented price) by
// buffering every places turn from t=0. Measured on production 63313d5:
//
//   shopping   ttft 2,208ms → TTUA  2,208ms   (streams; control)
//   food       ttft 1,994ms → TTUA 15,449ms   (buffered from t=0)
//
// Same pipeline, same total — 13.5 seconds of difference in when the user sees anything.
//
// The fix must keep the invariant absolutely: NO unsupported price may reach the client. So this
// does not "turn buffering down". It answers one question — how much of the text so far is
// provably not redactable — and only that much is allowed out early.
//
// THE PROOF this file exists to pin:
//   · snippetPriceGuard removes only sentences that contain a money claim (or, in its fallback,
//     only the amounts themselves);
//   · safeFlushPoint returns a prefix that ends on a sentence boundary AND contains no money
//     claim at all;
//   ⇒ nothing it releases could ever have been removed by the guard.
//
// Both sides are computed with the guard's OWN extractMoneyClaims and sentenceSpans, so the two
// cannot drift apart into disagreeing about what a sentence or an amount is.

const FABRICATED = 'Thường hủ tiếu Nam Vang ở Phú Nhuận có giá khoảng 30.000 - 50.000đ/tô.'

describe('safeFlushPoint — what may be released early', () => {
  it('releases a complete money-free opening sentence', () => {
    const text = 'Mình tìm quán bún bò ở Quận 3 cho bạn nhé. '
    expect(safeFlushPoint(text)).toBeGreaterThan(0)
    expect(text.slice(0, safeFlushPoint(text))).toContain('Quận 3')
  })

  it('releases NOTHING once the text carries a money claim', () => {
    expect(safeFlushPoint(FABRICATED)).toBe(0)
  })

  it('releases the money-free sentences BEFORE a priced one, and stops there', () => {
    const text = `Mình tìm quán hủ tiếu ở Phú Nhuận nhé. ${FABRICATED}`
    const cut = text.slice(0, safeFlushPoint(text))

    expect(cut).toContain('Phú Nhuận nhé.')
    expect(cut).not.toContain('30.000')
    expect(cut).not.toContain('50.000')
    expect(extractMoneyClaims(cut)).toHaveLength(0)
  })

  it('never releases a half sentence — the price may still be arriving', () => {
    // The exact hazard: the sentence has begun and its amount has not streamed in yet.
    const partial = 'Mình tìm quán nhé. Thường hủ tiếu có giá khoảng '
    const cut = partial.slice(0, safeFlushPoint(partial))

    // The boundary sits immediately after the '.', so the separating space starts the next
    // sentence and rides along with it.
    expect(cut).toBe('Mình tìm quán nhé.')
    expect(cut).not.toContain('có giá khoảng')
  })

  it('holds everything when the very first sentence is still incomplete', () => {
    expect(safeFlushPoint('Mình đang tìm')).toBe(0)
  })

  it('treats a newline as a boundary, like the guard does', () => {
    const text = 'Đây là vài gợi ý:\nQuán A rất ngon'
    const cut = text.slice(0, safeFlushPoint(text))
    expect(cut).toBe('Đây là vài gợi ý:\n')
  })

  it('is monotonic — a longer prefix never releases less', () => {
    const full = `Mình tìm quán hủ tiếu ở Phú Nhuận nhé. Quán mở cửa từ sáng sớm. ${FABRICATED}`
    let prev = 0
    for (let i = 1; i <= full.length; i++) {
      const p = safeFlushPoint(full.slice(0, i))
      expect(p, `regressed at prefix ${i}`).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('a number without a currency is not a money claim, and must not stall the stream', () => {
    // "4.6⭐ (57 đánh giá)" is a rating, not a price — the guard would never touch it.
    const text = 'Quán này 4.6⭐ với 57 đánh giá Google Maps. '
    expect(extractMoneyClaims(text)).toHaveLength(0)
    expect(safeFlushPoint(text)).toBeGreaterThan(0)
  })
})

describe('THE SAFETY INVARIANT — nothing released could ever have been redacted', () => {
  // Replays a reply token by token, exactly as the stream does, and checks at EVERY prefix that
  // the released text survives the guard untouched. This is the property, not an example.
  const replay = (full: string, evidencePrices: number[], userText = '') => {
    let released = ''
    for (let i = 1; i <= full.length; i++) {
      const acc = full.slice(0, i)
      const point = safeFlushPoint(acc)
      released = acc.slice(0, point)

      // Everything released so far must be untouched by the guard, with NO evidence at all —
      // the harshest case, where the guard removes every price it finds.
      const g = guardSnippetPricesInText(released, [], userText)
      expect(g.redacted, `guard would have redacted released text at prefix ${i}`).toBe(0)
      expect(g.text, `guard would have rewritten released text at prefix ${i}`).toBe(released)
    }
    return released
  }

  it('the historical P0 sentence is never released, at any prefix', () => {
    const released = replay(`Mình vừa tìm nhưng chưa có giá cụ thể. ${FABRICATED}`, [])
    expect(released).not.toContain('30.000')
    expect(released).not.toContain('50.000')
    // The honest half may go out early — that is the whole point.
    expect(released).toContain('chưa có giá cụ thể.')
  })

  it('holds a snippet-traceable price too — evidence is not known while streaming', () => {
    // Even a price the evidence WILL support must wait: the snippets have not arrived yet, so at
    // stream time the system cannot know. Fail-closed.
    const released = replay('Tô hủ tiếu khoảng 50.000đ.', [50_000])
    expect(released).not.toContain('50.000')
  })

  it("a user's own number is still held — the guard's exemption is applied at the end", () => {
    const released = replay('Với ngân sách 500.000đ bạn có nhiều lựa chọn.', [], 'dưới 500.000đ')
    expect(released).not.toContain('500.000')
  })

  it('an ordinary priceless reply streams out except its final sentence', () => {
    // The last sentence ALWAYS waits: mid-stream this function cannot tell "the sentence ended"
    // from "the text stops here for now", and an amount could still be arriving. The caller emits
    // that remainder through the guard when the stream closes, so the user loses nothing — the
    // wait shrinks from the whole reply to its last sentence.
    const text = 'Mình chọn Quán hủ tiếu thả - Dì Ba. Quán mở cửa từ 6h sáng.'
    const released = replay(text, [])

    expect(released).toBe('Mình chọn Quán hủ tiếu thả - Dì Ba.')
    expect(text.slice(released.length)).toBe(' Quán mở cửa từ 6h sáng.')
  })
})

describe('mutation guards — the safety condition must be load-bearing', () => {
  it('a flush point past a money claim would be caught', () => {
    // Simulates the mutant "ignore money, just flush at the last sentence boundary".
    const text = `Mình tìm quán nhé. ${FABRICATED}`
    const naive = text.lastIndexOf('.') + 1 // what a boundary-only implementation would return
    const mutantReleased = text.slice(0, naive)

    expect(guardSnippetPricesInText(mutantReleased, [], '').redacted).toBeGreaterThan(0)
    // ...and the real implementation does not do that.
    expect(safeFlushPoint(text)).toBeLessThan(naive)
  })

  it('a flush point mid-sentence would be caught', () => {
    // Simulates the mutant "flush everything accumulated so far".
    const partial = 'Mình tìm quán nhé. Thường hủ tiếu có giá khoảng '
    expect(safeFlushPoint(partial)).toBeLessThan(partial.length)
  })
})
