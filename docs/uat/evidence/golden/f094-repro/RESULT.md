# Item 4 — did the F-086 restore make any golden case worse?

Run `post-egress-f086` (2026-09-25, :3007, audit, real model; includes F-092 + F-086 + restored egress guard)
vs `prelaunch-after` (+ `prelaunch-after-B4` for B4).

- Criteria (`scripts/audit/goldenCompare.mjs`): **51/58 → 57/58, WORSE: none.** The one remaining FAIL (G5a "no invented % / star thresholds") failed before too.
- Text level (`golden_textdiff.mjs` → `../textdiff-prelaunch-after-vs-post-egress-f086.txt`): no sentence-initial "Với" was eaten (the F-092 symptom).
- **WORSE at text level — headless fragments after a guard cut** (a sentence that starts lowercase right after
  a sentence end, i.e. its head was removed). The golden criteria do not test for this.
  - before (`prelaunch-after` + `-B4`, 28 turns): **1** — T1 t2 "… mua sắm, hoặc nâng cấp dịch vụ."
  - after (`post-egress-f086`, 28 turns): **7**, plus the T1 t3 `**Tổng ước tính, …` below:

| case | user said this turn | fragment the user saw |
|---|---|---|
| B2 t1 | (no number) | "… nên bạn có thời gian linh hoạt. phù hợp bữa trưa hay tối." |
| B4 t1 | "dưới 2 triệu" | "nếu bạn ưu tiên **không dây**, **Huawei FreeBuds 7i** là lựa …" |
| B4 t2 | (earlier: dưới 2 triệu) | "nếu bạn có thêm budget, **HyperX Cloud Stinger 2 Core** là lự…" |
| B4 t3 | (no number) | "bao gồm xe khách khứ hồi, ăn uống và tham quan miễn phí." |
| D2 t1 | (no number) | "… cho bạn! có wifi và đồ ăn nhẹ." |
| T1 t2 | "budget 20 triệu" | " các hoạt động khác. Bạn có thể nâng cấp khách sạn …" |
| T3 t2 | "50-60k" | "… vượt ngân sách. mình có thể tìm thêm …" |

  **Attribution to F-086 is UNVERIFIED**: the harness records only what the client received, not the
  model's text before the guards, so the removed head cannot be seen. T1 t2 (and T1 t3) fit the F-086
  pattern — the user said "budget 20 triệu" and the fragment sits where a restated total would be. B2,
  D2, B4 t3 carry no user number, so they are ordinary unsupported-price cuts that the guard made
  before F-086 too; 6 → 7 between two runs is also within model variance. What is certain: the v1
  clause cut produces a visible headless fragment in about 1 turn in 4 of this run.
- **T1 turn 3** ends its paragraph with `**Tổng ước tính, mua sắm, hoặc nâng cấp.`

## Is T1 t3 caused by F-086? — No (reproduced), but F-086 widens it
`repro_t1t3.ts` feeds plausible model sentences through `guardSnippetPricesInText` (v1 path; SNIPPET_PRICE_GUARD_V2 is not set on :3007),
once with the current guard and once with the guard from `2ce8402^` (before the F-086 restore):

| model sentence (user budget 20 triệu) | before F-086 | after F-086 |
|---|---|---|
| `**Tổng ước tính: ~8.500.000 VND** cho 2 người, còn dư khoảng 11.500.000 VND cho ăn uống, mua sắm, hoặc nâng cấp.` | `**Tổng ước tính, mua sắm, hoặc nâng cấp.` | same |
| `**Tổng ước tính: khoảng 20 triệu cho 2 người**, đã gồm vé máy bay, khách sạn, còn lại cho ăn uống, …` | kept (user echo) | `**Tổng ước tính, đã gồm vé máy bay, khách sạn, còn lại cho ăn uống, mua sắm, hoặc nâng cấp.` |
| `**Tổng ước tính: 20.000.000 VND** — vừa đủ ngân sách, …` | kept | kept (framed as budget) |

The exact observed fragment comes from invented, non-budget amounts, which the v1 clause-cutter
cut before F-086 as well. What F-086 adds: the user's own budget restated as a total now goes
through the same cutter, so it can produce the same kind of fragment (row 2). The G2 path
(`v2: true`) removes the whole sentence instead and leaves no fragment in all three rows.
→ F-094 (open, raised to P1 by this measurement): the v1 clause cut leaves an unclosed `**` and headless clauses.
To attribute future cases, the golden harness should record the pre-guard text (e.g. via the guard telemetry).

---

## Owner decision 2026-09-25 → fix + measurement (pre-guard text now recorded)

Fix: v1 removes the WHOLE sentence (V2 flag NOT enabled); list lines keep their item and lose only the
amount (S7); no cut may leave an unclosed/split `**`, an orphan bracket, a headless remainder or a
stray emoji. Harness: `goldenSet.mjs` stores `preGuard` (the model's raw reply, dev-only capture);
`scripts/audit/goldenClipped.mjs` classifies every received sentence against it.

| run | code | CLIPPED (headless + broken bold + broken bracket) | what was found |
|---|---|---|---|
| post-egress-f086 | before the fix | n/a (no raw text) — lower-case proxy **7** | the 7 fragments reported earlier |
| post-f094 | 09afdcf | **4** | `Pro****` (cut split a bold pair); `**1.-` (regression: bold counted per sentence, not per line); 1 bracket |
| post-f094b | e7ddb1f | **0** | but the pick's own list line was deleted whole (T3 t2) + a stray " 🤔" → fixed in 06e0039 |
| post-f094c | 06e0039 | **5** | 4 orphan brackets (fixed in 8ec927f); 1 "**bạn nên**." from the SPEC guard, not a price guard |
| **post-f094d** | **8ec927f** | **0** | 6 middle-clause removals listed for review; they read whole |

Criteria (goldenCompare) post-egress-f086 57/58 → post-f094d 52/58. Every WORSE line was checked
against the raw text: T4 t2 / G5c / G5d "invented %" — the MODEL wrote them (present in preGuard);
G5b / G5d "list shape" — the server's RISK_BACKSTOP block ("⚠️ Trước khi trả tiền, kiểm tra mấy điều
này…", absent from preGuard) uses "- **Header:**" bullets, which the criterion regex `\S \*\*[^*]+:\*\*`
also matches. None comes from the price guards. Detail: `../clipped-post-f094-runs.txt`,
`../compare-post-egress-f086-vs-post-f094d.txt`.
