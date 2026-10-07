# Release notes — V3 consultative guards, G1 + G2

Branch `fix/g1-place-guard-attribution` (on `design/v3-phase4`). Ships **only with the V3 stack**. Two feature flags, both **default OFF**; everything else in this note changes behaviour the moment the branch merges (**flags OFF**) and must be re-measured after merge (12 turns, audit env, same metrics as the offline replay).

## Feature flags (default OFF — set `1`/`true` to enable, read at call time)
| Flag | Guard | What it turns on |
|---|---|---|
| `PLACE_GUARD_ATTRIBUTION_V2` | `guardPlaceClaimsInText` | identity-first attribution ladder (L1 full name → L2 head alias → L2′ segment → L3 distinctive tokens → L4 token subset), L5 number identity (exact review count, own phone), comparison sentences judged against the union of the named venues, "4.9⭐" counted as a stated score, coherence pass (cascade), no last-resort hand-back, G1b evidence-only fallback sentence |
| `SNIPPET_PRICE_GUARD_V2` | `guardSnippetPricesInText` | the provider's price band (`price_range_text` / `price_range`) as entity-level evidence (fully inside, no tolerance), same attribution ladder + single-subject carry-over across blank lines, R3′ price-only clause cut instead of whole-sentence removal |

Telemetry (console, counts only, never text or venue names): `tappyai_guard{guard:'place_claim'|'place_claim_fallback'|'snippet_price', v2, …}`.

## ALWAYS ON — behaviour changes with both flags OFF
| # | Change | Direction | Why |
|---|---|---|---|
| A1 | Place guard reads `rating_value` (the number) instead of `google_rating` (a string) → `ratingsByEntity` is no longer empty | keeps MORE (a true "4.9 sao" copied from the card survives); fabricated scores still removed | it was empty on 15/15 captured turns |
| A2 | Place guard never judges machine payload: `[CTA_BUTTONS]`/`[FOLLOWUPS]`/`[TAPPY_PLAN]` blocks and links are skipped; phone/score/count/distance numbers are read from prose only | keeps MORE (the model's CTA block reached users on 4/15 turns before; a Maps `cid` looked like a phone) | removes nothing that was ever a claim |
| A3 | `PHONE_RE` digit boundaries (`300.000-500.000` is not a phone) | keeps MORE | price ranges were deleting their sentence |
| A4 | After an ordering/quality clause is trimmed, the numeric checks still run on the remainder | removes MORE, only fabricated numbers that used to survive beside a trimmed clause | "3.1 sao, 99.999 đánh giá, giao hàng tận nơi" kept its numbers |
| A5 | **Money extractor: a lowercase "m" is never money** (`100m`, `300 m` = metres). Uppercase `M` still = million. | keeps MORE; **residual: a model sentence echoing chat slang "tầm 2m" (= 2 triệu) is no longer price-checked** (pinned in `moneyGuardMetres.test.ts`) | "cách bạn chỉ 100m" was 100 000 000 ₫ and deleted two paragraphs |
| A6 | **NFC before tokenising** in `placeAttribution.wordsOf` (feeds `placeTokensFor` / `textNamesPlace` / `placeNamedBy`) | attribution changes for **decomposed (NFD) provider names** in every consumer: v1 place guard, v1 snippet-price guard, TikTok review attribution, food tool price-snippet and order-link scoping, recommendation actions. Such a venue could previously never be matched by a word with a combining mark ("Giãn" split into "gia"+"n"); now it is — expect a few more entity-level attributions (and, symmetrically, a few fewer batch-level fallbacks) for NFD names | measured on the spa batch, 2026-09-17 |
| A7 | One money fixture changed: `giá 7m` was asserted as 7 000 000 ₫ — now `giá 7M` | test only | consequence of A5 |

Not always-on (v2 only, no effect with flags OFF): alias rejection (batch-unique + distinctive token), two-venue counting across identity levels, house-number name segments, comparison-by-token, single-subject carry-over, band evidence, clause cut, G1b fallback, "⭐" as a score, cascade.

## Known residuals (documented, pinned)
- "tầm 2m"/"5m" slang in model text passes unchecked (A5).
- Mixed-unit ranges ("500k-1tr", "200k-1,5tr") are read as two single amounts, each checked; one bad half removes the sentence (fail-closed) — pinned in `snippetPriceGuard.v2.test.ts`.
- Single-subject carry-over (v2): applies only while every earlier sentence of the reply names ≤ 1 distinct venue; a second venue named **before** the sentence ends it; a venue named **after** does not retract it; a carried subject whose band does not support the amount falls back to the area-level snippet rule (v1's rule), then removal.
- `1.000 Đồng Khởi` (house number written in thousands) is still read as money — pre-existing, unchanged.

## Post-merge check (owner remark 1)
Run 12 turns on the audit env with both flags OFF; expect vs the pre-merge server run: CTA block present in every place reply, no "TP. HCM"-style rewrites, no metre sentence removed, kept-ratio ≥ the pre-merge median (0.77). Then enable the flags on the audit env and repeat.
