import { extractMoneyClaims, sentenceSpans } from './moneyGuard'
import { mayRedactPlaceClaim } from './placeClaimGuard'

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
// A prefix returned here ends on a sentence boundary AND contains no sentence that ANY
// deterministic prose guard downstream could remove. Two families can remove one:
//
//   · MONEY - `guardSnippetPricesInText` / `guardMoneyClaimsInText` remove a sentence containing
//     an unsupported amount (`sentenceSpans` + `redactUnsupportedClaims`), or in their
//     leave-nothing fallback only the amounts. So the prefix stops before the first money claim.
//
//   · PLACE CLAIMS - `guardPlaceClaimsInText` removes a sentence whose rating, popularity,
//     ordering or distance claim the retrieval does not support. So the prefix also stops before
//     the first sentence `mayRedactPlaceClaim` recognises.
//
// 🚨 THE SECOND FAMILY WAS MISSING, AND IT LEAKED. This proof was written when money was the only
// prose guard, and it was not revisited when the place guards were added. Measured on localhost
// 2026-09-09, the adversarial turn "quán bún bò ở Quận 1 nào có giao hàng...":
//
//     safeFlushPoint(reply) released "Mình tìm các quán bún bò ở Quận 1 có giao hàng cho bạn nhé."
//     guardPlaceClaimsInText(reply) -> redacted = 1, that exact sentence REMOVED
//
// The sentence carried no amount, so the money test passed it straight through to the client
// before the place guard ever ran. The fingerprint in the stream is the missing space in
// "nhé.Mình chọn" - the released prefix and the guarded remainder concatenated.
//
// ── Why no sentence released here can later be ORPHANED ─────────────────────
//
// `guardPlaceClaimsInText` also drops a sentence that lost its antecedent ("Quán này ..." whose
// introduction it removed). That cannot reach released text: an antecedent is only removed when it
// carried a claim, and such a sentence STOPS this function - nothing after the first claim
// sentence is ever released. So every released sentence is preceded only by sentences no guard
// will touch. (Clause-level trimming keeps the venue's name by construction, so it never orphans
// anything either.) Orphaning also propagates forward only, and a prefix has no later text in it.
//
// ── Why this does not just delay everything ─────────────────────────────────
//
// Only sentences that actually CARRY a claim wait. The ordinary opening - "Mình tìm bún bò ngon ở
// Quận 1 cho bạn nhé!" - names no amount, no rating and no distance, so it still streams the
// moment it lands, which is the latency win A5-P1 bought. And `progressive` is
// `placeIntent && !travelIntent`, so this path only ever runs on the very turns
// `guardPlaceClaimsInText` runs on: no other domain pays for it.
//
// Both halves are computed with the guards' OWN readings - `extractMoneyClaims`, `sentenceSpans`
// and the place guard's own regexes via `mayRedactPlaceClaim` - so "sentence", "amount" and
// "claim" cannot come to mean different things in the two places.
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
  for (const [start, end] of sentenceSpans(accumulated)) {
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
    // ...and at the first sentence carrying a claim the PLACE guard could remove.
    // Evidence-blind on purpose: see `mayRedactPlaceClaim`.
    if (mayRedactPlaceClaim(accumulated.slice(start, end))) break
    // 🚨 A LINK SPAN END IS NOT A SENTENCE END. `sentenceSpans` keeps a markdown link / bare URL as
    // its own span, so a sentence with an inline link arrives here in three pieces. Measured live
    // (C3 run 20, 2026-09-20): "Bạn có thể vào **[trang CGV](…)** để xem … giá vé (thường từ
    // 80k-150k …)." — the money claim sat in the third piece, the first two were released, the
    // guard then cut the clause, and the reply reached the client with its opening repeated. Only a
    // boundary that is a real sentence end (terminal punctuation, a line break, or the completed
    // segment's end) may be released; a piece cut off by a link waits with the rest of its sentence.
    const last = accumulated[end - 1]
    const realEnd = end >= accumulated.length || last === '\n' || last === '.' || last === '!' || last === '?'
    if (!realEnd) continue
    point = end
  }
  return point
}
