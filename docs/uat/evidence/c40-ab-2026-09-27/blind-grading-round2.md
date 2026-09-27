# Consultative-40 — blind round 2 (S1–S4)

Graded blind from `blind2/dump-{F,P,E,T,S}.txt` plus the per-id JSON. Configurations are unknown and were not inferred.

The rubric is C1–C9 from `docs/audit/eval/consultative-40.md`, with the same conventions and consistency rules as
`docs/uat/evidence/c40-ab-2026-09-27/blind-grading.md` §1–§6.
- PASS = ✅.
- PASS⚠ = pass with a note. It counts toward /40.
- FAIL = ❌.

The 8 non-actionable ids (F7 S5 S6 T5 P5 P7 E2 E5) must ask exactly one clarify question and must not search. The other 32
must search without asking. **As instructed, each "b" follow-up is graded as part of its parent.** A parent passes only if
the clarify turn is correct AND its b answer passes. For comparison, the old convention (clarify turn only, b counted
separately) is also given in §2.

Codes for failing criteria:
- **ACT**: clarify rule broken (searched a vague id, asked instead of searching an actionable id, or asked twice).
- **C1**: wrong reading of the situation, or the wrong kind or area of place.
- **C2**: no pick, or conflicting picks.
- **C3**: an unbacked hard-constraint claim (quiet, parking, private room, luxury).
- **C5**: a number or fit claim not in the rows (price, distance, hours).
- **C7**: layout.
- **C9**: a fragment, or no answer at all.

Standing rules (unchanged from earlier rounds):
- An unbacked hard constraint with no heads-up → FAIL. The same claim next to a heads-up → PASS⚠.
- A number not in the rows (distance, price, budget fit, hours fit) → FAIL.
- One orphan fragment → PASS⚠. Two or more fragments with no named pick → FAIL.
- Post-hoc "mình sẽ tìm ngay" after the tool already ran, or two or more alternatives → PASS⚠.
- Wrong district → PASS⚠, unless it comes with a fabricated claim. E7 films from model knowledge → PASS⚠.
- A market price range credited to "search" but not in the rows → PASS⚠. Shopping prose that does not name the card's pick → PASS⚠.

Time context used for open/closed checks: the runs state "bây giờ là 23:41" (S1 and S3) or "20:34" (S2 and S4).

## 1. Per-id table

| id | S1 | S2 | S3 | S4 | notes (non-✅) |
|---|---|---|---|---|---|
| F1 | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | S1/S2/S3 post-hoc "mình sẽ tìm ngay" preamble; S1 CTA "Tìm phòng trên Haisanhoanggia" on a restaurant · S4 pick given with no reason, orphan "😊" |
| F2 | FAIL C5 | PASS⚠ | PASS | FAIL C5 | S1 backstop "Mình chọn Bún Bò Cô Tiên… 08:00–12:30", then "Quán mở từ 6:30–22:00. Bún bò thố đá…" (Bếp Ông Cậu's facts under Cô Tiên's name); "gần bạn hơn (~0.8km)" but the rows have no distance · S2 post-hoc, two alternatives · S4 "giá dưới 80k như bạn cần" but the row says 1–100k |
| F3 | PASS⚠ | PASS⚠ | PASS⚠ | FAIL C3 | S1 post-hoc, quiet heads-up present · S2 orphan "Cách bạn 3.8km." · S3 post-hoc; "Nếu muốn không khí yên tĩnh hơn, Trên Tầng Thượng" is unbacked but sits beside the heads-up · S4 "nổi tiếng với không gian yên tĩnh" with no heads-up |
| F4 | PASS⚠ | PASS | FAIL C1 | PASS⚠ | S1 post-hoc, thin pick with no rating ("hoàn hảy"), gap sentence present · S3 lunch pick is Ngọc Hương, which opens at 15:00 ("ăn trưa sớm hoặc ăn chiều"), while Tám Riêu fits lunch · S4 parking and kids only implied, glued "nhé.Mình", two alternatives |
| F5 | FAIL C9 | PASS | PASS | PASS | S1 re-searched by name but never gives the hours: "Mình cần kiểm tra lại giờ mở cửa…", rating line, heads-up only |
| F6 | PASS⚠ | PASS | PASS⚠ | FAIL C9 | S1/S3 re-search by name (Quán Bụi Central, correct #2); honest "không có thông tin về tình trạng đông"; closed-at-23:41 is consistent with the row; but the closing line "Giờ mở cửa mình chưa xác nhận được" contradicts the hours just quoted; S1 speculates "vào giờ tối thường có khá nhiều khách"; CTAs "Tìm phòng trên Quan-bui" / "Đặt bàn qua Chope" · S4 the whole answer is a fragment ("Nếu bạn muốn chắc chắn có chỗ ngồi…"): no venue, no answer |
| F7 (+F7b) | PASS⚠ | FAIL C5 (b) | PASS⚠ | FAIL ACT | F7: S1/S2/S3 one clarify turn ✅; S4 searched · F7b: S1/S3 Bún Thái A Tùng, row 1–100k (fits the under-100k budget), 3.5 km, open; search query "quán ăn khuya" has no location; two alternatives (⚠️) · S2 picks Nori (100–600k) with "có thể ăn ngon trong ngân sách dưới 100k nếu chọn các món vừa phải (ramen, donburi…)" ❌ · S4 honest price caveat ✅ |
| F8 | PASS⚠ | PASS⚠ | PASS⚠ | FAIL C3 | S1 opens with an honest "chưa xác nhận được thông tin phòng riêng", but the 500k budget is not addressed and there are two alternatives · S2 unbacked "chuyên phục vụ nhóm lớn" · S3 "chuyên tổ chức tiệc và có thể sắp xếp phòng riêng" (unbacked, next to a heads-up), post-hoc · S4 "vài nhà hàng ở Quận 1 có phòng riêng" with no heads-up, no single pick, offers to "gọi điện xác nhận" |
| P1 | PASS⚠ | PASS⚠ | PASS⚠ | PASS | S1 Bali Spa "gần vị trí bạn" (user is in HCMC), cheapness not addressed, two alternatives · S2 backstop pick line, then post-hoc "sẽ tìm ngay" · S3 soft pick ("nổi bật nhất"), two alternatives, cheapness deferred |
| P2 | FAIL C5 | PASS⚠ | PASS⚠ | PASS | S1 asks massage type on an actionable query, "~0.8km" with no distance in the rows, "2 spa nổi bật" but lists one · S2 post-hoc, two alternatives · S3 asks, then leaks narration "Để mình tìm nhanh, mình sẽ search…", two picks |
| P3 | PASS⚠ | PASS | PASS⚠ | PASS⚠ | S1/S3 re-search by name; website and phone are not in the row fields (unverifiable); orphan " Bạn nên…"; irrelevant budget line · S4 "GrabSpa" suggestion |
| P4 | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | S1 post-hoc; Da'an "không gian riêng tư hơn" unbacked (beside the heads-up) · S2 post-hoc · S3 post-hoc, two alternatives · S4 quiet/clean not addressed |
| P5 (+P5b) | PASS⚠ | PASS⚠ | PASS⚠ | FAIL ACT | P5: S1/S2/S3 one clarify turn ✅; S4 searched · P5b: S1 search has no location; two options with no single pick; caveat stated twice · S2 post-hoc · S3 "Lisa… gần hơn nữa (0.5km)" is false vs 0.4 km; caveat twice |
| P6 | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | S1/S3 post-hoc, Ria SPA open to 00:00 is grounded, two alternatives, "đặt gói couple" implied · S2 "Hạ Spa… gần hơn (2.3km)" vs 1.3 km · S4 "lựa chọn uy tín nhất… cho dịch vụ couple massage" unbacked, Fresha |
| P7 (+P7b) | PASS⚠ | FAIL ACT (b) | PASS⚠ | FAIL ACT | P7: S1/S2/S3 one clarify turn ✅; S4 searched · P7b: S1/S3 search "spa massage" with no gội đầu term; Lisa pick grounded; two alternatives (⚠️) · S2 asks the price again, no answer ❌ |
| P8 | PASS | PASS⚠ | FAIL C5 | FAIL C5 | S1 SAIGON STAR "mở cả ngày" (row) in Quận 3, AN MIÊN "22:00 (sát giờ)" stated honestly · S2 orphan "Nó cách bạn…", pick closes at 22:00 · S3 Chuỵ Ba till 03:30 is grounded, but "cách bạn khoảng 1.2km" with no distance in the rows · S4 "2 spa mở khuya sau 22h" but both close at 22:00 ("đúng giờ bạn cần") |
| E1 | PASS⚠ | PASS⚠ | PASS⚠ | PASS | S1/S3 post-hoc; Empire Club (a club) described as "quán bar karaoke… hát karaoke" (unbacked) · S2 post-hoc |
| E2 (+E2b) | PASS⚠ | PASS | PASS⚠ | FAIL ACT | E2: S1/S2/S3 one clarify turn ✅; S4 searched · E2b: S1 Galaxy pick grounded, honest price line, two alternatives · S3 "4.3⭐… cao nhất trong danh sách" (CGV is 4.4), truncated "Bạn có thể vào trang CGV.vn hoặc [GalaxyCine.vn]" with an inline link · S4 pick name cut ("📍 Địa chỉ: 271 Nguyễn Trãi") ❌ (the parent already fails) |
| E3 | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | all: post-hoc or live-music heads-up; S4 asks live band vs DJ and gives two alternatives |
| E4 | PASS⚠ | PASS⚠ | FAIL C5 | PASS⚠ | S1 re-search, cut "Tuy nhiên", nearby lots named, stray live-music line · S2 fragment "Nên bạn gọi…" · S3 "Bãi Xe Parking Pro (2B Phạm Ngũ Lão, cách khoảng 200m)" with no distance in the rows, cut "Tuy nhiên" · S4 missing first bullet, speculates "nhiều khả năng quán có hợp tác với bãi giữ xe" |
| E5 (+E5b) | FAIL C2 (b) | PASS⚠ | PASS⚠ | PASS⚠ | E5: S1/S2/S3 one clarify turn ✅; S4 bullet menu with wrong dates "(28-29/9)" (⚠️) · E5b: S1 backstop "Mình chọn Khu vui chơi thiếu nhi", then "mình chọn Công viên Gia Định" (two conflicting picks, children's play areas, search has no location) ❌ · S2 two alternatives · S3 Vietopia "lớn nhất gần bạn" (unbacked superlative) · S4 three alternatives, "gần nhất" is false |
| E6 | PASS⚠ | FAIL C5 | PASS⚠ | PASS | S1 KAMELA backstop pick (Gò Vấp ✓, row 1–100k), post-hoc narration · S2 Avatar (Cầu Ông Lãnh, Quận 1) labelled "(Gò Vấp)" plus "phù hợp… với mức giá khoảng 100k/người" with no price in the row · S3 backstop pick, orphan " Phòng karaoke theo video…", post-hoc |
| E7 | PASS⚠ | PASS⚠ | FAIL C3 | PASS⚠ | films from model knowledge (2024 titles), no tool (⚠️ precedent) · S3 also invents a garbled, vulgar-looking title "Ngôi Nhà Địt Nhân" |
| E8 | PASS | PASS⚠ | PASS⚠ | PASS⚠ | S1 tiNiWorld Crescent 4.7⭐/932, 5.7 km, hours grounded, one alternative · S2 two alternatives, post-hoc · S3 post-hoc; Tinker Box "sạch sẽ, an toàn" unbacked · S4 three options, no single pick |
| T1 | PASS⚠ | PASS⚠ | PASS⚠ | FAIL C5 | S1 plan grounded; "giá hợp lý cho 2 đêm", "hầu hết miễn phí hoặc giá vé rẻ" unbacked; narration printed twice; 3D museum at 08:00 vs its 08:30 opening · S2 assumption paragraph duplicated, truncated tail · S3 plan grounded, "Tuyệt vời!" narration · S4 "Ước tính 800.000-1.000.000 VND/đêm" (invented), breakfast at a 10:30-open venue, leaked "Mình đang tìm tiếp…", empty cost bullets |
| T2 | PASS⚠ | FAIL C2 | PASS⚠ | FAIL C2 | S1 fragment "Để gợi ý chính xác, mình cần tìm ngay.", two hotels, no single pick, honest price · S3 backstop M Hotel pick, then asks for dates while assuming 1 night · S2 "Mình thấy danh sách…" with no hotel named, inline link glued ")Agoda" · S4 no hotel named, cut sentence, showtime/ticket heads-up |
| T3 | FAIL C1 | PASS | FAIL C1 | PASS | S1/S3 answer the hotel-breakfast follow-up with the FOOD clarify template ("Tầm giá… /người") |
| T4 | PASS⚠ | PASS | FAIL C1 | FAIL ACT | S1 post-hoc, Thảo Cầm Viên grounded · S3 searched restaurants and picks Hàng Dương Quán for a family outing, "được nhiều gia đình yêu thích vì không gian thoáng" unbacked · S4 asked instead of searching |
| T5 (+T5b) | PASS⚠ | PASS⚠ | PASS⚠ | FAIL ACT | T5: S1/S2/S3 one clarify turn ✅; S4 searched · T5b: S1/S3 search has no location; the pick is a children's play area for a 3–5 group; two alternatives · S2 post-hoc |
| T6 | PASS⚠ | PASS⚠ | PASS⚠ | FAIL ACT | S1 itinerary plus plan, grounded; the plan block comes after FOLLOWUPS (C7 order) and repeats the prose · S2 post-hoc, unbacked breakfast claim · S3 plan grounded, "594 km" unsourced · S4 asked 4 questions, then repeated them as mangled "2.\n3.4." |
| T7 | FAIL ACT | PASS⚠ | FAIL ACT | PASS⚠ | S1/S3 no tool call; asked for the date · S2/S4 flight tool empty, honest, links in prose |
| T8 | PASS⚠ | PASS | PASS⚠ | FAIL C3 | S1 opens with a breakfast question (topic bleed: "bạn muốn ăn sáng ở đâu hôm nay hay là tìm resort trước?"), breakfast followups; Ocean Bay "được khen về view biển, spa, dịch vụ tuyệt vời" unbacked (beside an upscale heads-up) · S3 "Cả hai đều nằm trên đường Trần Hưng Đạo" unbacked, heads-up present · S4 Poplar "sang trọng nhất… không gian yên tĩnh, dịch vụ chất lượng cao" with no heads-up |
| S1 | PASS⚠ | PASS | PASS⚠ | FAIL C9 | S1 prose never names the card's pick (M10 29.9k); opens on the alternative · S3 orphan "Bảo hành 12 tháng nữa." · S4 no named pick, fragments "Tuy nhiên, nên bạn nên…", "Nếu ưu tiên **giá rẻ nhất**" |
| S2 | PASS⚠ | FAIL ACT | FAIL C1 | PASS⚠ | S1 card recommends a backpack, but the prose catches it ("không phải laptop thực") and re-picks Dell Vostro 15 3530 (16GB/512GB, 4.6⭐/117, a row); missing period · S2 asked usage, no search · S3 "Mình chọn **Ba lô Topo…**" (a backpack) · S4 "rẻ nhất trong danh sách" is false (Vostro 9.99tr) |
| S3 | PASS⚠ | PASS | PASS⚠ | FAIL C5 | S1 "Dell Vostro 15 3530… 1.890.000 VND" matches the row, but an implausible laptop price goes unflagged and "chưa ghi rõ chip" contradicts "i5-1334U (như tên sản phẩm ghi)" · S3 cheapest Vostro 3520 8.999tr is correct, but "ít người mua hơn" is false (143 vs 2 reviews) · S4 names the wrong cheapest (Latitude 10.89tr, not Vostro 9.99tr) |
| S4 | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | all: pick is below the 5–7tr band (3.49–4.5tr) and the pet-hair suitability is unbacked; S1 missing period; S3 inline shopping link in prose |
| S5 (+S5b) | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | S5: all four ask once ✅ (S4 with bullets) · S5b: S1 fragment "Để gợi ý đúng ý, mình cần tìm ngay.", unclosed italic · S2 1.2tr "vừa khít ngân sách" · S3 narration, two alternatives · S4 unbacked scent, two alternatives |
| S6 (+S6b) | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | S6: all ask once ✅ · S6b: S1 three alternatives · S2 post-hoc after the pick, orphan line · S3 cut alternative name "Nếu ưu tiên tiết kiệm, đánh giá 4.8⭐ từ 326…" · S4 unclosed "(4.7⭐", "34 loại" |
| S7 | PASS⚠ | PASS⚠ | PASS⚠ | FAIL C1 | S1/S3 pick is a seller ("Thế Giới Nệm"), dehumidifiers mixed in; S3 fragment "Nếu muốn tiết kiệm hơn — rẻ." · S2 nameless heading-cut paragraphs · S4 unrequested `save_price_watch` (target 1.5tr), no pick |
| S8 | PASS⚠ | PASS⚠ | PASS⚠ | PASS⚠ | S1 Rapido cheapest-5L is correct, two alternatives · S2 post-hoc, nameless fragments · S3 fragment "Nếu muốn tiết kiệm hơn.", missing period · S4 two alternatives, unclosed italic |

## 2. Totals

### Per vertical (pass = PASS + PASS⚠, x/8; b graded inside the parent)

| run | F food | P spa | E entertainment | T travel | S shopping | **overall /40** |
|---|---|---|---|---|---|---|
| S1 | 6/8 | 7/8 | 7/8 | 6/8 | 8/8 | **34/40** |
| S2 | 7/8 | 7/8 | 7/8 | 7/8 | 7/8 | **35/40** |
| S3 | 7/8 | 7/8 | 6/8 | 5/8 | 7/8 | **32/40** |
| S4 | 3/8 | 5/8 | 7/8 | 2/8 | 5/8 | **22/40** |

### Other views

| run | /40, old convention (b not folded in) | b-turns ok /8 | clarify rule (8 vague ids asked once, no search) |
|---|---|---|---|
| S1 | 35 | 7/8 (E5b ❌) | 8/8 |
| S2 | 37 | 6/8 (F7b ❌, P7b ❌) | 8/8 |
| S3 | 32 | 8/8 | 8/8 |
| S4 | 22 | 7/8 (E2b ❌) | 3/8 (searched F7 T5 P5 P7 E2) |

## 3. Defects that repeat within each run

**S1**
- Post-hoc "mình sẽ tìm ngay" narration, and backstop pick lines ("Mình chọn X — 4.x⭐…; giờ mở cửa…") followed by a different or contradictory body (F2, E5b; also P1, E6).
- Distances invented when the rows carry none: F2 "~0.8km", P2 "~0.8km".
- Answers that never deliver the fact asked for: F5 (no hours).
- Topic bleed from food and breakfast: T3 food clarify template; T8 "bạn muốn ăn sáng ở đâu hôm nay".
- Asked for a date instead of calling the flight tool (T7).

**S2**
- Post-hoc narration and preamble on about 12 turns.
- b-turns fail: F7b (budget spin for a 100–600k venue), P7b (asks the same question again).
- Asks instead of searching on actionable S2 (laptop usage).
- Wrong district plus invented budget fit (E6: Quận 1 Avatar labelled Gò Vấp, "khoảng 100k/người").
- T2 names no hotel.

**S3**
- Search queries sometimes lose the location or subject: F7b "quán ăn khuya", P5b/P7b "spa massage", T5b/E5b with no location. This leads to wrong-kind picks: T4 a restaurant for a family outing, T5b children's play areas for adults, S2 a backpack for a laptop.
- Invented distances: P8 "1.2km", E4 "200m".
- Topic bleed: T3 food clarify template.
- Asked for a date instead of calling the flight tool (T7).
- Leaked tool narration: P2 "mình sẽ search…", T1 "Tuyệt vời!".
- Fragments after guard cuts: S1, S3 (shopping), S7, S8, E6, E4.
- E7: a garbled, vulgar-looking invented film title.

**S4**
- Searched 5 of the 8 vague ids.
- Asks instead of searching on T4 and T6 (mangled question list).
- Unbacked hard constraints with no heads-up: F3 quiet, F8 private room, T8 luxury.
- False fits: F2 "dưới 80k", P8 "đúng giờ bạn cần" for a 22:00 close.
- Wrong facts: S3/S2 "rẻ nhất" names the wrong laptop.
- Invented travel prices: T1 hotel 800k–1tr.
- Unrequested side effect: S7 `save_price_watch`.
- Guard fragments with no answer: F6, S1, E2b.

## 4. Consistency note

Several S2 and S4 transcripts are word-for-word identical to transcripts graded in the earlier blind round
(`blind-grading.md`). Identical evidence received the identical verdict. This says nothing about which configuration
produced them.
