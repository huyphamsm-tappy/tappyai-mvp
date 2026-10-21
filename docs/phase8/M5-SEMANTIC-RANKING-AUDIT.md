# Phase 8 M5: semantic ranking, Step 0 audit

Branch `p8/agent-runtime` (worktree `wtagent8`), base `a1d9cee` (M4). **Web only.** Read-only audit; no code was changed for it.

## 1. How a recommendation is made today on the agent path (TAPPY_AGENT=2)

The Phase 8 runtime reuses the route's tools (`search_places`, `get_hotel_prices`, `search_products`). Each tool result passes
through `rankForModel` (`src/app/api/chat/route.ts` ≈ 1460–1690) **before Luna reads it**:

1. Hard gates: travel-agency rows, activity type, shopping validity (wrong product, over budget). `placeConstraintFilter` and
   `hardConstraintGate` run earlier, in the tool and in the `gateTools` wrapper.
2. `rankCandidates` (`consultative/rank.ts`): a `hardFilter`, then **a weighted score**. The defaults are
   `BASE = { rating 1.0, reviewCount 0.3, distance 0.5, price 0.5, stars 0.4, directPage 0.4, eta 0.5, wifi/outdoor/vegetarian
   0.2, cuisine 0.3 }`, plus the user's priority weight, or balanced / extreme min–max modes. The sort chain is score → reviews → name.
3. `derivePick` (`consultative/pick.ts`): the **engine's winner** ("Pick") with `decided_by` reasons and a runner-up.
4. What Luna and the user then receive:
   - **places / hotels:**
     - when Consultative V1 is not active, the rows are **reordered by the score** and `_tappy_shortlist` (roles such as `best_overall`) is attached;
     - `_tappy_ranking` (the Pick) rides the result unless the V1 "model chooses" trim removes it;
     - `_tappy_evidence_gap` is computed from the ranked entries.

     Measured in the M4 eval: `FU-G1 t2` reached Luna with `_tappy_shortlist` and score-ordered rows.
   - **shopping, always:**
     - rows **reordered by the score** and **trimmed to the engine's top N** (`shortlistShopping`), so Luna never sees the rest;
     - `_tappy_ranking` (the Pick);
     - `_tappy_synthesis` (grouping + "recommendation" = the Pick);
     - the `[TAPPY_SHOPPING]` card is built with `recommended` = the Pick.

     Measured: `FU-H1 t2`, `FU-S1 t2`.
   - **cards:**
     - `placeRecommendations` / `stayRecommendations` set `recommended: true` on the Pick, with the engine's reasons;
     - `alignEmphasisToModelPick` re-homes the emphasis to the venue Luna named first, with "reasons" rebuilt from a fixed set
       (rating / review count / distance), and fills the rest of the fold in row order;
     - with no named venue, the emphasis is dropped (and `tappyai_cards_error emphasis_dropped_no_model_pick` is logged).
5. Settle-path pick backstops (`v1PickBackstop`, `g1bFallback`):
   - the backstop is off in agent mode;
   - `g1bFallback` (body < 40 letters) can still name **`pickName` = the engine's Pick**.

So on the agent path a fixed rating-first formula still (a) chooses Luna's reading order, (b) chooses which products Luna may see,
(c) tells Luna a winner, (d) chooses the shopping card's winner and (e) fills the card fold.

## 2. Component map

| Component | File | Current role | Hard constraint? | Semantic decision? | Current formula | M5 action |
|---|---|---|---|---|---|---|
| `rankCandidates` score | `ai/consultative/rank.ts` | orders candidates | no | **yes** | BASE weights + priority weights; balanced / extreme min–max; tie chain | **agent v2: not used for order or pick** (legacy / agent1 unchanged) |
| `hardFilter` (inside rankCandidates) | `ai/consultative/rank.ts` | removes a known price over a HARD budget ("dưới / tối đa"); contradicted must-have / avoid | **yes** | no | — ("around" budgets never filter) | **kept; on agent v2 its verdict now removes the row from what Luna reads** (today it only left the ranked set) |
| `derivePick` / `buildPickPayload` / `_tappy_ranking` | `ai/consultative/pick.ts` | engine winner + "explain, don't choose" | no | **yes** | margin over the runner-up on the score | **agent v2: none** |
| `shortlistCandidates` / `_tappy_shortlist` roles | `ai/consultative/shortlist.ts` | Rule of 1–3, `best_overall`… | no | **yes** | top of the score | **agent v2: none** |
| `shortlistShopping` | `ai/consultative/shortlist.ts` | trims products to the decision set | size cap | **yes** (keeps the score's top N) | score order | **agent v2: provider order, size cap only** |
| row reorder in `rankForModel` | `app/api/chat/route.ts` | reading order | no | **yes** | score order | **agent v2: provider order** |
| `_tappy_brief` (CONSULT_BRIEF, default OFF) | `consultative/consultativeBrief.ts` | hands the engine's decision to the model | no | yes | Pick | agent v2: not attached |
| `buildShoppingSynthesis` recommendation | `consultative/synthesis.ts` | shopping card winner | no | **yes** (from Pick) | Pick | **agent v2: no engine recommendation; Luna's ranking sets it** |
| `placeRecommendations` / `stayRecommendations` `recommended` | `recommendation/fromToolResult.ts` | card emphasis | no | **yes** (from Pick) | Pick | **agent v2: from Luna's ranking** |
| `alignEmphasisToModelPick` reasons | `recommendation/liveView.ts` | "Vì sao" for the model's pick | no | presentation | fixed rating / reviews / distance | **agent v2: Luna's rationale and trade-off (qualitative) when given** |
| card fold fill / `placesRenderOrder` | `streamEnrichment.ts` `cardFold`, `liveView.ts` | fills cards after the named ones in row order | no | **yes** (filler = score order today) | row order | **agent v2 with a ranking: only the ranked candidates, no filler** |
| `alignEmphasisToEnginePick` / `enforceEnginePickSentence` | liveView / consultBrain | engine Pick authoritative (CONSULT_BRIEF) | no | yes | Pick | flag OFF; not on agent v2 |
| `g1bFallback` / `v1PickBackstop` | `streamEnrichment.ts` | writes a pick sentence when the body is empty | no | yes (engine Pick) | Pick | **agent v2: never the engine's Pick (none exists); Luna's pick or nothing** |
| `placeConstraintFilter` budget / type / open-now / district | `ai/placeConstraintFilter.ts` | drops rows over a stated budget, of an excluded type, out of the named district; closed rows last | **yes**, except below | — | constraint tiers (fits / maybe / unknown / closed; in-district first) | kept |
| … "rẻ tiền / bình dân / quán nhỏ / vỉa hè / rẻ thôi / cheap" ⇒ **drop upscale restaurants** | `ai/placeConstraintFilter.ts` `EXCLUDE_RESTAURANT_RE` | turns a **soft** cheapness wish into a hard type exclusion | **no** | yes | regex | **agent v2: only explicit exclusions ("không nhà hàng", "toàn nhà hàng") stay hard; cheapness stays soft for Luna** |
| `hardConstraintGate` (`gateTools`) | `consultative/hardConstraintGate.ts` | annotates gaps / backed-by for hard constraints | yes (annotation) | no | — | kept |
| `validateShoppingCandidates` | `consultative/shoppingConstraints.ts` | wrong product kind, hard budget, nearest-below note | **yes** | no | — | kept |
| `agencyRowsToDrop` / `gatePlacesByActivity` | route + `consultative/*` | wrong kind of venue | **yes** (asked type) | no | — | kept |
| `ccp/ranking/score.ts` | CCP | which commerce LINK of one entity leads (provider freshness / quality) | product rule | not about which candidate | weighted features | out of M5 (link presentation, not candidate choice); documented |
| `recommendation/recommendationEngine.ts` | `/api/recommendations` (Explore feed) | feed ranking | — | yes | weighted signals | **not the chat runtime**: out of scope |
| `explore/recommendation.ts` | Explore page | feed | — | yes | — | out of scope |
| `realtimeBooking.ts` offers sort by price | realtime booking (provider access blocked) | cheapest N offers of the realtime feed | presentation | no | price | not active; unchanged |
| `vnexpressTravel.ts` relevance sort | editorial retrieval | article relevance | — | retrieval relevance | text score | not a recommendation; unchanged |
| `researchSearch.ts` `pickToOpen` | M3 | which result pages to open first (official first) | retrieval policy | no | source-type preference | unchanged (M3) |
| `filmSearch.ts` trusted-host order | film titles | listing source trust | — | no | host list | unchanged |
| `_tappy_evidence_gap` | route | "search again / recommend" hint from missing evidence | no | no (evidence count) | — | kept (informational; ignores order) |

## 3. Soft → hard conversions found

1. `EXCLUDE_RESTAURANT_RE` ("rẻ tiền", "bình dân", "quán nhỏ", "vỉa hè", "rẻ thôi", "rẻ rẻ", "cheap") drops upscale restaurant rows: a
   soft wish acting as a hard filter. Explicit exclusions ("không nhà hàng", "toàn nhà hàng", "nhà hàng quá") are real hard constraints.
2. `need.budget.type === 'around'` ("khoảng / tầm") already never filters: correct.
3. `mustHave` eliminates only on **contradicting** evidence for an explicitly mandatory wording: correct.

## 4. The M5 boundary (agent v2 only; legacy and Phase 7 agent1 unchanged)

USER → task / context → **Luna** → tools / research (M3) → candidate rows → **code hard constraints** (the gates above +
`hardFilter`) → valid rows in **provider order**, with a note saying the order is not a ranking → **Luna ranks** (prose + a compact
ranking block) → M4 evidence-aware guards → cards render **Luna's order** (only the ranked candidates; none → no recommendation).
