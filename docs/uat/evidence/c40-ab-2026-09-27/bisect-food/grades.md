# Bisect food grades (F1–F8 + F7b)

These grades use the same rubric and consistency rules as `docs/uat/evidence/c40-ab-2026-09-27/blind-grading.md` §1–§6, applied to
the food ids only. F7 is non-actionable: one clarify turn with no search is correct, and searching straight away is ❌. The runs
were graded blind, without inferring their configuration.

Rules that recur in the food vertical:
- A quiet, parking or private-room claim stated as fact with no heads-up → ❌.
- A "fits your budget" claim that the row contradicts or does not support → ❌.
- A pick whose row price band is far above the budget → ❌.
- On an actionable query, asking a question after the search without giving a pick → ❌.
- One orphan fragment, or a pick missing from the prose → ⚠️. Two or more fragments together with no named pick → ❌.
- An F6 reply that is only a fragment and never answers the crowd question → ❌.
- Post-hoc "mình sẽ tìm" narration after the search, or two or more alternatives → ⚠️.

## s1

| id | r1 | r2 | r3 | reason (non-✅) |
|---|---|---|---|---|
| F1 | ⚠️ | ⚠️ | ⚠️ | all: post-hoc "Mình sẽ tìm…" after the search. The pick itself is grounded: The Cajun Cua 4.6⭐/1.740, 0.9 km, open to 23:00 · r3 also has two alternatives, an unclosed italic and a "Tìm phòng trên Google" CTA on a restaurant |
| F2 | ⚠️ | ⚠️ | ⚠️ | all: the prose never names the pick (Bún Bò Cô Tiên appears only in the CTA) and opens on an orphan alternative "Nếu bạn muốn lựa chọn khác, **Bún bò Huế O Tâm**…"; the 80k budget is not addressed |
| F3 | ❌ | ❌ | ❌ | quiet asserted with no heads-up: r1 "Quán này có không khí yên tĩnh" (plus glued "date tối.cách bạn") · r2 "không gian yên tĩnh" · r3 "nổi tiếng với không gian yên tĩnh" |
| F4 | ❌ | ❌ | ❌ | parking asserted with no evidence: r1/r2 Tám Riêu "có chỗ đậu xe ô tô" · r3 San Fu Lou "Quán rộng rãi… có chỗ đậu xe ô tô" |
| F5 | ✅ | ⚠️ | ⚠️ | r2 unbacked crowd advice "Cuối tuần thường đông khách… đến sớm hơn (khoảng 11:00–11:30)" · r3 "Quán này cũng khá đông vào giờ cao điểm trưa" (unbacked) |
| F6 | ❌ | ❌ | ❌ | the crowd question for quán số 2 is never answered · r1 the whole reply is "Bạn muốn mình tìm thêm quán khác không…" · r2 fragment "Tuy nhiên." plus generic off-peak advice · r3 starts mid-list "Bạn có thể:" |
| F7 | ❌ | ❌ | ❌ | vague query searched immediately; no clarify turn |
| F8 | ❌ | ⚠️ | ❌ | r1 searched, then asked "Bạn ưu tiên ăn gì?" with no pick · r2 no private-room heads-up, "mình cần tìm lại…" narration, two options without a firm pick · r3 "Nori… có phòng riêng, phù hợp tầm ngân sách" (private room asserted), glued "nhé.Mình" |
| F7b | ❌ | ❌ | ⚠️ | r1 picks Gyu Shige, row 300–800k, for "dưới 100k/người" · r2 Bò Tơ Quán Mộc "giá cơm bò thường dưới 100k/người" (no price in the row) · r3 Bò Tơ with no budget claim but the budget is not addressed, two alternatives |

- **s1-r1:** food 3/8 (✅1 ⚠️2 ❌5); F7b not ok
- **s1-r2:** food 4/8 (✅0 ⚠️4 ❌4); F7b not ok
- **s1-r3:** food 3/8 (✅0 ⚠️3 ❌5); F7b ok (⚠️)

## s0

| id | r1 | r2 | r3 | reason (non-✅) |
|---|---|---|---|---|
| F1 | ⚠️ | ✅ | ⚠️ | r1 grounded pick (The Cajun Cua), but an orphan " 👍" line · r3 post-hoc "Mình sẽ tìm…", two alternatives |
| F2 | ❌ | ❌ | ⚠️ | r1/r2 the prose never names a pick. It is only two orphan lines (" Tuy hiện đang đóng cửa (mở 8:00–12:30), nhưng đây là lựa chọn tốt nhất…", " Quán này có nhiều review hơn…"), and the CTAs point to different venues · r3 names Cô Tiên but does not address the 80k budget, two alternatives |
| F3 | ❌ | ❌ | ❌ | quiet asserted with no heads-up: r1 "vừa lãng mạn, vừa yên tĩnh", "không gian yên tĩnh" · r2 Hoa Túc "không gian yên tĩnh, ánh sáng dịu nhẹ", plus leaked narration "Bạn thích ăn tối hay…? Mình sẽ tìm…" · r3 "vừa lãng mạn vừa yên tĩnh" |
| F4 | ✅ | ❌ | ❌ | r2 "khu vực có chỗ đậu xe ô tô" (asserted), glued "nhé.Mình" · r3 "không gian rộng rãi và có chỗ đậu xe ô tô" (asserted). r1 is ✅: it defers parking to a phone call |
| F5 | ✅ | ✅ | ✅ | |
| F6 | ⚠️ | ⚠️ | ✅ | r1 honest "chỉ bao gồm đánh giá, rating và giờ mở cửa" but never names quán số 2 · r2 honest, a one-bullet list, and names #1/#3 rather than #2. r3 is ✅: it identifies #2 by its 4.7⭐ and says there is no real-time data |
| F7 | ❌ | ❌ | ❌ | vague query searched immediately; r3 also has an orphan "👌" |
| F8 | ❌ | ❌ | ⚠️ | r1 no venue named in prose (Hoang Yen appears only in the CTA), "Mình thấy có vài quán phù hợp", narration · r2 "Mình thấy có vài nhà hàng phòng riêng ở Quận 1" (asserted), no single pick · r3 picks Nori with no private-room claim. It has three web_search calls, so the "có phòng riêng" claim for Veteran cannot be checked against rows; the Veteran name is cut, leaving an orphan address line |
| F7b | ⚠️ | ⚠️ | ❌ | r1 Bò Tơ Quán Mộc with no price in the row and no budget claim, two alternatives, unclosed italic · r2 Bò Tơ, with an honest note that Gyu Shige may be over budget, but "Hàng Dương… an toàn hơn về giá, cơm tấm/cơm bình dân" is unbacked · r3 Bò Tơ, row 200–600k, for "dưới 100k/người", plus an orphan " Mặc dù cách bạn 2.3km…" |

- **s0-r1:** food 4/8 (✅2 ⚠️2 ❌4); F7b ok (⚠️)
- **s0-r2:** food 3/8 (✅2 ⚠️1 ❌5); F7b ok (⚠️)
- **s0-r3:** food 5/8 (✅2 ⚠️3 ❌3); F7b not ok
