# Phase 8 M5: semantic recommendation authority (TAPPY_AGENT=2, web only)

Branch `p8/agent-runtime` (worktree `wtagent8`), base `a1d9cee` (M4). Committed locally, not pushed. Audit: `M5-SEMANTIC-RANKING-AUDIT.md`.

## 1. Current ranking audit (summary)

On the agent path every place / hotel / product result passed through the Consultative ranker **before Luna read it**
(`route.ts rankForModel` → `rank.ts rankCandidates` → `pick.ts derivePick`). Measured on the M4 eval:

- the rows were reordered by a weighted score;
- shopping was trimmed to the score's top 6 (Luna never saw the rest);
- `_tappy_ranking` (the engine's winner) and `_tappy_synthesis` (its "recommendation") reached Luna;
- the shopping card's "recommended" was the engine's winner;
- place cards were filled from row order.

Full component table: `M5-SEMANTIC-RANKING-AUDIT.md`. Legacy (production) and Phase 7 (`TAPPY_AGENT=1`) are unchanged by M5.

## 2. Old deterministic scoring paths

| Path | Formula | M5 on agent v2 |
|---|---|---|
| `rankCandidates` score | `BASE {rating 1.0, reviews 0.3, distance 0.5, price 0.5, stars 0.4, directPage 0.4, eta 0.5, wifi / outdoor / vegetarian 0.2, cuisine 0.3}` + priority weights; balanced / extreme min–max; tie chain | not used |
| `derivePick` / `_tappy_ranking` / `_tappy_brief` | winner by score margin | none |
| `shortlistCandidates` / `_tappy_shortlist` (`best_overall` …) | score top 1–3 / 5 | none |
| `shortlistShopping` | score top 6 | provider order, size cap 10 |
| row reorder in `rankForModel` | score order | provider order |
| shopping synthesis "recommendation", card `recommended` | the Pick | Luna's ranking |
| card fold filler, `renderedFoldNames`, emphasis re-homing with a fixed rating / reviews / distance reason | row order / fixed reasons | Luna's order and reason; no filler |

There is no replacement formula. Nothing in M5 computes a score.

## 3. Hard-constraint boundary (code)

Kept and applied deterministically before Luna reads the rows:
- the place-type / activity gates;
- shopping validity (wrong product, hard budget on a point price);
- the hard-constraint gate;
- the constraint filter: a band entirely above a hard budget, an explicit type exclusion, the district the user named, closed rows last;
- the ranker's `hardFilter` must-have / avoid contradictions: **on agent v2 its verdict now REMOVES the row from what Luna reads.**
  Before M5 it only left the ranked set, and the row stayed in the results.

Changed on agent v2:
- **Places / hotels budget:** a band that overlaps a hard budget is ambiguous, so it stays for Luna; only a band entirely above it, or
  a point price over it, is removed. The ranker's upper-bound test would remove overlapping bands and missed open bands ("Trên 1 Tr").
- **Soft → hard conversions removed:**
  - "rẻ tiền / bình dân / quán nhỏ / vỉa hè / cheap" no longer drops restaurants; only "không nhà hàng / toàn nhà hàng" does;
  - an "around" budget (khoảng / tầm) no longer acts as a ceiling in the row filter.
- **No silent relaxation:** a stated hard budget / district is never relaxed by code (`relaxEmptyPlaces` is off on agent v2). Nothing
  fits → the honest no-result path, and Luna offers to widen it.

## 4. Luna semantic authority

- Luna reads the valid set in **provider order** with a note that this is not a ranking (`_tappy_order_note`).
- Prompt section "CHỌN VÀ XẾP HẠNG": weigh trade-offs for the user's real need; no fixed formula; soft preferences are not filters;
  re-rank when the priority changes; recommend 1, 2 or 3, never padded; say "none" and offer to widen.
- The cards render Luna's choice (§7). Code only validates.

## 5. Soft preference handling

Soft wishes (yên tĩnh, đáng tiền, hợp cặp đôi, ít khách du lịch, rẻ nhưng đáng tiền…) never remove a row and never become weights.
Tests: "rẻ tiền" keeps the upscale venue on agent v2; agent1 still drops it, confirming the change is isolated. "Khoảng 200k" drops nothing.

## 6. Trade-off examples (live eval, real Luna)

- **SR-F1** ("chỗ yên tĩnh ngồi làm việc 3 tiếng, có ổ điện"): Luna ranked a dedicated coworking space first. The card's
  "Vì sao" is Luna's own "Không gian chuyên cho làm việc và học tập", not "rated 4.x".
- **SR-T1** (hotel near Mỹ Khê, walk to the beach over cheapest): Luna ranked the hotel on Võ Nguyên Giáp first and wrote "đánh đổi
  là điểm đánh giá 3.6⭐"; card reason "ưu tiên đi bộ ra biển".
- **SR-G1** (quiet → "thật ra gần biển hơn"): turn 3 re-ranks for the beach and does not repeat the previous picks.
- **SR-G3** (Michelin under 50k): an honest "none" with an offer to widen the budget; no recommended card.
- Route test, scripted: lower-rated, closer, quiet café over the 4.9⭐ garden café that the old formula ranks first.
- Route test, scripted: follow-up re-rank; turn 2 sees "Lựa chọn đang đề xuất: <Luna's turn-1 pick>".

## 7. Ranking contract

One machine line at the end of a recommendation, removed before any guard runs and never shown to the user:

```
[TAPPY_RANK]{"picks":[{"name":"…","why":"…","tradeoff":"…"}],"none":false,"confidence":"high|medium|low"}[/TAPPY_RANK]
```

- **picks:** only the candidates Luna recommends, in its order. Optional `fits` and `refs` (S#) are carried for the trace.
- **No score field exists.**
- **Validation:**
  - names must match a candidate the tools returned this turn (exact, or one unambiguous containment); unknown names are dropped, never guessed;
  - text is capped, de-linked, and secret- and instruction-filtered;
  - card reasons must be qualitative (figures stay in the prose, where the M4 guards check them).
- **Applied to:**
  - place / hotel cards: only the ranked candidates, the first one recommended, Luna's reason and trade-off;
  - the shopping card: re-ordered, Luna's pick recommended; it is no longer sent early in provider order;
  - the saved card order (the next turn's "current pick").
- **"none":** no card.
- **No line:** the cards are only the venues Luna named, with **no** recommendation badge (a bold name may be a rejection, as measured
  on SR-G3), and never filler.
- The tags are matched tolerantly (`[ TAPPY_RANK ]`, any case); a stray fragment is removed with its line. This was measured: a spaced
  tag leaked on 2 turns before the fix.

## 8. Files changed

| File | Change |
|---|---|
| `src/lib/ai/agent/runtime/candidateSet.ts` (new) | hard constraints only, provider order, size cap, order note |
| `src/lib/ai/agent/runtime/rankingContract.ts` (new) | parse / strip / validate the line; apply to place cards and the shopping card |
| `src/app/api/chat/route.ts` | agent-v2 branch in `rankForModel`; explicit-only exclusions; no relaxation; flags and trace wiring |
| `src/lib/ai/streamEnrichment.ts` | apply the line before guards; card emphasis, fold and saved order follow Luna; named-only fallback; shopping card after the reply |
| `src/lib/ai/placeConstraintFilter.ts` | `explicitOnly`: cheapness words and "around" budgets stay soft |
| `src/lib/ai/consultative/rank.ts` | `hardFilter` exported (unchanged logic) |
| `src/lib/ai/agent/runtime/prompt.ts` | `RANKING_SECTION` |
| `src/lib/ai/toolResultSplit.ts`, `trace.ts` | `semanticRanking`, `rankingTrace`, trace kind `ranking` |
| eval | M5 checks (`ranking_contract`, `no_forced_top_n`, `none_honest`, `hard_budget_cards`, `tradeoff_reasoning`, `no_rank_leak`) + 11 `SR-*` scenarios |
| tests | `semanticRanking.test.ts` (25), `agentSemanticRanking.route.test.ts` (11, real route), `checks.test.ts` (+4) |
| `scripts/repoHygiene.test.ts` | recording ceiling 2868 → 3179 (M5 eval recordings, deliberate) |

No architecture-locking test changed.

## 9. Tests (Step 15 mapping)

| # | Requirement | Covered by |
|---|---|---|
| 1 | hard budget | unit + route |
| 2 | hard location / district | unit |
| 3 | soft preference not a filter ("rẻ tiền", "khoảng") | unit + route + agent1 contrast |
| 4 / 5 | pricier / lower-rated candidate ranked first by Luna | unit + route |
| 6 | old formula decides nothing | the regression pins `rankCandidates` choosing the 4.9⭐ café while agent v2 keeps provider order with no Pick (route test with V1 on and off) |
| 7 | no forced top-N | covered |
| 8 | "none" | covered |
| 9 / 10 | follow-up re-rank + previous context | route, two turns |
| 11 | evidence reaches Luna | rows keep rating / reviews / distance / price / hours; research page text reaches the ranking step |
| 12 | M4 citations intact next to the line | covered |
| 13 | research before ranking | covered |
| 14 | hard constraints deterministic whatever the line says | covered |
| 15 | card / shopping does not re-rank | covered |

Also covered: line leak variants, no relaxation, a band overlapping the budget.

## 10. Mutation results

22 mutations, **all caught**:

| # | M5 fix removed | Failing tests |
|---|---|---|
| M1 | old formula back (agent branch removed) | 2 |
| M2 | provider-order model copy | 1 |
| M3 | cheapness words exclude | 1 |
| M4 | "around" budget hard | 1 |
| M5 | relaxation | 1 |
| M6 | hard constraints not applied | 3 |
| M7 | upper-bound band rule | 4 |
| M8 | size cap | 1 |
| M9 | line ignored | 5 |
| M10 | emphasis re-homed to prose order | 2 |
| M11 | shopping card sent early | 1 |
| M12 | saved order from prose | 1 |
| M13 | figures in card reasons | 1 |
| M14 | prompt section removed | 1 |
| M15 | filler after ranked | 5 |
| M16 | "none" shows cards | 1 |
| M17 | ambiguous names guessed | 1 |
| M18 | instruction-like rationale | 1 |
| M19 | filler without a line | 2 |
| M20 | exact-spelling tags only | 1 |
| M21 | stray tag lines kept | 1 |
| M22 | recommendation inferred without a line | 1 |

Search for hidden ranking paths after the change:
- On agent v2, `rankForModel` returns before scoring.
- `turnPick` is never set, so there is no `_tappy_ranking`, no evidence freeze from a Pick, and no engine sentence backstop.
- `consultTop` / `CONSULT_BRIEF` do not run on agent turns.
- `placesRenderOrder` orders by Luna's `shortlistPosition`.
- `ccp/ranking` orders commerce links within one entity (not candidate choice).
- `/api/recommendations` / Explore feed ranking is not the chat runtime.

## 11. M3 regression (research set, final code)

| Check | M5 final | Notes |
|---|---|---|
| page read when needed | 6/6 | |
| official source used | 4/4 | |
| sources cited | 5/5 | |
| conflict explained | pass | |
| seller claim UNKNOWN | pass | |
| turns passing every check | 7/9 | |
| RS-D1 `conflict_detected` | 0 | the ledger built no numeric conflict this run (M3 extraction variance); Luna still explained the disagreement |
| RS-C1 coverage | miss | see below |

Two earlier M5 runs on intermediate code scored 7/9 and 8/9.

RS-C1: in the M5 runs Luna wrote the Hội An price **without a `[S#]` citation**, so M4 correctly treats it as uncited and the travel
guard applies.

## 12. M4 regression

- The M4 suite (`guardEvidence.test.ts`, 38) is green.
- The M4 shield runs after the ranking line is removed (test 12).
- No guard stage changed because of M5.

## 13. M5 eval results (11 scenarios, 14 turns, 2 runs, final code)

| | run 1 | run 2 |
|---|---|---|
| turns passing every check | **14/14** | 11/14 |
| `no_rank_leak` | 14/14 | 14/14 |
| `ranking_contract` (applied) | 2/2 | 2/2 |
| `no_forced_top_n` | 6/6 | 4/4 |
| `hard_budget_cards` | 2/2 | 2/2 |
| `tradeoff_reasoning` | 11/11 | 10/11 |
| `task_continuity` / `no_reask` | 2/2 · 2/2 | 2/2 · 2/2 |
| `none_honest` | 1/1 | 0/1 |
| `practical_coverage` (incl. proactive Activation Lock / MDM) | 2/2 | 1/2 |

Run 2 misses:
- **SR-G3:** the checker's phrase list missed "chưa tìm thấy". The behaviour was right (honest none, no recommended card); the list is fixed.
- **SR-F2:** quality cue wording.
- **SR-S1:** Luna answered "no listing with a confirmed battery state" without the Activation Lock / MDM checklist.

Ranking line usage over the two M5 runs: written on 14 of 28 turns, malformed once (handled, no leak). The other turns had no
tool candidates, or were "none" or knowledge answers.

## 14. Latency and cost

| | M4 final | M5 final |
|---|---|---|
| regression (53) p50 / p90 / max | 5.43 / 11.26 / 20.26 s | **5.21 / 11.86 / 17.82 s** |
| regression model rounds mean / max | 1.81 / 5 | 1.74 / 3 |
| regression cost / turn | $0.0039 | $0.0038 |
| model time per round, p50 | 2.22 s | 2.22 s |
| M5 set (28 turns) p50 / p90 | — | 7.38 / 14.51 s, rounds 1.93, $0.0068 / turn |
| research set (9) p50 / p90 | 7.69 / 18.84 s | 8.41 / 20.55 s (one 4-round turn) |

- The ranking line adds about 10 output tokens on average (≈ 60–100 on recommendation turns).
- Turns where Luna's ranking now produces cards pay the existing card enrichment (photos / TikTok, 1–4 s post-model).
- No extra model call; reasoning was not reduced.

## 15. Remaining risks

1. **Luna does not always write the line** (14 of 28 recommendation-set turns). Without it the cards are the named venues with no
   badge: honest, but there is no "Vì sao". A prompt or format nudge, or a structured final step, could raise usage.
2. **Pre-existing guard over-cuts on agent prose** (not M5):
   - SR-F2: `snippet_price` removed the pick sentence carrying the row's own price band "100–200k";
   - SR-T1: a guard cut a list item, leaving "2." in the prose.

   The cards still show Luna's choice. **Follow-up:** the provider row band should count as evidence for the snippet guard on agent turns.
3. **Citation discipline varies** (RS-C1 uncited price): M4 deliberately protects only cited claims.
4. **Hotels' price data is thin** (most rows unpriced): the hard budget can only remove what carries a price; the rest is said to be unverified.
5. The shopping card now waits for the reply (no early card). The decision card appears at the end, which is a little later than before on shopping turns.
6. The preliminary place fold (provider order, marked preliminary, no pick) still appears while Luna works; the final cards replace it.

## 16. Confirmation

- **Android: NOT TOUCHED.**
- **iOS: NOT TOUCHED.**
- **Production: NOT MODIFIED.** No environment variables changed anywhere; TAPPY_AGENT=2 stays dev / eval only.
- **M6 / M7: NOT STARTED.**
- No push. Committed locally only.
