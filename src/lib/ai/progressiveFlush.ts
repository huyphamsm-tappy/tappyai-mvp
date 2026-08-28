import { extractMoneyClaims, sentenceSpans } from './moneyGuard'

// ── How much of a streaming places reply may be released early ───────────────
//
// #200 closed a real P0 — a food follow-up with no retrieval stated an invented price — by
// buffering every places turn from t=0. That was broader than the danger. Measured on production
// 63313d5: shopping showed content at 2.2s, food at 15.4s, with the same pipeline and the same
// total. Thirteen and a half seconds of blank screen, bought for safety the turn did not need.
//
// This narrows it WITHOUT touching the invariant. It answers one question:
//
//     how much of the text so far is PROVABLY not redactable?
//
// and only that much is allowed out early. The rest keeps waiting for the guard, exactly as it
// does today.
//
// ── Why the answer is safe ──────────────────────────────────────────────────
//
// `guardSnippetPricesInText` removes only sentences that contain a money claim (`sentenceSpans`
// + `redactUnsupportedClaims`), or — in the fallback it takes when removing those sentences would
// leave nothing at all — only the amounts themselves.
//
// A prefix returned here ends on a sentence boundary AND contains no money claim anywhere in it.
// So no sentence it contains is a candidate for removal, and it holds no amount to excise.
// Therefore nothing released can ever be something the guard would have taken away. The fallback
// path cannot reach it either: that path only runs when NO money-free sentence exists, and in that
// case this function has already released nothing.
//
// Both halves of the argument are computed with the guard's OWN `extractMoneyClaims` and
// `sentenceSpans`, so "sentence" and "amount" cannot come to mean two different things in the two
// places — which is precisely how a boundary like this rots.
//
// 🚨 Evidence is NOT consulted, and must not be: while the reply is streaming the retrieval
// snippets may not have arrived, so a price that will turn out to be supported is still unknown
// at this moment. Fail-closed — it waits.

/**
 * The number of characters of `accumulated` that may be streamed to the client now.
 *
 * 0 means "release nothing yet". The result never decreases as `accumulated` grows, so a caller
 * can simply track how much it has already sent.
 */
export function safeFlushPoint(accumulated: string, segmentComplete = false): number {
  if (!accumulated) return 0

  // Where the money claims are. One pass over the whole text: cheap, and it is the same reading
  // the guard will make later.
  const claims = extractMoneyClaims(accumulated)
  const firstClaimStart = claims.length > 0 ? Math.min(...claims.map(c => c.start)) : Infinity

  let point = 0
  for (const [, end] of sentenceSpans(accumulated)) {
    // Never release a sentence that has not finished arriving: its amount may still be in flight.
    // `sentenceSpans` always closes the final span at text end, so mid-stream that last span is
    // not a real boundary — it is just where the text happens to stop.
    //
    // `segmentComplete` says the caller KNOWS no more text is coming for this segment (it has
    // reached the tool call), so the final span is a genuine sentence end and may be released.
    // Without this, the common shape "one short opening sentence, then the tool" released nothing
    // at all: measured on production d54e9e9, spa and the food follow-up still waited ~13.6s while
    // food — whose opening ran longer — dropped to 3.2s.
    if (end >= accumulated.length && !segmentComplete) break
    // Stop at the first sentence that reaches into a money claim.
    if (end > firstClaimStart) break
    point = end
  }
  return point
}
