# PHASE 2-G2 — SNIPPET-PRICE GUARD · IMPLEMENTED (local only)

**Date:** 2026-09-17 · **Status:** APPROVED WITH CONDITIONS → **IMPLEMENTED on `fix/g1-place-guard-attribution` @ `f25f542`, local only, flag OFF** · **Scope:** V3 only (Q4). No push, no deploy.

## Implementation report (read this first; §0–§6 below are the approved design)

| Owner condition | Delivered |
|---|---|
| Q1 R3′: cut only a clause that holds nothing but the price (+ hedge/connector); remainder = verified claims + G1 anti-fragment rules; counter `clause_cut` | `snippetPriceGuard.ts` → `priceClauseSpan` (parenthetical → comma segment → widest connector/punctuation-bounded clause whose residue is connector words only) + `standsAlone` (≥12 letters, balanced brackets, no dangling connective/punctuation, evidence-backed fact still present) + re-extraction proving no unsupported amount remains. Tests incl. the `"— 4.8⭐, "` shape. |
| Q2 lowercase `m` never money (v1+v2), documented residual, counter `lowercase_m_skipped` | `moneyGuard.ts` post-filter on the matched unit (`=== 'm'`), `extractMoneyClaimsDetailed`; `moneyGuardMetres.test.ts` pins metres, uppercase `M`, every other unit, and the residual "tầm 2m" (whole sentence survives). One existing fixture (`giá 7m` = 7e6) changed to `giá 7M` with a note. |
| Q3 band = entity evidence, fully inside, no tolerance; `/người` kept; evaluative words out of scope; **standalone parser module** | `src/lib/recommendation/priceBand.ts` (`parsePriceBand`, `bandFromStructuredRange` for Google rows, `bandFromRow`, `amountWithinBand`) + 12 parser tests; `streamEnrichment` collects `priceBandsByEntity` beside `ratingsByEntity`; pinned tests for `/người` and "giá rẻ". |
| Q4 V3 only; revisit a main hotfix if the V3 release slips beyond ~1 month | Noted here and in the G1 report §8.3. **Trigger: if V3 is not on production by ~2026-10-17, evaluate a main hotfix for the metre parse only** (main has no `price_range_text`, so the band half is moot there). |
| Tests first, offline replay, commit locally | New tests were run red before the code (16 red → green); replay `scripts/audit/g2Replay.audit.test.ts` rebuilds evidence from the runner's recorded tool rows — **no new LLM runs**. |

**Offline replay, 30 captured turns** (`docs/audit/g1/g2-replay-metrics.json`):

| Gate | v1 (flag OFF, at f25f542) | **v2 (flag ON)** |
|---|---|---|
| fabricated amounts surviving (inside no band, near no snippet price, not the user's number) | 0 | **0** |
| true rating/count sentences lost together with a price | 9 | **1** (no band and no snippet for that venue — nothing could support it) |
| sentences removed for a metre distance | 0 | **0** |
| fragments | 1 | **0** |
| replies ≤ 35 % | 0 | **0** |
| v2 vs v1 kept-ratio | — | **11 better · 19 equal · 0 worse** (min 0.358 → 0.659) |
| claims judged | — | 27: user echo 6 · supported by band 15 · by snippet 2 · unsupported 4 · clause cuts 2 · sentences removed 2 · metre skips 2 · comparison sentences 3 |

Four attribution defects the replay exposed were fixed in `placeAttribution.ts` (they affect G1 and G2 alike; G1 replay re-run: still 0 fragments / 0 ≤35 % / 0 fabricated, min ratio 0.541 → 0.65): identity levels judged together; an alias must be batch-unique **and** carry a token no other venue's name has ("Landmark 81", "Thư Giãn" were aliases); a house number opens a name segment; a comparison naming one venue by name and another by its distinctive token is about neither; **NFD provider names are composed before tokenising** — Serper delivers some names decomposed and the `\p{L}` split cut "Giãn" into "gia" + "n".

Test totals: `lib/ai` + `lib/links` + `lib/config` + `lib/recommendation` + `scripts/audit`: **143 files, 3 459 tests pass**; full `app` project 11 328 pass with the one pre-existing `crossPlatformParity` failure (untouched files); `tsc` clean.

Owner remarks 1–5 status: (1) release-note + post-merge re-measure — still to do at merge; (2) pinned; (3) enforced by `standsAlone`; (4) pinned; (5) done.

**STOP.** Not pushed, not deployed.

---

Same method as G1: flag, tests first, offline replay on captured text, STOP before deploy.

## 0. What was measured (V3 capture, 30 turns, 2026-09-17)

`guardSnippetPricesInText` (stage `travelGuarded → snippetGuarded`) removed 10–68 % of the body on **14/30** turns. It removed **17 price-bearing sentences**. Cross-checked against the Serper rows the runner recorded for the same turns:

| Removed price sentence … | count |
|---|---|
| states the venue's own **`price_range_text`** band verbatim ("giá khoảng 100-200k" ← row `100-200 N ₫`) | **13** |
| names two venues; the band belongs to the second one (my crude matcher pinned it on the first) | 1 (likely 14) |
| the row carries no band (run 1, 5-cafe query) | 3 |
| a **distance** ("cách bạn chỉ 100m") parsed as **100 000 000 ₫** — both recommendation paragraphs deleted | 1 turn (run 2 #11) |

So the premise in the G1 report ("the model invents price ranges") was **wrong**: the model copies the card's own price band, and the guard deletes it because its evidence pool is blind to that field. It is the `rating_value` defect (G1-F1) again, one field over. Collateral: the decision sentence — with its true rating and review count — goes with the price (R3 whole-sentence policy).

### On `origin/main`
- `moneyGuard.ts` is **byte-identical** on main and V3 (`git diff origin/main..HEAD` empty) → the metre-as-million parse exists on main by code (`UNIT_ALT` has `M` under the `i` flag; `SCALE.m = 1e6`).
- Not observed in the 12-run production baseline: main's replies (OSM-only, no `distance_km`, no `price_range_text`) contained **0 metre distances**; the 3 replies with prices were user echoes ("dưới 500k") or snippet-supported → 0 removals. Main's `snippetPriceGuard.ts` lacks the 86-line entity scope V3 added, otherwise same chain.
- Conclusion: **both defects are latent on main and active on V3**, because V3's Serper rows give the model bands and distances to copy.

## 1. Root causes

| # | Cause | Where |
|---|---|---|
| R1 | **Evidence blind to `price_range_text`.** `snippetPrices` / `snippetPricesByEntity` are built only from `price_search_results` snippets (present in 5/31 tool results); the row's own band — a `structured_provider` claim the entity already carries as `pricing.priceRangeText` and the card renders — never reaches the guard. | `streamEnrichment.ts` ~L1660 |
| R2 | **`M` is case-insensitive** in `UNIT_ALT` → `100m`, `300 m` = 100/300 million ₫. Any GPS-distance reply is a money claim with no evidence. | `moneyGuard.ts` `UNIT_ALT`/`SCALE` |
| R3 | **Policy R3 removes the whole sentence** for one unsupported amount, so an evidence-backed rating/count/hours in the same sentence is lost. R3 was locked to stop dangling connectives; G1 now has the coherence machinery that makes a clause-level cut safe. | `moneyGuard.ts` `redactUnsupportedClaims` |

## 2. Design (flag `SNIPPET_PRICE_GUARD_V2`, default OFF; v1 path byte-identical)

### 2.1 Evidence — parse the provider band (R1)
`parsePriceBand(text) → { lo, hi, open: 'above' | 'below' | null } | null`, Serper/Google formats seen in the capture:

| Row text | Band |
|---|---|
| `100-200 N ₫` · `200-600 N ₫` | 100 000 – 200 000 · 200 000 – 600 000 |
| `1-100.000 ₫` | ≤ 100 000 (`open: 'below'`; the leading `1` is the documented placeholder, ignored — `serperPlaces.ts` L305) |
| `Trên 1 Tr ₫` | ≥ 1 000 000 (`open: 'above'`) |
| `1-2 Tr ₫` | 1 000 000 – 2 000 000 |
| anything else | `null` → no evidence (fail-closed, as today) |

Collected next to `ratingsByEntity` in the same row loop: `priceBandsByEntity: Map<rowName, Band>`; the band's `lo`/`hi` also join the area pool. Provenance is unchanged (`structured_provider`) — this is not new evidence, it is evidence the guard could not read.

### 2.2 Verification against a band
A stated claim `[lo, hi]` (single amount ⇒ `lo = hi`) attributed to venue *V* is supported when:
- `V` has a band and `lo ≥ band.lo × 0.95` and `hi ≤ band.hi × 1.05` (open sides unbounded); a single amount inside the band counts (the provider's band contains it);
- "dưới X" ⇒ `X ≈ band.hi`; "trên X" ⇒ `X ≈ band.lo`;
- otherwise the existing snippet-price rule (`near` against entity snippet prices, then area evidence for unattributed sentences).
Attribution reuses G1: `attributePlace` (identity ladder) + paragraph anaphora + `placesNamedIn` for comparison sentences (each amount checked against the union of the named venues' bands). User echoes stay VERIFIED.

### 2.3 Metres are never money (R2)
Post-filter in `extractMoneyClaims`: a claim whose matched unit is **exactly the lowercase letter `m`** is dropped. Uppercase `M` stays 1 000 000 (existing tests `tầm 7-8M`, `11.8–14.7M VND` unchanged). Implemented as a string comparison on the captured unit (`unit === 'm'`), **not** as a regex change — the `i`-flag/`\p{Lu}` trap the "đồng" memory records cannot bite a `===`. `UNIT_ALT` itself is not edited. Applies to v1 and v2 (removes nothing that was ever a price).
- Residual, accepted and pinned in a test: chat slang "tầm 2m" (= 2 triệu) becomes invisible to the guard (fail-open). "2tr", "2 triệu", "2M" remain visible.
- Rejected alternative: distance-context word lists ("cách", "đi bộ") — the "đồng" incident showed context lists are what silently fail.

### 2.4 R3′ — clause first, sentence when the clause cannot be cut (v2 only)
When a sentence carries an unsupported amount **and** at least one attributed, evidence-backed non-money fact (rating / review count / hours / distance), remove only the price clause:
1. the parenthetical that contains the amount, e.g. `(4.9⭐, 200-600k/người)` → `(4.9⭐)`; `(100-300k)` → gone;
2. else the comma/dash clause that contains it, with its connector (`, giá khoảng 100-200k` · `— giá hợp lý (…)` · `với giá mềm hơn (100-200k)`), plus the hedge (`HEDGE_BEFORE`);
3. the remainder must stand alone: ≥ 12 letters, balanced brackets, no leading/trailing connective or punctuation (the G1 `opensBadly` test); otherwise fall back to the whole sentence as today.
Telemetry (counts only): `tappyai_guard{guard:'snippet_price', v2, claims, supported_by_band, supported_by_snippet, user_echo, unsupported, trims, sentences_removed, metre_skips}`.

### 2.5 Not changed
- The prompt (the model was copying the card, not inventing).
- Money guard for shopping (`guardMoneyClaimsInText`) — untouched except the shared metre filter.
- R3 for sentences with **no** evidence-backed fact beside the price — whole sentence, as locked.

## 3. Tests first (red → green), fixtures from the capture
1. `parsePriceBand`: the five formats above + garbage → null; placeholder `1-` ignored.
2. Metres: `cách bạn chỉ 100m`, `300 m`, `1.2 km` → 0 claims; `tầm 7-8M`, `2 triệu`, `500k`, `40.000 đồng/tô` unchanged (68 existing money tests stay green); residual `tầm 2m` pinned as invisible.
3. Band verification: `giá khoảng 100-200k` vs row `100-200 N ₫` kept; `dưới 100k` vs `1-100.000 ₫` kept; `trên 1 triệu` vs `Trên 1 Tr ₫` kept; `500k-1tr` vs `100-200 N ₫` removed; unattributed price with no band/snippet removed.
4. R3′: `Ngoài ra còn **BÒ TƠ QUÁN MỘC** (4.9⭐, 200-400k/người) …` with a wrong band → keeps `(4.9⭐)`; sentence with only a price → whole sentence; trimmed remainder that would dangle → whole sentence.
5. v1 byte-identical with the flag off (except the metre filter, which is tested on both).
6. Stream test through `applyPlaceEnrichmentStreamFilter` with a `price_range_text` row (like `placeClaimRatingEvidence.test.ts`).

## 4. Acceptance — offline replay, no new LLM runs needed
The existing captures already hold the guard input (`stages.travelGuarded`), `userText`, `placeNames`, and the runner recorded every tool result (rows with `price_range_text`, and `price_search_results` where present). `g2Replay.audit.test.ts` reconstructs `snippetPrices`, `snippetPricesByEntity` and `priceBandsByEntity` from `run1.json`/`run2.json` and replays v1 vs v2 on the 30 turns. Gates:
- **0 fabricated prices surviving** (fabricated = matches no band of any venue, no snippet price, not a user echo);
- **0 true ratings/counts removed together with a price** (every sentence whose rating matched the row in G1 replay must survive G2 v2);
- **0 sentences removed for a metre distance**;
- 0 fragments, 0 replies ≤ 35 % (G1 detector);
- v2 ≥ v1 kept-ratio on every turn.
Secondary (owner call): 36-run re-run with `PLACE_GUARD_ATTRIBUTION_V2=1` + `SNIPPET_PRICE_GUARD_V2=1` on the audit server, memory cleared.

## 5. Decisions needed before implementation
- **Q1** R3′ (clause-first when an evidence-backed fact shares the sentence) changes a policy the owner locked in C3-B.10.2 — approve under the flag?
- **Q2** "lowercase `m` is never money" with the `tầm 2m` residual — approve?
- **Q3** Treat `price_range_text` as entity-level price evidence (it is already `structured_provider` on the entity) — approve?
- **Q4** Ship G2 with the V3 stack only (main has the latent code but no exposure) — confirm.

## 6. Owner remarks (2026-09-17) folded into the design

1. **Always-on v1 changes (G1 F1–F4)** accepted; must appear in the release note and be re-measured after merge → added to §4 secondary gate: post-merge 12-turn measurement, flag OFF, same metrics.
2. **Lowercase `m`**: "2m"/"5m" = 2/5 triệu is real user slang; when the model echoes it the price passes unchecked. Accepted as a known case, **pinned in a test and documented** (§2.3 residual) — and the pin must assert the whole sentence survives, so a future "fix" that starts deleting it is visible.
3. **R3′ must re-run the G1 anti-fragment rules** on the trimmed sentence: `opensBadly`, no trailing connective/punctuation (`"Mình chọn X — 4.8⭐, "` is a failure), balanced brackets, ≥ 12 letters; else whole sentence. §2.4 step 3 is now normative, with a test for the exact `— 4.8⭐, ` shape.
4. **Embellished bands**: the provider says `100-200 N ₫`; the model writes `100-200k/người` or `giá rẻ`. Decision to encode in a test: the **amount** is verified against the band; a unit-of-account suffix (`/người`, `/phần`, `/tô`) is neither in the data nor a separate claim → **kept** (it is how the band is read); a **judgement** word (`rẻ`, `hợp lý`, `mềm`) is not a money claim (no amount) and is outside this guard — noted so nobody expects G2 to remove it.
5. Replay-based acceptance without new LLM runs confirmed as the primary gate.

**STOP** — no code written for G2.
