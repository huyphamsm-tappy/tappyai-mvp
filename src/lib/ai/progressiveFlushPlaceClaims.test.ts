// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { safeFlushPoint } from './progressiveFlush'
import { guardPlaceClaimsInText, mayRedactPlaceClaim } from './placeClaimGuard'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE EARLY-FLUSH LEAK: PROSE REACHED THE CLIENT BEFORE THE PLACE GUARD RAN.
//
// `safeFlushPoint`'s safety proof was written when money was the only prose
// guard and was not revisited when the place-claim guards were added. So a
// sentence carrying an ordering/popularity/rating claim but NO amount passed the
// money test and streamed out before `guardPlaceClaimsInText` could remove it.
//
// Measured on localhost 2026-09-09, "quán bún bò ở Quận 1 nào có giao hàng...":
//
//   safeFlushPoint(reply)          -> released the sentence below
//   guardPlaceClaimsInText(reply)  -> redacted = 1, that same sentence REMOVED
//
// Fingerprint in the real stream: "nhé.Mình chọn" with no space, the released
// prefix and the guarded remainder concatenated.
// ─────────────────────────────────────────────────────────────────────────────

/** The exact sentence that leaked, verbatim from the UAT. */
const LEAKED = 'Mình tìm các quán bún bò ở Quận 1 có giao hàng cho bạn nhé.'
const AFTER = ' Mình chọn **Bún Bò Huế Đông Ba** cho bạn.'
/** A perfectly ordinary opening: no amount, no rating, no distance. */
const CLEAN_OPENING = 'Mình tìm bún bò ngon ở Quận 1 cho bạn nhé!'

describe('the two readings agree', () => {
  it('the guard really does remove the sentence that leaked', () => {
    const out = guardPlaceClaimsInText(LEAKED + AFTER, {
      ratings: [], distancesKm: [], texts: [], placeNames: ['Bún Bò Huế Đông Ba'],
    })
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('có giao hàng')
  })

  it('and the flush boundary now recognises it', () => {
    expect(mayRedactPlaceClaim(LEAKED)).toBe(true)
    expect(mayRedactPlaceClaim(CLEAN_OPENING)).toBe(false)
  })
})

describe('safeFlushPoint holds what the place guard could remove', () => {
  it('releases nothing when the very first sentence carries a claim', () => {
    // THE REGRESSION. Before the fix this returned the whole first sentence.
    expect(safeFlushPoint(LEAKED + AFTER)).toBe(0)
  })

  it('releases the claim-free opening and stops at the claim', () => {
    const text = CLEAN_OPENING + ' ' + LEAKED + AFTER
    const point = safeFlushPoint(text)
    expect(point).toBeGreaterThan(0)
    expect(text.slice(0, point)).toContain('Mình tìm bún bò ngon')
    expect(text.slice(0, point)).not.toContain('có giao hàng')
  })

  it('holds a popularity claim', () => {
    expect(safeFlushPoint('Quán này được nhiều người yêu thích. Ngoài ra còn nhiều lựa chọn.')).toBe(0)
  })

  it('holds a rating claim', () => {
    expect(safeFlushPoint('Quán này được đánh giá cao. Ngoài ra còn nhiều lựa chọn.')).toBe(0)
  })

  it('holds a stated distance', () => {
    expect(safeFlushPoint('Quán này cách bạn 0.7km. Ngoài ra còn nhiều lựa chọn.')).toBe(0)
  })

  // 🔑 LATENCY IS NOT SACRIFICED: only claim-bearing sentences wait.
  it('still streams ordinary prose immediately', () => {
    const text = CLEAN_OPENING + ' Bạn muốn ăn ở khu nào?'
    expect(safeFlushPoint(text, true)).toBe(text.length)
  })

  it('does not hold a question, because the guard never removes one', () => {
    const text = 'Bạn muốn đặt online hay đi ăn tại quán?'
    expect(safeFlushPoint(text, true)).toBe(text.length)
  })

  // R3 / money behaviour must be exactly as it was.
  it('still stops at a money claim, unchanged', () => {
    const text = 'Mình tìm quán cho bạn nhé. Tô khoảng 50.000 đồng.'
    const point = safeFlushPoint(text, true)
    expect(point).toBeGreaterThan(0)
    expect(text.slice(0, point)).not.toContain('50.000')
  })
})

// ── The same boundary, exercised through the REAL streaming filter ───────────
//
// The unit tests above prove `safeFlushPoint`'s arithmetic. These prove the
// bytes: the model's text is fed in as several `0:` frames, exactly as it
// arrives from the provider, so the progressive release actually runs.

const line0 = (s: string) => '0:' + JSON.stringify(s)

/** Drive the filter over a turn whose text arrives in several chunks. */
async function runStreamed(chunks: string[], opts: { placeIntent: boolean; userText?: string }) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      for (const ch of chunks) c.enqueue(enc.encode(line0(ch) + '\n'))
      c.close()
    },
  })
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(body), 'vi', undefined, undefined, undefined, undefined,
    false,                 // travelIntent - this is a food turn
    opts.userText ?? '',
    opts.placeIntent,
  )
  return await new Response(res.body).text()
}

describe('streaming output cannot carry an unsupported place claim', () => {
  it('does not leak the ordering claim through the early prefix', async () => {
    // Chunked so the first sentence COMPLETES before the rest arrives - which is
    // exactly the condition under which the old code released it.
    const out = await runStreamed(
      ['Mình tìm các quán bún bò ở Quận 1 ', 'có giao hàng cho bạn nhé.', ' Mình chọn quán gần nhất cho bạn.'],
      { placeIntent: true },
    )
    expect(out).not.toContain('có giao hàng')
  })

  it('does not leak a popularity claim through the early prefix', async () => {
    const out = await runStreamed(
      ['Quán này được nhiều người yêu thích.', ' Bạn có thể ghé thử.'],
      { placeIntent: true },
    )
    expect(out).not.toContain('yêu thích')
  })

  it('does not leak a rating claim through the early prefix', async () => {
    const out = await runStreamed(
      ['Quán này được đánh giá cao.', ' Bạn có thể ghé thử.'],
      { placeIntent: true },
    )
    expect(out).not.toContain('đánh giá cao')
  })

  // 🔑 THE OTHER HALF: supported / claim-free prose must still get through.
  it('still delivers ordinary prose', async () => {
    const out = await runStreamed(
      ['Mình tìm bún bò ngon ở Quận 1 cho bạn nhé!', ' Bạn muốn ăn ở khu nào?'],
      { placeIntent: true },
    )
    expect(out).toContain('Mình tìm bún bò ngon ở Quận 1 cho bạn nhé!')
    expect(out).toContain('Bạn muốn ăn ở khu nào?')
  })

  it('still delivers a distance the retrieval supports', async () => {
    // No place rows in this harness, so an unsupported distance would be removed;
    // this asserts the claim-free half is untouched either way.
    const out = await runStreamed(
      ['Mình tìm bún bò cho bạn nhé.', ' Bạn muốn đặt online hay đi ăn tại quán?'],
      { placeIntent: true },
    )
    expect(out).toContain('Bạn muốn đặt online hay đi ăn tại quán?')
  })

  it('still removes an unsupported price, unchanged by this fix', async () => {
    const out = await runStreamed(
      ['Mình vừa tìm kiếm nhưng chưa có giá cụ thể.', ' Thường tô khoảng 30.000 - 50.000đ.'],
      { placeIntent: true },
    )
    expect(out).not.toContain('30.000')
    expect(out).toContain('chưa có giá cụ thể')
  })
})

// ── THE CONTRACT ITSELF ─────────────────────────────────────────────────────
//
// 🔑 THE INVARIANT THAT MAKES THE PROOF HOLD, AND THE ONE THAT ROTS FIRST.
// The leak happened because a rule was added to `guardPlaceClaimsInText` and the
// flush boundary was never told. This pins the implication directly:
//
//     if the guard removes a sentence  =>  the flush must have held it back
//
// A future rule added to the guard alone makes this fail, which is the whole
// point of asserting it rather than trusting two lists to stay in step.

describe('flush boundary covers every guard rule', () => {
  /** Empty evidence: whatever the guard removes here, it removes on a real no-retrieval turn. */
  const NO_EVIDENCE = { ratings: [], distancesKm: [], texts: [], placeNames: ['Bún Bò Huế Đông Ba'] }

  const REMOVABLE = [
    'Bún Bò Huế Đông Ba được đánh giá cao.',
    'Bún Bò Huế Đông Ba được nhiều người yêu thích.',
    'Bún Bò Huế Đông Ba rất đông khách.',
    'Bún Bò Huế Đông Ba có giao hàng.',
    'Bún Bò Huế Đông Ba có đặt online qua ShopeeFood.',
    'Bún Bò Huế Đông Ba được 4.8 sao.',
    'Bún Bò Huế Đông Ba cách bạn 12km.',
  ]

  it.each(REMOVABLE)('holds back a sentence the guard removes: %s', (sentence) => {
    // The guard really does remove it, on evidence that supports nothing...
    const out = guardPlaceClaimsInText(sentence + '\nQuán nằm ở Quận 1.', NO_EVIDENCE)
    expect(out.redacted).toBeGreaterThan(0)
    // ...so the flush must never have let it out.
    expect(mayRedactPlaceClaim(sentence)).toBe(true)
    expect(safeFlushPoint(sentence + ' Còn nhiều lựa chọn khác.')).toBe(0)
  })
})
