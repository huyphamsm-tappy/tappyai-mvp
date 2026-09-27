# Consultative-40 — blind grading of R1–R4 (2026-09-27)

Graded blind from `scratchpad/c40ab/blind/R1..R4/<id>.json` (reply prose, tool calls, tool rows, shortlist, thread).
No LLM or network calls. Configuration of each run is unknown to the grader.

Rubric: `docs/audit/eval/consultative-40.md`, criteria C1–C9, ✅ PASS / ⚠️ PASS with a note / ❌ FAIL, including the
2026-09-19 rule: F7 S5 S6 T5 P5 P7 E2 E5 must get exactly ONE clarify turn and no search. The other 32 must search
without asking. "x/40" = (✅ + ⚠️) over the 40 original ids. The 8 b-turns are scored separately: ok = ✅ or ⚠️, and the
turn must produce an answer.

Consistency rules applied identically to all four runs:
- An unsupported hard constraint (quiet, live music, parking, private room, luxury, late-open, "no booking needed")
  stated as fact with no evidence-gap heads-up → ❌. The same claim next to a heads-up → ⚠️.
- A number or fact that is not in the rows (distance, price fit, hours) → ❌ (C5). A "fits your budget" claim when the row's
  band exceeds the budget counts here.
- An actionable query that asks instead of searching, or a vague query that searches immediately → ❌.
  A b-turn that asks again → ❌.
- An orphan fragment (a cut sentence, a lone emoji line, an unclosed paren or italic, a nameless paragraph left after a
  guard cut) → ⚠️. Two or more fragments together with no named pick → ❌.
- Two or more alternatives (C4 allows at most one), or post-hoc "mình sẽ tìm ngay" narration after the tool already ran → ⚠️.
- A pick in the wrong district: ⚠️, following the rubric's GATE B P4 precedent. It becomes ❌ when paired with a fabricated
  claim. Shopping prose that does not name the card's pick: ⚠️ (rubric S1 precedent). Films from model knowledge (E7): ⚠️
  (GATE B precedent).

## 1. Summary

| run | x/40 | ✅ | ⚠️ | ❌ | b-turns ok/8 |
|---|---|---|---|---|---|
| R1 | **37/40** | 17 | 20 | 3 | 6/8 |
| R2 | **22/40** | 8 | 14 | 18 | 7/8 |
| R3 | **30/40** | 13 | 17 | 10 | **8/8** |
| R4 | **28/40** | 7 | 21 | 12 | 4/8 |

Clarify-rule compliance on the 8 non-actionable ids (exactly one clarify, no search):
R1 8/8 · R3 8/8 · R2 3/8 (searched F7 T5 P5 P7 E2) · R4 3/8 (searched F7 S5 T5 P7 E2).
Actionable ids that asked instead of searching: R1 S2 · R2 T4 · R3 T7 · R4 T1.

## 2. Per vertical (✅/⚠️/❌ → x/8)

| run | F food | S shopping | T travel | P spa | E entertainment |
|---|---|---|---|---|---|
| R1 | 4/4/0 → **8/8** | 4/3/1 → **7/8** | 4/3/1 → **7/8** | 3/5/0 → **8/8** | 2/5/1 → **7/8** |
| R2 | 1/2/5 → **3/8** | 2/3/3 → **5/8** | 1/1/6 → **2/8** | 2/3/3 → **5/8** | 2/5/1 → **7/8** |
| R3 | 1/4/3 → **5/8** | 4/2/2 → **6/8** | 2/3/3 → **5/8** | 2/6/0 → **8/8** | 4/2/2 → **6/8** |
| R4 | 2/3/3 → **5/8** | 1/6/1 → **7/8** | 1/3/4 → **4/8** | 2/4/2 → **6/8** | 1/5/2 → **6/8** |

## 3. Per turn

| id | R1 | R2 | R3 | R4 | reason for non-✅ (runs) |
|---|---|---|---|---|---|
| F1 | ⚠️ | ⚠️ | ⚠️ | ✅ | R1 post-hoc "mình sẽ tìm ngay" before the pick · R2 pick has no reason, orphan "😊" line · R3 two alternatives, unbacked "ấm cúng" |
| F2 | ⚠️ | ❌ | ❌ | ⚠️ | R1 post-hoc preamble, two alternatives · R2 "giá dưới 80k như bạn cần" but rows only say 1–100k; pick is closed now · R3 searched "quán ăn tối ngon" with no bún bò and no location, picked A Xỉu (wrong kind) · R4 80k budget not addressed |
| F3 | ⚠️ | ❌ | ❌ | ❌ | R1 orphan "Cách bạn 3.8km." · R2 cafe "nổi tiếng với không gian yên tĩnh", no heads-up · R3 "cách bạn khoảng 1.5km" but the row has no distance · R4 "Quán có không khí yên tĩnh, lãng mạn", no heads-up |
| F4 | ✅ | ⚠️ | ❌ | ⚠️ | R2/R4 parking and kids not addressed, only implied by "có chỗ đậu xe ô tô nhé", glued "nhé.Mình" · R2 two alternatives · R3 search had no location, so it picked a Tân Phú venue and invented "Có chỗ đậu xe" |
| F5 | ✅ | ✅ | ⚠️ | ✅ | R3 speculates "khu vực khá sầm uất nên chắc có chỗ đậu" (on the out-of-area F4 pick) |
| F6 | ✅ | ❌ | ⚠️ | ⚠️ | R2 fragment only: no venue, no crowd answer · R3 speculates "gần chợ Bến Thành nên có thể ít đông hơn", fragment "hoặc chọn" · R4 asks which venue is #2 although a carousel existed |
| F7 | ✅ | ❌ | ✅ | ❌ | R2/R4 searched immediately on a vague query |
| F8 | ⚠️ | ❌ | ⚠️ | ❌ | R1 unbacked "chuyên phục vụ nhóm lớn" · R2 asserts private rooms with no heads-up, no single pick, offers to "gọi điện xác nhận" · R3 alternative "giá phù hợp" with no price, caveat stated twice · R4 orphan "Mở tới 3h sáng…", no pick, invented "booking online qua Google Maps" |
| S1 | ✅ | ❌ | ❌ | ⚠️ | R2 prose never names the pick, fragments "Tuy nhiên, nên bạn nên…" and "Nếu ưu tiên **giá rẻ nhất**" · R3 rows are listicles, but prose quotes 57.000₫ and specs, then says "Kết quả chưa có mức giá" · R4 prose never names the pick, unclosed italic |
| S2 | ❌ | ⚠️ | ❌ | ⚠️ | R1 no search; asked "bạn dùng laptop chủ yếu để làm gì" · R2 calls the 10.89tr Dell "rẻ nhất" (a 9.99tr Vostro is in the rows), unclosed paren · R3 recommends a backpack ("Ba lô Topo") for a laptop query · R4 prose has no pick, orphan "💼" |
| S3 | ✅ | ❌ | ✅ | ✅ | R2 names the wrong cheapest item (Latitude 10.89tr, not Vostro 9.99tr) |
| S4 | ⚠️ | ⚠️ | ✅ | ⚠️ | R1/R2 pick is below the 5–7tr band (4.5tr / 3.49tr) and pet-hair features are unbacked · R4 prose never names the pick, unbacked "công suất hút mạnh" |
| S5 | ✅ | ✅ | ✅ | ❌ | R4 ran 3 searches instead of clarifying, orphan " Giá rẻ mà vẫn có chất lượng." |
| S6 | ✅ | ✅ | ✅ | ⚠️ | R4 clarify drifts to food/services "nhiều quán ăn, cafe… Quận 1" |
| S7 | ⚠️ | ❌ | ⚠️ | ⚠️ | R1/R3/R4 nameless paragraphs left after heading cuts ("Từ Thế Giới Nệm, đây là…"), R3 picks a seller rather than a product · R2 unrequested `save_price_watch` with an invented 1.5tr target, no pick, asks budget |
| S8 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | R1 post-hoc "sẽ tìm" plus nameless fragments · R2 two alternatives, unclosed italic · R3 hedged double pick with three alternatives · R4 nameless paragraphs, unbacked "Rapido… bền bỉ" |
| T1 | ⚠️ | ❌ | ❌ | ❌ | R1 assumption paragraph duplicated, truncated tail "(Cầu Rồng, Công viên Biển Đông." · R2 invented hotel estimate "800.000-1.000.000 VND/đêm", 08:00 breakfast at a 10:30-open venue, leaked "Mình đang tìm tiếp...", empty cost bullets · R3 invented prices (hotel, "vé ~50-100k", "~300-500k/người"), breakfast at 10:00-open venues · R4 no plan; asks "máy bay hay xe khách?" twice |
| T2 | ❌ | ❌ | ⚠️ | ❌ | R1/R2/R4 "Mình thấy danh sách khách sạn…" but no hotel named and no pick · R1 inline Booking link glued ")Agoda" · R2 cut sentence plus a showtime/ticket heads-up (wrong vertical) · R3 three hotels, no single pick, fragments |
| T3 | ✅ | ✅ | ❌ | ✅ | R3 answered with the FOOD clarify template (tầm giá/người, mấy người): topic bleed |
| T4 | ✅ | ❌ | ✅ | ⚠️ | R2 no search; asked activity type · R4 two alternatives, post-hoc "sẽ tìm" |
| T5 | ✅ | ❌ | ✅ | ❌ | R2/R4 searched immediately on a vague query |
| T6 | ⚠️ | ❌ | ⚠️ | ⚠️ | R1 post-hoc "sẽ tìm", unbacked breakfast claim · R2 asked 4 questions, then repeated them with a mangled "2.\n3.4." list · R3 backstop pick (Vina Ngon) is not in its own plan, lantern claim contradicts the 10:00 slot · R4 "Tôi", glued "bạn.Hội An", nameless Old Town paragraph |
| T7 | ⚠️ | ⚠️ | ❌ | ⚠️ | R1/R2/R4 flight tool empty, honest, links in prose (rubric ⚠️) · R3 no tool call; asked for the date |
| T8 | ✅ | ❌ | ⚠️ | ❌ | R2 unbacked "sang trọng nhất… không gian yên tĩnh, dịch vụ chất lượng cao", no heads-up · R3 unbacked "Cả hai đều có spa" beside an upscale heads-up · R4 pick has no reason, orphan " Không gian sang trọng…" with no heads-up |
| P1 | ⚠️ | ✅ | ⚠️ | ⚠️ | R1 backstop pick line, then post-hoc "sẽ tìm ngay" · R3/R4 say the Đà Nẵng spa is "gần bạn" (user GPS is Q1), R3 has two alternatives |
| P2 | ⚠️ | ✅ | ⚠️ | ⚠️ | R1 post-hoc preamble, two alternatives · R3 search dropped location and foot massage, budget caveat stated twice · R4 300k budget not addressed ("với giá dưới 300k" implied) |
| P3 | ✅ | ⚠️ | ⚠️ | ✅ | R2 suggests "GrabSpa" (unverified platform) · R3 raw URL in prose, stray budget line |
| P4 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | R1 post-hoc preamble · R2 quiet/clean not addressed · R3 unbacked "được nhiều khách khen về sạch sẽ" beside the heads-up · R4 picks Sả Spa (Bến Thành, Q1) for Quận 7, "sạch sẽ" inferred from review count |
| P5 | ✅ | ❌ | ✅ | ⚠️ | R2 searched immediately · R4 clarify block printed twice |
| P6 | ⚠️ | ⚠️ | ⚠️ | ✅ | R1 alternative "gần hơn (2.3km)" vs pick 1.3km, post-hoc · R2/R3 unbacked "chuyên dịch vụ couple", Fresha/Klook booking, R3 has two alternatives |
| P7 | ✅ | ❌ | ✅ | ❌ | R2/R4 searched immediately |
| P8 | ⚠️ | ❌ | ⚠️ | ❌ | R1 orphan "Nó cách bạn…" (name cut), pick closes at 22:00 · R2 "2 spa mở khuya sau 22h" but both close 22:00 · R3 "Có 2 spa" but only one named · R4 presents a Q1 spa as Quận 3 and a 22:00 closer as after-22h |
| E1 | ⚠️ | ✅ | ✅ | ⚠️ | R1 post-hoc "cần tìm… nhé" · R4 two alternatives |
| E2 | ✅ | ❌ | ✅ | ❌ | R2/R4 searched immediately |
| E3 | ⚠️ | ⚠️ | ⚠️ | ❌ | R1 post-hoc preamble · R2 asks live band vs DJ on an actionable query, two alternatives · R3 two alternatives, unbacked "rẻ hơn" · R4 "không gian chill với nhạc sống chất lượng", no evidence and no heads-up |
| E4 | ⚠️ | ⚠️ | ✅ | ✅ | R1 fragment start "Nên bạn gọi…", stray live-music heads-up carried in · R2 first bullet missing, speculates "nhiều khả năng quán có hợp tác với bãi giữ xe" |
| E5 | ✅ | ⚠️ | ✅ | ⚠️ | R2/R4 model-authored bullet menu with wrong dates "Cuối tuần này (28-29/9)" (today is Sun 27/9) |
| E6 | ❌ | ✅ | ❌ | ⚠️ | R1 labels Avatar (Cầu Ông Lãnh, Q1) "(Gò Vấp)" plus "phù hợp… với mức giá khoảng 100k/người", no price in row · R3 "100-600k/người nên vừa vặn với tầm 100k" · R4 picks the Q1 Avatar for Gò Vấp, unbacked "không gian rộng" |
| E7 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | all runs: 3 films from model knowledge (2024 titles for "tối nay"), no tool (GATE B precedent) |
| E8 | ⚠️ | ⚠️ | ❌ | ⚠️ | R1 post-hoc, two alternatives · R2 three options, no single pick · R3 first search was "quán ăn ngon có khu trẻ em", backstop pick is a restaurant (A Xỉu), inline Maps link · R4 two alternatives ("Cột cờ Thủ Ngữ… để bé chạy nhảy") |

b-turns (answers to the clarify turns):

| id | R1 | R2 | R3 | R4 | reason for non-✅ (runs) |
|---|---|---|---|---|---|
| F7b | ❌ | ✅ | ✅ | ❌ | R1 picks Nori (100–600k) and claims "có thể ăn ngon trong ngân sách dưới 100k", inventing dishes · R4 picks Gyu Shige (300–800k) for under 100k |
| S5b | ⚠️ | ⚠️ | ⚠️ | ⚠️ | R1 1.2tr "vừa khít ngân sách", post-hoc · R2 unbacked scent, two alternatives · R3 orphan "Dễ gần để bạn gái dùng hằng ngày." · R4 garbled "xem thêm: Gợi ý của mình là…" |
| S6b | ⚠️ | ⚠️ | ⚠️ | ⚠️ | R1 post-hoc "sẽ tìm ngay" after the pick, orphan line · R2 "34 loại" unverifiable, unclosed "(4.7⭐" · R3 two alternatives · R4 no named pick, orphan "Chế độ chống ồn." |
| T5b | ⚠️ | ⚠️ | ⚠️ | ⚠️ | R1 post-hoc · R2 pick with no reason, orphan "😊" · R3 search had no location, alternative "gần hơn (~4.9km)" is farther than 4.8km · R4 two alternatives, orphan "😊" |
| P5b | ⚠️ | ⚠️ | ⚠️ | ⚠️ | R1 post-hoc · R2 two alternatives · R3 caveat stated twice, two alternatives · R4 "2 lựa chọn khác" lists one, orphan line |
| P7b | ❌ | ✅ | ✅ | ❌ | R1 asked again (price), no answer · R4 invented "không cần đặt chỗ trước… không quá đông", "thường ít khách hơn" |
| E2b | ✅ | ❌ | ⚠️ | ❌ | R2 pick name cut, orphan "📍 Địa chỉ: 271 Nguyễn Trãi" · R3 unbacked "cả hai cũng có giá tương tự" · R4 no search, asks again |
| E5b | ⚠️ | ⚠️ | ⚠️ | ❌ | R1 two alternatives · R2 three alternatives, "Công viên 23 tháng 9 … gần nhất" is false · R3 alternative "gần hơn" is false · R4 no search, the whole menu is printed twice |

Note: for R2/R4 the parent of F7b/T5b/P7b/E2b (and S5b for R4) had already searched, so those "b" turns are follow-ups rather than
answers to a clarify turn. They are graded on whether they produce a correct answer.

## 4. Defects by run (short quotes)

### R1 (37/40, b 6/8)
- Post-hoc search narration on about 15 turns, e.g. F2 "Để gợi ý đúng ý, mình sẽ tìm ngay…" and P1 "mình sẽ tìm ngay các spa ở Đà Nẵng 🔍" (after the pick).
- Over-clarified actionable S2: "bạn dùng laptop chủ yếu để làm gì".
- T2 no hotel named: "Mình thấy danh sách khách sạn gần biển Đà Nẵng, nhưng…", inline link "…04)Agoda".
- E6 wrong area plus invented budget fit: "Quán nằm trên Phạm Viết Chánh (Gò Vấp)… mức giá khoảng 100k/người".
- F7b budget spin: "Mức giá 100–600k/người nên bạn có thể ăn ngon trong ngân sách dưới 100k".
- P7b asked twice: "Để gợi ý đúng ý, mình cần thêm: **Tầm giá bạn muốn?**".
- T1 duplicated assumption paragraph ("giả sử bạn đi cuối tuần tới (3-5 tháng 10)" twice) and truncated tail.
- Fragments: F3 "Cách bạn 3.8km.", P8 "Nó cách bạn khoảng 1.6km", E4 "Nên bạn gọi trực tiếp…".

### R2 (22/40, b 7/8)
- Searched 5 of the 8 vague queries (F7, T5, P5, P7, E2) instead of clarifying once.
- Unbacked hard constraints with no heads-up: F3 "nổi tiếng với không gian yên tĩnh", F8 "vài nhà hàng ở Quận 1 có phòng riêng", T8 "sang trọng nhất… không gian yên tĩnh".
- Invented budget fit: F2 "giá dưới 80k như bạn cần" (row 1–100k); P8 "2 spa mở khuya sau 22h" (both close 22:00).
- Unrequested side effect: S7 `save_price_watch` target 1.5tr, "Mình đã lưu theo dõi giá máy lọc không khí cho bạn."
- Wrong fact: S2/S3 "Dell Latitude 5440 (10.89 triệu) rẻ nhất" while a 9.99tr Vostro is in the rows.
- Travel: T1 "Ước tính 800.000-1.000.000 VND/đêm", "Mình đang tìm tiếp...", empty cost bullets; T4 asked instead of searching; T6 mangled "2.\n3.4.".
- Guard fragments: F6 (whole answer) "Nếu bạn muốn chắc chắn có chỗ ngồi…", S1 "Tuy nhiên, nên bạn nên kiểm tra", E2b "📍 Địa chỉ: 271 Nguyễn Trãi, Quận 1."
- F8 offers a capability it lacks: "Bạn muốn mình gọi điện xác nhận giá & phòng riêng".
- Cross-vertical bleed: T2 "Giờ chạy và giá vé cụ thể mình chưa xác nhận được".

### R3 (30/40, b 8/8)
- Search queries drop the subject or location or reuse an earlier query: F2 `"quán ăn tối ngon"` (for bún bò Q1, identical to F1), F4/E6/T5b/E5b/P2 with no location, E8 `"quán ăn ngon có khu trẻ em"`.
- Resulting wrong-kind or wrong-area picks: F2 "Mình nghiêng về quán này" (A Xỉu, not bún bò); F4 "Jungle Family & Kids Cafe (Tân Phú)… Có chỗ đậu xe"; E8 "Mình chọn **A Xỉu - Quán Ăn Ngon**" for kids' play.
- S2 recommends a backpack: "Mình chọn **Ba lô Topo Light pack laptop 15"**".
- T3 bleed: food template "Tầm giá? (dưới 100k/người…)" for a hotel breakfast follow-up.
- T7 asked instead of searching: "**Ngày cụ thể nào bạn muốn bay?**".
- Invented numbers: F3 "cách bạn khoảng 1.5km" (row has no distance); T1 "vé tham khảo ~50-100k/người", "~300-500k/người"; E6 "100-600k/người nên vừa vặn với tầm 100k".
- S1 contradictory: quotes "57.000₫", then "Kết quả chưa có mức giá".
- Budget caveat printed twice on P2, P5b, E2b and F8.

### R4 (28/40, b 4/8)
- Searched 5 of the 8 vague queries (F7, S5, T5, P7, E2). Asked again or failed to answer on E2b and E5b.
- Unbacked hard constraints with no heads-up: F3 "Quán có không khí yên tĩnh, lãng mạn", E3 "không gian chill với nhạc sống chất lượng", T8 " Không gian sang trọng, dịch vụ chất lượng".
- Budget ignored: F7b picks Gyu Shige (300–800k) for "dưới 100k/người". P7b invents "không cần đặt chỗ trước… không quá đông".
- Wrong area: P4 Sả Spa (Bến Thành) for Quận 7; P8 "Sả Spa… mở muộn nhất trong khu vực" presented as Quận 3; E6 Q1 Avatar for Gò Vấp.
- Duplicated text: P5 whole clarify block twice; E5b whole menu twice; T1 "bạn muốn đi máy bay hay xe khách?" twice with no plan.
- Shopping prose omits the pick (S1, S2, S4, S6b) and leaves fragments: "💼", "Chế độ chống ồn.", "Gia trên là tham khảo…".
- Glued sentences: F4/F8 "…nhé.Mình gợi ý", T6 "cho bạn.Hội An", register switch to "Tôi".
- Wrong date in the E5 clarify: "Cuối tuần này (28-29/9)".

## 5. Runs R5, R6

Graded afterwards from `blind/R5`, `blind/R6` (same 48 ids). The rubric and consistency rules are identical to §1–§4.
R1–R4 were not regraded. When R5 or R6 repeats a situation already graded for R1–R4, it gets the same verdict: F3 unbacked
"yên tĩnh" → ❌, F8 private room asserted → ❌, T2 "danh sách" with no hotel named → ❌, T8 unbacked luxury → ❌,
Quận 1 spa presented as Quận 7/Quận 3 → ⚠️, E7 films from model knowledge → ⚠️, a b-turn that asks again → ❌.
New in this pair: a market price range credited to "bài viết tham khảo" / "theo tìm kiếm" that is not in the recorded
rows is graded ⚠️ (unverifiable, not item-level). A malformed card or plan block that leaks raw JSON is graded
⚠️ when the answer is otherwise correct. When the whole plan is lost, it is graded ❌.

### Summary

| run | x/40 | ✅ | ⚠️ | ❌ | b-turns ok/8 | clarify rule on the 8 vague ids |
|---|---|---|---|---|---|---|
| R5 | **28/40** | 6 | 22 | 12 | 5/8 | 3/8 (asked S6 P5 E5; searched F7 S5 T5 P7 E2) |
| R6 | **24/40** | 7 | 17 | 16 | 7/8 | 3/8 (asked S5 S6 E5; searched F7 T5 P5 P7 E2) |

Actionable ids that asked instead of answering: R5 T1 (asked plane or bus twice, no plan), T8 (no tool call; asked dates) ·
R6 T6 (asked 3 questions, list mangled).

### Per vertical (✅/⚠️/❌ → x/8)

| run | F food | S shopping | T travel | P spa | E entertainment |
|---|---|---|---|---|---|
| R5 | 1/4/3 → **5/8** | 2/3/3 → **5/8** | 1/3/4 → **4/8** | 1/6/1 → **7/8** | 1/6/1 → **7/8** |
| R6 | 2/1/5 → **3/8** | 2/4/2 → **6/8** | 1/2/5 → **3/8** | 1/4/3 → **5/8** | 1/6/1 → **7/8** |

### Per turn

| id | R5 | R6 | reason for non-✅ (runs) |
|---|---|---|---|
| F1 | ⚠️ | ✅ | R5 post-hoc "Mình sẽ tìm…", pick reasons thin |
| F2 | ⚠️ | ✅ | R5 80k budget not addressed, two alternatives |
| F3 | ❌ | ❌ | R5 "Quán nướng với không khí yên tĩnh", three options, no heads-up · R6 "nổi tiếng với không gian yên tĩnh", no heads-up |
| F4 | ⚠️ | ❌ | R5 "dễ phục vụ trẻ nhỏ" unbacked, parking deferred to Maps · R6 "cả hai đều có không gian gia đình và chỗ đậu xe", no evidence |
| F5 | ✅ | ⚠️ | R6 answer correct, but the CTA block is unclosed and raw JSON leaks with a stray `</parameter>` |
| F6 | ⚠️ | ❌ | R5 honest "không có dữ liệu real-time" but never names quán số 2 · R6 fragment "Nếu bạn muốn chắc chắn, có thể:", no venue, no answer |
| F7 | ❌ | ❌ | both searched a vague query; R5 also has an orphan "😊" |
| F8 | ❌ | ❌ | R5 Nori "phù hợp tiệc sinh nhật với phòng riêng" (no evidence), inline Maps link, "cần tìm thêm" narration · R6 "vài nhà hàng ở Quận 1 có phòng riêng", no single pick |
| S1 | ❌ | ❌ | rows are listicles only · R5 garbled "mình thấy có giá rẻ, phù hợp…", no pick, inline images and TikTok link in prose · R6 quotes "57.000₫… bảo hành 12 tháng" (not in rows), name cut |
| S2 | ⚠️ | ⚠️ | R5 prose has no pick, dangling "vài lựa chọn khác…:", "Tôi" · R6 unclosed parens "(Ryzen 7…", "(16GB, 512GB" |
| S3 | ✅ | ❌ | R6 "Không có đánh giá trên trang bán" (row: 4.2⭐/143), attributes the Acer's Ryzen 7 to the HP |
| S4 | ⚠️ | ⚠️ | R5 card recommends a 375k robot for a 5–7tr band, prose has no pick · R6 "vừa nằm trong tầm giá" for 4.489tr (below band) |
| S5 | ❌ | ✅ | R5 ran 3 searches, card recommends a baby birthday cake, orphan lines |
| S6 | ✅ | ✅ | |
| S7 | ❌ | ⚠️ | R5 three nameless paragraphs, no pick · R6 asks budget/purpose after search, no single pick, glued bullets |
| S8 | ⚠️ | ⚠️ | R5 post-hoc "sẽ tìm", three nameless fragments · R6 post-hoc, two alternatives, missing period |
| T1 | ❌ | ❌ | R5 no plan; "bạn muốn đi máy bay hay xe khách?" asked twice · R6 plan JSON truncated (no `[/TAPPY_PLAN]`, cut `share_text`, cut CTA), 08:00 breakfast at a 10:00-open venue, "giá phòng hợp lý trong ngân sách" unbacked |
| T2 | ❌ | ❌ | no hotel named in prose · R5 inline Booking link · R6 showtime/ticket heads-up (wrong vertical) |
| T3 | ✅ | ✅ | |
| T4 | ⚠️ | ⚠️ | R5 post-hoc "sẽ tìm" · R6 three options, no single pick, "vui chơi cho trẻ em" at the book street unbacked |
| T5 | ❌ | ❌ | both searched a vague query |
| T6 | ⚠️ | ❌ | R5 "Tôi", glued "bạn.Hội An", nameless Old Town paragraph, Maps links in prose · R6 asked 3 questions, then repeated them as mangled "2.3." |
| T7 | ⚠️ | ⚠️ | flight tool empty, honest, links in prose (rubric ⚠️) |
| T8 | ❌ | ❌ | R5 no tool call; asked dates · R6 picks Rio Guest House, "được đánh giá như một resort chất lượng cao", no heads-up |
| P1 | ⚠️ | ⚠️ | "Theo các bài viết tham khảo, giá… 250k–1.2tr / 250k–950k" not in rows · R5 "Cả hai đều nằm ở khu An Hải" (Bliss is Hải Châu) · R6 "Nếu bạn ưu tiên giá rẻ hơn, Jang Mi" unbacked |
| P2 | ⚠️ | ⚠️ | R5 "Cả hai spa này" with one named · R6 truncated "Bạn có thể gọi trực tiếp **(+84." |
| P3 | ✅ | ✅ | |
| P4 | ⚠️ | ⚠️ | R5 Sả Spa & Onsen (Bến Thành, Q1) for Quận 7, "sạch sẽ" inferred from review count · R6 quiet/clean not addressed |
| P5 | ⚠️ | ❌ | R5 one clarify turn, but the block is printed twice with a stray "2." · R6 searched immediately |
| P6 | ⚠️ | ⚠️ | unbacked couple-service claims: R5 "Cả hai… phù hợp cho couple massage", R6 "có dịch vụ couple massage" |
| P7 | ❌ | ❌ | both searched a vague query |
| P8 | ⚠️ | ❌ | R5 hours correct, but the pick Sả Spa & Onsen (Bến Thành, Q1) is presented as Quận 3 · R6 "2 spa mở khuya sau 22h" then "Cả hai đều mở đến 22:00" |
| E1 | ✅ | ✅ | |
| E2 | ❌ | ❌ | both searched a vague query |
| E3 | ⚠️ | ⚠️ | R5 live music neither evidenced nor warned ("phù hợp với vibe bạn tìm"), fragment "(0.3km) và 4.8⭐)" (row 4.9) · R6 clarify question on an actionable query, "thường có nhạc sống" unbacked, orphan "🎵" |
| E4 | ⚠️ | ⚠️ | R5 "hầu hết các quán bar ở đây đều có hỗ trợ giữ xe… nên bạn yên tâm" · R6 narration printed twice, unsourced Bodega Bar parking example |
| E5 | ⚠️ | ⚠️ | model-authored menu with a wrong weekend date: R5 "(28-29/9)", R6 "(27-28/9)" |
| E6 | ⚠️ | ⚠️ | R5 "lựa chọn hàng đầu ở Gò Vấp" for Avatar (address Cầu Ông Lãnh, Q1), budget not addressed · R6 "tầm 100k/người là khá hợp lý" unbacked, two alternatives |
| E7 | ⚠️ | ⚠️ | films from model knowledge (2024 titles), no tool |
| E8 | ⚠️ | ⚠️ | R5 two alternatives · R6 three options, no single pick |

b-turns:

| id | R5 | R6 | reason for non-✅ (runs) |
|---|---|---|---|
| F7b | ❌ | ❌ | R5 asks again ("muốn ăn **loại gì**"), then picks Béo Ơi (100–200k) with no reason · R6 picks CoCo Ichibanya (100–200k) for under 100k, no reason |
| S5b | ❌ | ⚠️ | R5 rows are listicles/books; "G'OOD G'IRL 460.000", "Tom Ford… 452.400" not in rows · R6 fragment "trên Shopee ( 💝", confused size trade-off, glued FOLLOWUPS |
| S6b | ⚠️ | ⚠️ | R5 pick with no reason, two alternatives · R6 prose never names the pick, two alternatives |
| T5b | ⚠️ | ⚠️ | R5 pick reasons vague, activities unbacked, two alternatives · R6 two alternatives, "bowling mini" unbacked |
| P5b | ⚠️ | ✅ | R5 "Norah Spa là lựa chọn tốt nhất vì:" followed by a bullet about Cổ Phong |
| P7b | ⚠️ | ✅ | R5 two alternatives |
| E2b | ❌ | ⚠️ | R5 no search, no answer, asks again · R6 "theo tìm kiếm, giá vé… 45.000-95.000" (no such search this turn), "CGV… chất lượng cao hơn" unbacked |
| E5b | ⚠️ | ⚠️ | R5 post-hoc "sẽ tìm", pick reason thin · R6 two alternatives |

### Defects by run (short quotes)

#### R5 (28/40, b 5/8)
- Searched 5 of the 8 vague queries (F7, S5, T5, P7, E2). Asked on T8 without searching. T1 has no plan and asks "máy bay hay xe khách?" twice.
- Unbacked hard constraints: F3 "Quán nướng với không khí yên tĩnh"; F8 "phù hợp tiệc sinh nhật với phòng riêng".
- Shopping prose collapses: S1 "mình thấy có giá rẻ, phù hợp nếu bạn ưu tiên tiết kiệm" plus inline images and TikTok link; S7 three nameless paragraphs.
- Prices not in rows: S5b "Nước hoa nữ G'OOD G'IRL 100ML… 460.000 VND".
- b-turns re-ask or ignore the budget: F7b "mình cần biết bạn muốn ăn **loại gì**"; E2b "Bạn muốn xem phim gì hoặc chọn suất chiếu nào không?".
- Wrong district: P4/P8 Sả Spa & Onsen (Bến Thành) for Quận 7/Quận 3; E6 "lựa chọn hàng đầu ở Gò Vấp" for a Q1 venue.
- Duplicated text: P5 clarify block printed twice with a trailing "2.".

#### R6 (24/40, b 7/8)
- Searched 5 of the 8 vague queries (F7, T5, P5, P7, E2). T6 asked 3 questions, then repeated them as a mangled "2.3.".
- Unbacked hard constraints: F3 "nổi tiếng với không gian yên tĩnh"; F4 "cả hai đều có… chỗ đậu xe"; F8 "vài nhà hàng ở Quận 1 có phòng riêng"; T8 Rio Guest House "được đánh giá như một resort chất lượng cao".
- False hours claim: P8 "2 spa mở khuya sau 22h", then "Cả hai đều mở đến 22:00".
- Wrong facts: S3 "Không có đánh giá trên trang bán hàng" (143 reviews); S1 "57.000₫… bảo hành 12 tháng" not in rows.
- Broken markup: T1 plan JSON truncated (no `[/TAPPY_PLAN]`); F5 unclosed CTA leaking `</parameter>`; P2 "gọi trực tiếp **(+84.".
- Guard fragments: F6 (whole answer) "Nếu bạn muốn chắc chắn, có thể:"; S2 "(16GB, 512GB"; S5b "( 💝".
- Cross-vertical bleed: T2 "Giờ chạy và giá vé cụ thể mình chưa xác nhận được".

## 6. Runs R7, R8

Graded afterwards from `blind/R7`, `blind/R8` (same 48 ids), with the same rubric and consistency rules as §1–§5, including
the two §5 additions:
- an unsourced market price range → ⚠️;
- leaked or truncated markup → ⚠️, or ❌ when the plan is lost.

Earlier runs were not regraded. Two situations recur often here:
- a clarify question asked after the search, on an actionable query, with no pick given → ❌ (same as R6 T6);
- a plan that schedules breakfast at a venue before its listed opening, with no invented prices → ⚠️. R2, R3 and R6 were ❌
  only because the same defect came with invented prices or a truncated plan.

### Summary

| run | x/40 | ✅ | ⚠️ | ❌ | b-turns ok/8 | clarify rule on the 8 vague ids |
|---|---|---|---|---|---|---|
| R7 | **24/40** | 6 | 18 | 16 | **8/8** | 3/8 (asked S5 S6 E5; searched F7 T5 P5 P7 E2) |
| R8 | **26/40** | 8 | 18 | 14 | 5/8 | 4/8 (asked S5 S6 T5 E5; searched F7 P5 P7 E2) |

Actionable ids that asked instead of answering: R7 T4 (no tool call), T6 (4 questions, mangled "2.3.4."), E3 (asked area after
search) · R8 T4 (no tool call), E3 (asked vibe after search, no pick), T2 (asks dates, no hotel named).

### Per vertical (✅/⚠️/❌ → x/8)

| run | F food | S shopping | T travel | P spa | E entertainment |
|---|---|---|---|---|---|
| R7 | 0/2/6 → **2/8** | 3/4/1 → **7/8** | 1/2/5 → **3/8** | 1/5/2 → **6/8** | 1/5/2 → **6/8** |
| R8 | 1/2/5 → **3/8** | 3/4/1 → **7/8** | 2/3/3 → **5/8** | 1/4/3 → **5/8** | 1/5/2 → **6/8** |

### Orphan-fragment / guard-cut-sentence turns (all 48 turns per run)

"Fragment" means an orphan line or sentence left by a cut. Examples: a lone emoji line, a sentence that starts with "Hoặc"/"Ngoài ra"
with nothing before it, an unclosed paren or italic, a pick name cut out ("Đây là lựa chọn…" with no name), a list that promises N
items and shows fewer, or a mangled numbered list. Duplicated blocks and leaked or truncated markup are not counted here.

| run | fragment turns / 48 | turns |
|---|---|---|
| R7 | **15** | F2 F3 F6 F7 S1 S5b T1 T5b T6 T8 P2 P4 P5b P8 E5b |
| R8 | **14** | F1 F7b S1 S2 S4 S5b S7 S8 T1 T2 T8 P2 P8 E6 |
| R2 (retro) | 12 | F1 F6 S1 S2 S6b S8 T1 T2 T5b T6 E2b E4 |
| R4 (retro) | 11 | F8 S1 S2 S5 S6b S7 S8 T5b T6 T8 P5b |
| R5 (retro) | 11 | F7 S1 S2 S5 S7 S8 T6 P2 P5 P5b E3 |
| R6 (retro) | 7 | F6 S1 S2 S5b T6 P2 E3 (plus 2 markup truncations not counted: F5 CTA leak, T1 plan cut) |

The R2/R4/R5/R6 counts are rebuilt from my per-turn grading notes, not from a new pass over the transcripts. Treat them as ±1
per run: minor cases, such as an unclosed trailing italic on an otherwise clean turn, were not always noted. R1 and R3 were not
counted.

### Per turn

| id | R7 | R8 | reason for non-✅ (runs) |
|---|---|---|---|
| F1 | ⚠️ | ⚠️ | pick given with no reason · R7 asks "Bạn muốn chọn quán nào?" · R8 orphan " Hoặc **Hải Sản Hoàng Gia**…" |
| F2 | ❌ | ❌ | R7 prose is only two orphan lines ("Địa chỉ 84/32 Bùi Viện…", "Chỉ khác là review nhiều hơn…"), no pick named · R8 "giá dưới 80k như bạn cần" (row 1–100k) |
| F3 | ❌ | ❌ | unbacked quiet claims, no heads-up · R7 "quán ở tầng thượng nên yên tĩnh", orphan " Địa chỉ: 428 Võ Văn Tần." · R8 "không gian yên tĩnh" |
| F4 | ❌ | ❌ | parking asserted: R7 "khu vực này có chỗ đậu xe ô tô 👍"; R8 "Không gian rộng, có chỗ đậu xe ô tô" |
| F5 | ❌ | ✅ | R7 hours correct, but restates "có chỗ đậu xe ô tô như bạn cần" (unbacked) and invents "11h-14h… đông khách nhất" |
| F6 | ⚠️ | ⚠️ | R7 speculates "các quán udon & sushi… thường khá đông", cut "Ngoài ra" · R8 honest "không có số liệu thực time" but never names quán số 2 |
| F7 | ❌ | ❌ | both searched a vague query; R7 also has an orphan "😊" |
| F8 | ❌ | ❌ | both open "Mình tìm được vài nhà hàng ở Quận 1 có phòng riêng" (no evidence), glued "nhé.Mình" |
| S1 | ⚠️ | ❌ | R7 card pick not named in prose, orphan "Vừa có rating cao nhất trong danh sách." · R8 rows are listicles, "Mình thấy có.", price caveat with no price, inline images and TikTok link |
| S2 | ⚠️ | ⚠️ | R7 two alternatives · R8 "Tôi sẽ…", unclosed paren "(16GB RAM, 256GB SSD, màn hình cảm ứng —", unclosed italic |
| S3 | ✅ | ✅ | |
| S4 | ❌ | ⚠️ | R7 rows = 1 listicle, yet prose quotes "4.7⭐ (88 đánh giá) trên Google Maps, giá 4.489.000" and "Cơ chế chống rối tóc" · R8 pick 3.69tr "trong tầm giá" (below band), orphan "Nếu muốn có thêm đánh giá… — nhiều hơn" |
| S5 | ✅ | ✅ | |
| S6 | ✅ | ✅ | |
| S7 | ⚠️ | ⚠️ | R7 "Tôi sẽ tìm…" post-hoc · R8 "Tôi sẽ…", garbled cut "(**5⭐** (ví dụ: lọc bụi, khử mùi…", reply ends abruptly |
| S8 | ⚠️ | ⚠️ | R7 post-hoc "sẽ tìm kiếm", missing period, glued "thẻ bên dưới.[FOLLOWUPS]" · R8 "40 mẫu" unverifiable, dangling "so sánh giá trên các nền tảng:" |
| T1 | ❌ | ⚠️ | R7 invented "Giá tham khảo ~800.000-1.000.000 VND/đêm", "Vé ~30.000 / ~150.000", fit claim "tổng ngân sách 6 triệu… bao gồm vé máy bay", 08:00 at a 10:00-open venue · R8 plan grounded, but 08:00 meals at two 10:00-open venues, empty cost bullet "- Khách sạn 2 đêm", leaked "Mình đang tìm kiếm…Tuyệt vời!" |
| T2 | ❌ | ❌ | no hotel named · showtime/ticket heads-up (wrong vertical) in both · R8 prose is only a date question plus orphan "🏨" |
| T3 | ✅ | ✅ | |
| T4 | ❌ | ❌ | both: no tool call; asked activity type |
| T5 | ❌ | ✅ | R7 searched a vague query |
| T6 | ❌ | ⚠️ | R7 asked 4 questions, then repeated them as mangled "2.3.4." · R8 plan OK, but "mở từ 10:00 nhưng bạn có thể đến sớm" (08:00 slot), glued "tại đây.Hội An", narration |
| T7 | ⚠️ | ⚠️ | flight tool empty, honest, links in prose · R8 prose loses its diacritics ("Mình chua co ket qua gia ve…") and adds a showtime heads-up |
| T8 | ⚠️ | ❌ | R7 Poplar pick with no reason, orphan " Ngoài ra, **Ocean Bay**…", two alternatives · R8 orphan " Không gian yên tĩnh, dịch vụ chất lượng…", no heads-up |
| P1 | ⚠️ | ⚠️ | "Theo kết quả tìm kiếm, giá… 250k–1.2tr" not in rows (§5 rule) |
| P2 | ⚠️ | ⚠️ | pick name cut: R7 "Đây là lựa chọn được tin cậy nhất…", R8 "Chỗ này được nhiều khách review tích cực…" (Hạ Spa only in the CTA); price honest |
| P3 | ✅ | ✅ | |
| P4 | ⚠️ | ⚠️ | quiet/clean not addressed · R7 rating line cut, orphan " Mở từ 8h sáng…" · R8 two alternatives, "không gian hiện đại" unbacked |
| P5 | ❌ | ❌ | both searched a vague query |
| P6 | ⚠️ | ⚠️ | both: Hạ Spa "rất phù hợp cho couple massage" (unbacked), no rating in the pick |
| P7 | ❌ | ❌ | both searched a vague query |
| P8 | ⚠️ | ❌ | R7 lists AN MIÊN (22:00) and a nameless 24h spa (name cut), but ends honestly "SAIGON STAR mở cả ngày sẽ an toàn hơn" · R8 AN MIÊN "Mở đến 22:00 — đúng giờ bạn cần" for after-22h, nameless second spa |
| E1 | ✅ | ⚠️ | R8 two alternatives |
| E2 | ❌ | ❌ | both searched a vague query |
| E3 | ❌ | ❌ | searched, then asked instead of picking · R7 "bạn muốn quán bar gần nhất… hay ở khu vực nào" · R8 "acoustic/jazz chill hay rock/live band?" |
| E4 | ⚠️ | ✅ | R7 honest (no venue from E3), but the whole block is printed twice |
| E5 | ⚠️ | ⚠️ | model-authored menu, wrong weekend "(27-28/9)" |
| E6 | ⚠️ | ⚠️ | honest "chưa có chỗ nào xác nhận giá", no single pick, system leak "Hệ thống đã loại 5 chỗ khác vì vượt ngân sách" · R8 orphan "🎤" |
| E7 | ⚠️ | ⚠️ | films from model knowledge, no tool; R7 labels "Ròm", "Tôi Thấy Hoa Vàng…" as "hồi hộp, kịch tính" |
| E8 | ⚠️ | ⚠️ | two alternatives each; R7 "dịch vụ tiệc cho trẻ em" unbacked |

b-turns:

| id | R7 | R8 | reason for non-✅ (runs) |
|---|---|---|---|
| F7b | ⚠️ | ❌ | R7 picks Haidilao with only the hours as a reason, two alternatives, honest "chưa xác nhận được giá" · R8 "dựa vào tên gọi và danh giá, đây là lựa chọn hợp lý… trong tầm ngân sách" with no price, unclosed italic |
| S5b | ⚠️ | ⚠️ | cut join "5⭐ từ người mua Calvin Klein là…" (review count removed) · R7 two alternatives · R8 garbled "chưa xác nhận được hương thơm cụ thể phù hợp với bạn gái không." |
| S6b | ⚠️ | ⚠️ | R7 two alternatives · R8 pick never named in prose, three alternatives |
| T5b | ⚠️ | ❌ | R7 cut join "cho nhóm bạn!chất lượng cao nhất", two alternatives · R8 no search; asks again (6-option menu) |
| P5b | ⚠️ | ⚠️ | R7 "gần nhất (1.3km)" is false (HANA 0.7km), orphan "Cả hai đều có website/hotline" with one named · R8 "SIZ SPA gần hơn (1.7km)" is false vs 1.3km, two alternatives |
| P7b | ✅ | ⚠️ | R8 "Nemo… có thể phục vụ 2 người cùng lúc" unbacked |
| E2b | ⚠️ | ⚠️ | "theo các kết quả tìm kiếm, giá vé… 45.000–115.000" not in rows · R8 adds "nên bạn hoàn toàn có thể tìm được vé dưới 200k" and 4 alternatives |
| E5b | ⚠️ | ❌ | R7 post-hoc "sẽ tìm", two alternatives, orphan " Mình giúp tìm quán gần đó!" · R8 no search; asks type/company/budget again |

### Defects by run (short quotes)

#### R7 (24/40, b 8/8, fragments 15/48)
- Food collapses to 2/8. F2 is only orphan lines ("Địa chỉ 84/32 Bùi Viện…"). F3/F4/F5 assert quiet and parking ("khu vực này có chỗ đậu xe ô tô 👍"). F8 asserts private rooms.
- Searched 5 of the 8 vague queries (F7, T5, P5, P7, E2). Asked instead of answering on T4, T6 (mangled "2.3.4.") and E3.
- Invented numbers: T1 "Giá tham khảo ~800.000-1.000.000 VND/đêm", "Vé tham khảo ~30.000"; S4 "4.7⭐ (88 đánh giá)… 4.489.000" from a listicle-only result.
- Guard cuts removing pick names or reasons: S1 "Vừa có rating cao nhất trong danh sách."; P2 "Đây là lựa chọn được tin cậy nhất…"; P8 nameless 24h spa; T5b "nhóm bạn!chất lượng cao nhất".
- Duplicated block: E4. System leak: E6 "Hệ thống đã loại 5 chỗ khác vì vượt ngân sách".
- Strength: every clarify answer turn produced an answer (8/8).

#### R8 (26/40, b 5/8, fragments 14/48)
- Searched 4 of the 8 vague queries (F7, P5, P7, E2). Asked again on T5b and E5b. Asked instead of answering on T4, E3 and T2.
- Unbacked hard constraints: F3 "không gian yên tĩnh"; F4 "có chỗ đậu xe ô tô"; F8 "có phòng riêng"; T8 " Không gian yên tĩnh, dịch vụ chất lượng".
- False fits: F2 "giá dưới 80k như bạn cần"; P8 "Mở đến 22:00 — đúng giờ bạn cần"; F7b "hợp lý… trong tầm ngân sách" with no price.
- Shopping fragments: S1 "Mình thấy có."; S7 "(**5⭐** (ví dụ: lọc bụi…"; S8 "so sánh giá trên các nền tảng:" (nothing follows).
- Language: T7 prose without diacritics ("Mình chua co ket qua gia ve truc tuyen…").
- Better than R7 on travel (T1 plan grounded, T5 clarified correctly) and on T6 (plan emitted).
