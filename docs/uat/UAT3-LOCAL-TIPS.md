# UAT3 P2 — local tips in trip plans (2026-09-27)

**Scope:** the travel planning block only (`buildPlanningBlock`, trip plans). The consultative prompt is unchanged.

**What changed:**

- **Contract.** A new optional field, `local_tips` (at most 4). Each tip is one of two kinds:
  - `{text, basis:"tool", place:<exact stop name>}`
  - `{text, basis:"general"}`

  Rule 14 tells the model that every tip needs a basis, and to omit the field when it has none.
- **Deterministic guard.** `src/lib/ai/planLocalTipsGuard.ts` runs server-side after `guardPlanPrices`, before any client sees the plan. It drops a tip when:
  - it has the wrong shape or basis;
  - it contains any digit (prices, hours, dates, ratings, addresses);
  - it uses a fact word that needs evidence (price, open/close, showtime, ticket, rating, review) or makes a quality superlative ("ngon nhất", "tươi sống nhất");
  - it is a *general* tip that names a venue (for example "quán Bà Ba");
  - it is a *tool* tip whose `place` is not a stop of this plan, or was not retrieved this turn;
  - it is a *tool* tip that names a venue other than its own stop.

  If no tip survives, the field is removed and no section is rendered. Matching runs on unfolded text, because folding collides giá/gia, quán/quận and sạp/sắp; unit tests pin those cases.
- **Rendering.** Web `TripPlanCard` and Android `TripPlanCard` show a "📍 Mẹo địa phương" section:
  - a tool tip is prefixed with its stop's name;
  - a general tip carries a "Kinh nghiệm chung" label.

  The shared brochure (`/plan/<id>`) does not show tips yet.

**Honest limit:** for a `tool` tip the guard verifies the **anchor**: the stop exists in the plan and was retrieved this turn. It does **not** verify the advice text against review content, because tool rows carry no review text to check it against. What such a tip can say is bounded by the guard: no numbers, no hours or prices, no superlatives, no other venue.

## Golden, before vs after (audit DB, :3007, throwaway accounts)

The cases are L1 (new: Quy Nhơn 3N2Đ, local food), G1a, G4a and T1 (3 turns). Evidence is in `docs/uat/evidence/golden/uat3-tips-before/` and `…/uat3-tips-after/`. The harness now records `usage` per turn.

| turn | before: completion tok / ms | after: completion tok / ms |
|---|---|---|
| T1 t1 | 3,638 / 45,803 | 3,775 / 40,184 |
| T1 t2 | 3,359 / 40,448 | 4,110 / 45,898 |
| T1 t3 | 3,432 / 37,803 | 2,998 / 42,361 |
| G1a | 2,954 / 39,699 | 2,750 / 39,574 |
| G4a | 3,315 / 39,418 | 3,494 / 44,136 |
| **5 comparable turns** | **16,698 / 203,171** | **17,127 / 212,153** |

- **Output tokens:** +429 in total (+2.6%, about +86 per plan turn).
- **Latency:** +4.4% in total (average per turn 40.6 s → 42.4 s). Single turns swing ±5 s in both directions, so this is within run-to-run noise.
- **Prompt tokens:** 63,660 → 62,873. The static addition is 904 source characters, roughly 250–350 tokens, but it is smaller than the turn-to-turn variation in tool results.
- **L1 is not comparable.** Before the change it asked a clarifying question and produced no plan (693 output tokens). After, it produced a plan (3,837 output tokens). One run each way is not evidence that the change caused this.

**Tips produced (after):**

- The model wrote 16 raw tips across the 6 plans.
- The guard at run time kept 8. It dropped:
  - weather tips carrying numbers;
  - tips with hours ("mở từ 18:00");
  - an L1 tip naming two restaurants plus a review count;
  - tips attached to non-stops.
- The superlative rule was added after this run, from what it showed. Replayed on the kept tips, it removes one more ("tươi sống nhất"), giving **7 of 16**.
- No kept tip contains a number, a price, hours, or a venue outside the plan.
- L1 (Quy Nhơn) kept **0 of 2**. Both of its raw tips carried numbers and a second venue, so its plan correctly shows no tips section.
