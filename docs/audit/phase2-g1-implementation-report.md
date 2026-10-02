# PHASE 2-G1 — IMPLEMENTATION REPORT (V3)

**Date:** 2026-09-17 · **Status:** IMPLEMENTED ON V3, LOCAL ONLY — NOT PUSHED, NOT DEPLOYED · **Owner gate:** STOP before any deploy

Branch `fix/g1-place-guard-attribution` (worktree `.claude/worktrees/g1-place-guard`), five commits on top of `design/v3-phase4` @ `f6712b8`:

| Commit | What |
|---|---|
| `c07e98b` | G1 attribution ladder + L5 + coherence pass + telemetry + G1b fallback, behind `PLACE_GUARD_ATTRIBUTION_V2` (default OFF) |
| `009faff` | evidence collector reads `rating_value` — the rating evidence was EMPTY on every real turn (finding F1) |
| `71bc560` | guard never judges machine payload — Maps `cid` digits were deleting the model's CTA block on 11/15 turns (finding F2) |
| `9a45f8e` | G1b fallback inserted before the markers; numeric checks run on a trimmed sentence; replay tooling |
| `348ec82` | replay findings: comparison sentences, phone digit boundaries, phone identity, no text rewrite |

Flag: `PLACE_GUARD_ATTRIBUTION_V2=1|true` → v2. Unset/anything else → v1. Read at call time (`placeGuardAttributionV2Enabled()` in `src/lib/config/product.ts`).

---

## 1. Design as implemented (approved design + the 8 owner adjustments)

| Owner adjustment | Where | Status |
|---|---|---|
| L4: name ≥3 tokens OR ≥1 non-common token, else skip | `placeAttribution.ts` → `attributePlace` L4 | ✅ (`COMMON_TOKENS` = STOPWORDS + category/city words) |
| L2/L2′: alias ≥2 non-stop-word tokens | `aliasesOf` | ✅ implemented as ≥2 **non-common** tokens — stricter, because the owner's own examples ("QUÁN ĂN NGON", "Cafe Sài Gòn") are made of category/city words that STOPWORDS alone does not cover; test pins both |
| L5: review-count match required; verifies only score/review-count | `placeClaimGuard.ts` → `placeByNumbers` | ✅ exact integer match on the count (5 % `near` let 3.571 stand for 3.516 — two spas, both 4.9★) |
| Separate telemetry counters for cascade and G1b | `PlaceClaimStats.reasons.cascade`; `tappyai_guard` / `place_claim_fallback` log lines | ✅ counts only, no user text, no venue names |
| G1b: card-field data only; never "đang mở"; "giờ mở cửa theo Google Maps: …" | `streamEnrichment.ts` → `fallbackSentence()` | ✅ name / rating / review count / `opening_hours` row field only |
| G1b: Vietnamese unless confidently English | same | ✅ `lang === 'en'` AND English function words AND no Vietnamese diacritics |
| Acceptance = offline replay old vs new on captured pre-guard text (audit env) | `scripts/audit/g1Replay.audit.test.ts` | ✅ §3 |
| Flag default OFF in production; implement, test, report, STOP | — | ✅ nothing pushed, nothing deployed |

Additions the replay forced (all inside the same guard, all measured — §2):
- v2 reads `4.9⭐` / `★` as a stated score (`SCORE_RE_V2`); v1 never did, which is why F1 stayed invisible.
- A sentence naming **several** venues by identity is a comparison: each number is checked against the union of those venues' evidence (`placesNamedIn`, counter `attribution.multi`).
- A phone that is exactly one venue's own identifies that venue (number identity, like L5).
- v2 last resort: when every sentence is an unsupported claim the guard returns the emptied body (G1b fills it) instead of handing the claims back.

## 2. Findings from the capture that are NOT the attribution ladder (pre-existing, V3, flag-independent)

| # | Finding | Evidence | Fixed in |
|---|---|---|---|
| **F1** | **Rating evidence was always empty.** Rows carry `rating_value`; the collector read `row.rating ?? row.google_rating` (a formatted string) → `ratingsByEntity = {}` on 15/15 captured turns while `reviewCountsByEntity` was full. v1 hid it (never read "⭐"); v2 would have deleted every true rating. | `preguard-v3-run1.jsonl`, `placeClaimRatingEvidence.test.ts` (red without the fix) | `009faff` (v1 effect: a true "4.9 sao" now survives; fabricated still removed) |
| **F2** | **The model's CTA block was being deleted by the place guard.** Maps `?cid=3700468258469518959` contains "0468258469" → PHONE_RE → no venue owns it → the whole `[CTA_BUTTONS]` span doomed. 11/15 turns in run 1; buttons reached the user on 4/15 (7/30 in the earlier 36-turn baseline). | `g1-replay-metrics.cta`, `placeClaimGuardMachineSpans.test.ts` | `71bc560` (v1 and v2 — it removes nothing that was ever a claim) |
| **F3** | PHONE_RE read `300.000-500.000` (a price range) as a phone from its 2nd character; two sentences deleted. | run 2 #14 | `348ec82` |
| **F4** | A trimmed sentence skipped the numeric checks: "Quán này 3.1 sao, hơn 99.999 đánh giá, giao hàng tận nơi." kept its invented numbers once the delivery clause was cut. | `placeClaimFallback.test.ts` | `9a45f8e` (v1 and v2) |
| **F5** | **Snippet-price guard is now the dominant truncation source on V3.** It removed 10–68 % of the body on 14/30 turns. 13/14: the model appended an *invented price range* ("giá hợp lý (200-600k)") to its decision sentence and R3 whole-sentence removal took the decision sentence — with its true rating/count — along. 1/14: `extractMoneyClaims` reads **"100m"/"300m" (metres) as 100 000 000 ₫** and deleted both recommendation paragraphs of "quán cafe chill gần đây". | stage diff `travelGuarded → snippetGuarded` in both captures; probe reproduced offline | **NOT fixed — outside G1 (moneyGuard `UNIT_ALT`, memory flags it as trap-laden). Recommend G2.** |
| F6 | Upstream guards leave a whitespace-only paragraph (`\n\n \n\n`) when they empty a paragraph. Harmless in markdown; noted. | run 2 #11 | not fixed (cosmetic, outside G1) |

## 3. Acceptance — offline replay (audit env only, flag OFF on the server)

Capture: uncommitted hook in the AUDIT worktree only (`docs/audit/g1/audit-capture-hook.patch`, never committed), 2 × 18 turns = **36 LLM runs**, `AUDIT_SURFACE=web`, audit user's memory cleared before run 1, server restarted between runs. Run 1 on `c07e98b` (pre-F1, `ratingsByEntity` rebuilt offline from the runner's recorded tool rows for 13/15 records), run 2 on `009faff`. All 36 turns HTTP 200. Both runs' final replies are in `docs/audit/g1/v3-g1-run{1,2}.json`; replay output in `g1-replay.json` / `g1-replay-metrics.json`.

Replay = the exact guard input (`foodGuarded`) and evidence the server saw, through the guard at `348ec82` with v1 and v2; v2 column includes the mirrored G1b sentence. 28 turns reached the place guard.

| Metric (28 guarded turns) | v1 (flag OFF, at 348ec82) | **v2 (flag ON)** | Gate |
|---|---|---|---|
| Fragments (paragraph that cannot stand after a deletion) | 1 turn | **0 turns** | (b) 0 ✅ |
| Replies ≤ 35 % of model text | 0 | **0** (min 0.541) | (b) ✅ |
| Fabricated numbers in inputs surviving | 0 / 2 | **0 / 2** | (b) ✅ |
| Median kept ratio (letters out / in) | 0.951 | **1.0** | — |
| Turns where v2 kept more / less / same than v1 | — | **10 / 0 / 18** | — |
| CTA block kept (27 inputs had one) | 27 | **27** | (server during the runs, pre-F2: 5) |
| Pick attributable when a pick existed | — | **20 / 20** | — |
| Attribution levels used | — | L1 45 · L2 8 · L2′ 6 · L3 2 · L4 2 · L5 5 · anaphora 7 · multi 1 | — |
| Removal reasons (v2) | — | quality 1 · ordering 3 · score 2 · review_count 2 · phone 1 · cascade 0 | — |
| G1b fallback fired | — | 1 turn (run 2 #11 — body emptied upstream by F5, not by this guard) | — |

Server-side truth during the runs (flag OFF, before F1/F2 fixes): kept ratio per turn 0.43 … 1.0 (median 0.77); CTA reached the user on 5/28. The replay v1 column is what v1 does **after** F1–F4, so the honest "old vs new" is: server-run → v2 replay.

What v2 removed and why (7 turns): 3 booking/delivery claims with no direct ordering evidence (pre-existing rule, kept), 2 fabricated scores, 2 review counts that matched no venue, 1 phone that was another venue's — every one of them a claim the evidence could not support; none is a decision sentence.

### (c) Existing guard tests
- `src/lib/ai` + `src/lib/links` + `src/lib/config`: **122 files, 3 051 tests passed**, 44 skipped.
- Full `app` project (at `9a45f8e`): 11 274 passed, **1 pre-existing failure** unrelated to G1 — `src/lib/structuredContent/crossPlatformParity.test.ts` "no fourth attribute": a *comment* in `comparisonFromSynthesis.ts` contains the word "cheapest"; G1 touches none of those files (`git diff --name-only f6712b8 HEAD` = 10 files, all under `lib/ai`, `lib/links`, `lib/config`, `scripts/audit`).
- `tsc -p tsconfig.json --noEmit`: clean.
- New tests: `placeClaimGuard.v2.test.ts` (28), `placeClaimRatingEvidence.test.ts` (3, red without F1), `placeClaimGuardMachineSpans.test.ts` (8, red without F2), `placeClaimFallback.test.ts` (5, drives the real stream filter).

## 4. Report-only: does V3 insert images/links mid-sentence (as on main)?

**Yes, on the mobile path.** `injectPlaceEnrichment` is identical on V3 and `main` (`boundaryAfter` inserts at the *next place mention*, snapped to line start only when that mention is on a later line). Re-running it offline on run 2's captured rows (mobile path = no `x-tappy-renders-decision-card` header): **69 blocks inserted, 13 of them mid-sentence, on 11/14 turns** — e.g. `…nếu bạn muốn không khí izakaya truyền thống, hoặc ⟨![Ảnh địa điểm](…)⟩ **KOHAKU RAMEN & UDON** (4.8⭐) nếu thích…`. On **web** V3 skips injection entirely when the decision card owns enrichment (`cardOwnsEnrichment`), so the web run itself showed no injection. Not fixed (report only).

## 5. Report-only: conflicts merging `origin/main` (@ `842379b`, incl. age gate PR #251) into V3

`origin/main` is 13 commits / 81 files ahead of the merge-base `f16a71f`; V3+G1 is 76 commits ahead. Dry run (`git merge --no-commit --no-ff`, then aborted): **10 conflicting files, 20 hunks**.

| File | main side | V3 side |
|---|---|---|
| `src/app/(home)/page.tsx` (2 hunks) | `126a7e1` age gating | `e661f17`/`e0692eb` V3 Home |
| `src/app/api/chat/route.ts` | `126a7e1` age gate, `08a6aed` discovery city | `24b9fb8` global quota, `a8fe280`/`4114341` Explore venue context |
| `src/app/api/reviews/upload/route.ts` | `126a7e1` | `32c48bf` |
| `src/app/chat/[id]/ChatConversation.tsx` | `126a7e1` | `a8fe280`, `f8dca88`, `2571380` |
| `src/app/login/page.tsx` | `2c9cd64` authenticate-then-age | `f6712b8`, `f8dca88` |
| `src/components/ChatInterface.tsx` | `126a7e1` | `24b9fb8`, `a8fe280`, `dba8996` |
| `src/lib/ai/tools/food.ts` (6 hunks) | `cc9ef8b` BUG-011 destination scope (#248) | `7f8eb0d` Serper-first, `f8dca88`, `c62b9bd` |
| `src/lib/ai/tools/placeDestinationScope.test.ts` | **both added** (`cc9ef8b` vs `7f8eb0d`) | — |
| `src/lib/http/apiErrorContract.test.ts` | `126a7e1` | `24b9fb8` |
| `src/lib/i18n/useTranslation.ts` (2 hunks) | `126a7e1` | `553daa7` |

Non-conflicting but relevant: main adds migrations `20260908_user_demographics_foundation.sql`, `20260911_user_memory_discovery_city.sql` (+ rollback), `/age-check`, `/onboarding`, `src/lib/account/ageEligibility*`, admin DOB correction. None of the G1 files (`placeClaimGuard.ts`, `placeAttribution.ts`, `streamEnrichment.ts`, `product.ts`) is touched by main → G1 merges clean; the `/api/chat/route.ts` conflict is quota-vs-age-gate, not G1. BUG-011 exists on both sides with different code (food.ts 6 hunks) — the riskiest resolution.

## 6. Owner reminders (unchanged, still open)
- Supabase Management token: revoke/downgrade (it is already unusable — `clearmem` had to switch to the non-prod project's own REST API).
- Rotate `ANTHROPIC_API_KEY` (create new → Vercel → redeploy → verify → delete old).
- Audit server :3101: **stopped** (port free).

## 7. What is NOT done / decisions for the owner
1. **F5 (snippet-price guard / metre-as-million)** is the biggest remaining truncation source on V3 and needs its own ticket (G2). Suggested shape: clause-level trim for the invented price instead of whole-sentence R3 when the sentence also carries an attributed, evidence-backed rating; and a unit fix for `\d+m` distances.
2. Secondary 36-run re-run **with the flag ON** on the server has not been executed (owner's plan lists it as secondary; the offline replay is the primary gate). It would cost 36 more LLM runs.
3. `PLACE_GUARD_ATTRIBUTION_V2` stays OFF everywhere; release still gated on the V3 stack (V3 RELEASE BLOCKER status unchanged).

---

## 8. Addendum (owner NEXT, 2026-09-17)

### 8.1 Erratum to F5
The premise "the model appends an *invented* price range" was wrong. Cross-checked against the rows the runner recorded: **13 of the 17** price sentences the snippet-price guard removed state the venue's own `price_range_text` band verbatim (row `100-200 N ₫` → "giá khoảng 100-200k"). The guard's evidence pool only reads `price_search_results` snippets, never the row's band — the same defect as F1, one field over. Design and measurements: [phase2-g2-snippet-price-guard-design.md](phase2-g2-snippet-price-guard-design.md).

### 8.2 Which G1-branch changes are behind `PLACE_GUARD_ATTRIBUTION_V2`, and which run regardless

Branch `fix/g1-place-guard-attribution` @ `609ff8a` (7 commits). "Always" = runs with the flag unset, i.e. changes v1 behaviour on V3 the moment the branch merges.

| Change | Gate | Effect on v1 (flag OFF) |
|---|---|---|
| Attribution ladder L1–L4 (`attributePlace`), L5 number identity, phone identity, comparison-sentence union pool (`placesNamedIn`), anaphora counter | **v2 only** | none |
| `SCORE_RE_V2` ("4.9⭐" is a stated score) | **v2 only** | none — v1 still ignores the glyph |
| Coherence pass (cascade), paragraph hygiene in `render`, v2 last resort (emptied body instead of handing claims back), `pick_attributable` | **v2 only** | none |
| G1b evidence-only fallback sentence + its log line | **v2 only** (`if (!guardV2 …) return null`) | none |
| Telemetry line `tappyai_guard{guard:'place_claim'}` | **always** (carries `v2:false`) | one console line per guarded turn, counts only |
| **`rating_value` evidence** (`009faff`) | **always** | a true "4.9 sao" copied from the card now survives; fabricated scores still removed |
| **Machine spans never judged; numbers read from prose only** (`71bc560`) — the Maps `cid`-as-phone CTA deletion | **always** | CTA/FOLLOWUPS blocks and links survive; removes nothing that was a claim |
| **PHONE_RE digit boundaries** (`300.000-500.000` is not a phone) | **always** | a price range no longer deletes its sentence as a phone |
| **Numeric checks run on a trimmed sentence** (a trim is not a verdict) | **always** | strictly more removal, only of fabricated numbers that used to survive next to a trimmed clause |
| Cascade ignores whitespace-only spans | v2 only (the pass itself is v2) | none |
| `placeGuardAttributionV2Enabled()` in `product.ts` | — | reads env at call time |
| `CLAUDE.md`, `.gitattributes` (`c92393b`, `609ff8a`) | — | tooling only |

So four things change v1: F1 (rating evidence), F2 (machine spans), F3 (phone boundaries), F4 (trim-then-verify). All four remove nothing that was ever a supported claim; F1 and F2 make v1 keep *more*. The 16 pre-existing guard tests and the 3 051 `lib/ai`+`lib/links`+`lib/config` tests pass with the flag off.

### 8.3 Do the metre-as-money parse and the snippet-price truncation exist on `origin/main`?
- **Metre parse: yes, by code.** `src/lib/ai/moneyGuard.ts` is byte-identical between `origin/main` (`842379b`) and V3; `UNIT_ALT` matches `M` under the `i` flag and `SCALE.m = 1e6`, so `100m` = 100 000 000 ₫ on main too. **Not observed** in the 12-run production baseline: main's replies are OSM-only (no `distance_km`, no `price_range_text`), and none of the 12 final replies or the 9 captured pre-guard texts contains a metre distance.
- **Snippet-price truncation: same chain, not observed.** Main calls `guardSnippetPricesInText(travelGuarded, snippetPrices, userText)` (no entity scope — V3 added 86 lines). In the production baseline 3 replies carried a price: all were user echoes ("dưới 500k") or snippet-supported → 0 removals. The exposure on V3 comes from the Serper rows (bands + distances the model copies), not from a code difference in the guard.

**STOP.** No push, no deploy, no PR.
