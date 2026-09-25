# Item 4 — did the F-086 restore make any golden case worse?

Run `post-egress-f086` (2026-09-25, :3007, audit, real model; includes F-092 + F-086 + restored egress guard)
vs `prelaunch-after` (+ `prelaunch-after-B4` for B4).

- Criteria (`scripts/audit/goldenCompare.mjs`): **51/58 → 57/58, WORSE: none.** The one remaining FAIL (G5a "no invented % / star thresholds") failed before too.
- Text level (`golden_textdiff.mjs` → `../textdiff-prelaunch-after-vs-post-egress-f086.txt`): no "Với" damage anywhere (0 → 0 sentence-initial "Với" losses; F-092 holds).
- **One visible defect: T1 turn 3** ends its paragraph with `**Tổng ước tính, mua sắm, hoặc nâng cấp.`

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
→ F-094 (open): the v1 clause cut leaves an unclosed `**` and a headless clause.
