# Blind grading — round 4 (W1–W3 c40, Y1–Y4 golden)

The labels are blind. No configuration or commit was inferred, and `summary.json` was not used.

**Rubric:**
- C1–C9 from consultative-40.md.
- The **2026-09-28 "answer first, ask after" change** is applied to every run. Under it:
  - F7, P5, P7 and E2 must search.
  - Only S5, S6, T5 and E5 may ask first.
  - Asking before or instead of answering on an actionable id is ❌ (ACT).
  - At most one budget or party question may come at the END.
  - F7b, P5b, P7b and E2b are graded as refinements and folded into the parent. The parent passes only if it searched first.

**Standing conventions (unchanged from earlier rounds):**
- An unbacked hard constraint with a heads-up is ⚠; with no heads-up it is ❌.
- A number or budget fit that is not in the rows is ❌.
- One orphan fragment is ⚠; two or more fragments with no named pick is ❌.
- Post-hoc "sẽ tìm ngay" narration and two or more alternatives are ⚠.
- Films taken from model knowledge (E7) are ⚠.
- The same question printed twice (inline and at the end) is ⚠ (C9 duplicate).
- An honest fact follow-up that fails because its parent produced nothing is ⚠.

## Totals

**c40 (pass = ✅ + ⚠):**

| run | F | S | T | P | E | total /40 |
|---|---|---|---|---|---|---|
| W1 | 7 | 7 | 7 | 5 | 6 | **32/40** |
| W2 | 5 | 6 | 6 | 7 | 8 | **32/40** |
| W3 | 4 | 6 | 5 | 8 | 8 | **31/40** |

**Golden (24 cases):**

| run | PASS | PARTIAL | FAIL |
|---|---|---|---|
| Y1 | 11 | 11 | 2 |
| Y2 | 9 | 9 | 6 |
| Y3 | 11 | 13 | **0** |
| Y4 | 9 | 13 | 2 |

## Part A — c40 per-id

### Food

| id | W1 | W2 | W3 |
|---|---|---|---|
| F1 | ⚠ Nhà Hàng Ngon; narration; alternative's menu/"chuyên bữa tối" not in rows | ⚠ Hải Sản Hoàng Gia; narration; one budget question at the end | ⚠ Hoàng Gia; narration; budget question (chip + text, same question) |
| F2 | ⚠ Bếp Ông Cậu, "dưới 100k/bát" honest to the 1-100k row; two alternatives | ❌ C5: asserts "giá dưới 80k"; row says only 1-100.000 ₫ | ❌ C5: asserts "dưới 80k/tô"; row is 1-100k; GrabFood/ShopeeFood claim unbacked |
| F3 | ⚠ casa FONTANA; orphan "Cách bạn 3.8km."; quiet heads-up | ⚠ Trạm Hầm; dangling "Tuy nhiên quán đóng cửa lúc 23:00"; quiet heads-up | ❌ C5: "cách bạn khoảng 1.5km" has no distance in the rows (W1 row for the same venue = 3.8km); "riêng tư" unbacked |
| F4 | ⚠ Tám Riêu Phan Xích Long; parking/kids heads-up; "không gian rộng" unbacked | ❌ C1/C9: picks Ngọc Hương (15:00–05:00, shut at lunch), gives Tám Riêu's hours to it, repeats it as its own alternative; budget asked twice | ❌ ACT: no tool, asks budget instead of answering |
| F5 | ✅ Tám Riêu hours from the prior turn | ✅ consistent with the stated pick (Ngọc Hương 15:00–05:00) | ⚠ honest "chưa gợi ý quán nào" (parent asked), re-asks budget |
| F6 | ✅ "quán số 2" → Quán Bụi; honest no-crowd data plus a way to check | ❌ C3: re-searched, then invents "thường khá đông… 18:00–20:00" and "tối nay đang đóng cửa" against 07–23 hours | ❌ misreads "quán số 2", asks, no answer |
| F7 (+b) | ❌ ACT: clarify-first on an actionable id (b-turn: Nori "100–600k" presented as fitting under 100k) | ✅ searched, Bún Thái A Tùng, one budget question at the end; b: Phở Hà 1-100k ✓ | ⚠ Hùng Xíu + alternative called "cơm tấm" (Bún Thái); b: honest no-price, re-searched |
| F8 | ⚠ Hàng Dương; private-room + price heads-up; "chuyên phục vụ nhóm lớn" unbacked | ⚠ backstop Quý Dậu (100-300k row); heads-up; phone numbers not in the exposed rows (unverifiable) | ⚠ Hoàng Gia; heads-up; narration |

Food totals: W1 **7/8**, W2 **5/8**, W3 **4/8**.

### Shopping

| id | W1 | W2 | W3 |
|---|---|---|---|
| S1 | ⚠ card pick YJ-77 87k; thin reasons | ⚠ M10 29.9k; "10 lần" correct; orphan "Ngoài ra, nếu bạn ưu tiên pin siêu trâu, nhưng vẫn trong ngân sách…" | ⚠ prose names only alternatives (pick lives in the card) + fragment "Tuy nhiên, nên bạn nên…" |
| S2 | ❌ ACT: no tool, asks use-case | ⚠ Inspiron 5510 i5 12tr; unclosed parentheses; two alternatives | ⚠ same pick; nameless "RAM 8GB cũng đủ dùng, có 143 đánh giá" |
| S3 | ⚠ parent had no listing → re-searched; HP 4.49tr honest "chưa rõ cấu hình" | ✅ cheapest = Vostro i3 8.999tr ✓; honest trade-off vs the i5 pick | ❌ C5: "không có đánh giá" (row 4.2/143); "Vostro i5-1235U 8.999.000" (row i5 = 14.99tr) |
| S4 | ⚠ Ecovacs T5 Max 4.5tr; "lực hút mạnh, bình chứa lớn" unbacked | ⚠ Roborock Q7 TF 3.95tr (below band); "xử lý tốt lông thú" unbacked | ⚠ BlueStone 5.8tr; truncated "Roborock Q7TF52-00 (" |
| S5 (+b) | ✅ vague → one clarify; b: Tea for Two 1.2tr "vừa khít" ~1tr; "rẻ hơn 30k" ✓; narration | ⚠ clarify ✓; b: pick stated twice (backstop + model) | ⚠ clarify ✓; b: Nike's "hương hoa cỏ" credited to Glain; joined fragment |
| S6 (+b) | ✅ clarify ✓; b: Havit 320k; orphan " Đây là lựa chọn tốt nhất…" | ⚠ clarify ✓; b: Soundcore R50i; calls Anker V40i "chụp tai" (row: thể thao) | ⚠ clarify ✓; b: nameless "Nếu ưu tiên tiết kiệm, đánh giá 4.8⭐ từ 326 người" |
| S7 | ⚠ two nameless orphan lines, but names "máy lọc Quà tặng" at the end; "phù hợp kích thước phòng" unbacked | ❌ C2/C9: no named pick ("máy đầu tiên") + two orphans ("Đây là lựa chọn cân bằng…", "Nếu muốn tiết kiệm — rẻ hơn nhiều.") | ❌ C2/C9: no named pick + two orphans ("Đây là lựa chọn phù hợp nhất…", "Nếu muốn tiết kiệm hơn.") |
| S8 | ⚠ two nameless orphans, named pick Fujihome A5 at the end; one question | ❌ C5: "Sharp … và Lotte … đều có 5⭐" (Sharp row = 4.9); ends "Rapido hoặc Fujihome" (no single pick) | ⚠ Rapido; two alternatives; ends ambivalent |

Shopping totals: W1 **7/8**, W2 **6/8**, W3 **6/8**.

### Travel

Hotel rows from get_hotel_prices are not projected into the dump. Hotel names that are consistent across runs are treated as tool-backed.

| id | W1 | W2 | W3 |
|---|---|---|---|
| T1 | ⚠ plan M Hotel + food/attractions, all "chưa có giá"; truncated last line "(Cầu Rồng, Công viên Biển Đông."; GrabFood CTA on a trip | ❌ C5: "M Hotel … giá phù hợp ngân sách" with hotel price "chưa có giá"; "3 sao" unbacked | ❌ C5: invented prices (flight 1.6tr "~800k-1.2M/người", hotel 2.4tr "~1.2-1.5M/đêm", meals, "Còn dư ~100.000"); Ăn Thôi breakfast 08:00 vs 10:30 opening |
| T2 | ❌ C2: hotel tool called, no named pick, only a Booking link + question | ⚠ backstop M Hotel; party question inline + orphan "(1–2 người / …)" + repeated at the end | ❌ ACT: no tool, asks party size |
| T3 | ⚠ honest (no hotels from T2); generic "nhiều khách sạn dưới 1tr có ăn sáng" | ⚠ honest no-info; doesn't resolve "cái thứ hai" | ⚠ honest no results; re-asks party (parent asked) |
| T4 | ✅ Thảo Cầm Viên; one alternative with trade-off | ⚠ same pick; narration | ⚠ Công viên Gia Định; narration |
| T5 (+b) | ✅ vague → one clarify; b: Tao Đàn, "nhiều khu vui chơi" unbacked; narration | ⚠ clarify ✓; b: PH GAME; states 9–22 then "Giờ mở cửa mình chưa xác nhận" (contradiction) | ⚠ clarify ✓; b: PH GAME; "gần hơn (4.9km)" vs 4.8km |
| T6 | ⚠ prose itinerary with named rows, no pick sentence; narration | ⚠ backstop restaurant pick prepended; unrequested same-day flight plan; `people:[1]` | ⚠ prose covers only the morning; plan block placed after CTA/followups |
| T7 | ⚠ flight tool empty → honest + links; date question at the end | ✅ honest + links; one question | ✅ assumption stated, honest, links, one question |
| T8 | ⚠ Ocean Bay; no upscale heads-up but no "sang trọng" claim on the pick; invented trade-off "xa biển hơn"; typos | ❌ ACT (new rule): asks budget BEFORE the pick, and again at the end | ❌ ACT (new rule): same (question before the pick + repeated at the end) |

Travel totals: W1 **7/8**, W2 **6/8**, W3 **5/8**.

### Spa

| id | W1 | W2 | W3 |
|---|---|---|---|
| P1 | ⚠ backstop Jang Mi; post-hoc narration; no reasons ("thẻ bên dưới") | ✅ Jang Mi; closed-now noted; one alternative; one question at the end | ⚠ Jang Mi "spa đá nóng, An Hải" not in rows; two alternatives |
| P2 | ⚠ Hyan Spa; honest no-price; two alternatives; narration | ⚠ backstop Hạ Spa with no reasons; honesty line doubled; one question | ⚠ promises "gọi lại với cách tìm khác" (never happened); party asked twice |
| P3 | ✅ honest about booking for Hyan; ways to check | ⚠ re-searched; phone/website not in exposed rows | ⚠ same as W2 |
| P4 | ⚠ Ôliu Spa; quiet heads-up; narration | ⚠ Kim Spa; "Da'an yên tĩnh hơn" unbacked but quiet heads-up present; one question | ⚠ same + budget asked twice |
| P5 (+b) | ❌ ACT: clarify-first on an actionable id | ⚠ Serene; "không gian yên tĩnh" unbacked; one question; b: honest re-search, Cổ Phong | ⚠ Serene; two alternatives; b: Dubai Luxury, honest |
| P6 | ⚠ Cổ Phong; calls Hạ Spa "gần hơn (2.3km)" vs 1.3km; "đá nóng" unbacked | ❌ C3: Hạ Spa "có dịch vụ massage couple chuyên biệt" (the user's constraint) with no evidence and no heads-up | ⚠ Hạ Spa; post-hoc "Trong lúc đó, mình sẽ tìm"; one question |
| P7 (+b) | ❌ ACT: clarify-first; b: no tool, asks again | ⚠ generic spa search; Serene "chuyên gội đầu"; b: no re-search, "cả hai đều có gội đầu" unbacked | ⚠ generic search; b: re-searched gội đầu, An Miên |
| P8 | ❌ C1/C9: opens with orphan "Nó cách bạn khoảng 1.6km"; picks Cổ Phong "mở đến 22h — phù hợp nhu cầu khuya" for an after-22h request (own row contradicts) | ⚠ SAIGON STAR (open all day) ✓; narration | ⚠ same; narration |

Spa totals: W1 **5/8**, W2 **7/8**, W3 **8/8**.

### Entertainment

| id | W1 | W2 | W3 |
|---|---|---|---|
| E1 | ⚠ Bùi Viện; one alternative; narration | ⚠ Empire Club called "bar karaoke" (name only); one question | ⚠ same + unverified street |
| E2 (+b) | ❌ ACT: clarify-first on an actionable id (the id the owner reversed) | ⚠ CGV Liberty; two alternatives; one question; b: honest, pick switches to Galaxy | ⚠ CGV Liberty; two alternatives; b: honest |
| E3 | ⚠ Dot Bar; live-music heads-up; narration | ⚠ Dollhouse; heads-up; "chill" unbacked; one question | ⚠ Dollhouse; budget asked twice |
| E4 | ⚠ re-searched; sentence starts "Nên bạn gọi…" (clipped); phone unverifiable | ⚠ honest; phone/address unverifiable; "5–10 phút đi bộ" | ⚠ honest; phone unverifiable |
| E5 (+b) | ✅ vague → one clarify; b: Tao Đàn; two alternatives | ⚠ clarify ✓; b: PH GAME "gần nhất" (Vietopia 4km is nearer) | ⚠ clarify ✓; b: "gần hơn (~4.9km)" vs 4.8; trailing orphan |
| E6 | ❌ C5: Avatar "phù hợp … với mức giá khoảng 100k/người" with no price in rows; "Phạm Viết Chánh (Gò Vấp)" wrong; Kingdom "rẻ hơn" unbacked | ⚠ backstop KAMELA (1-100k row ✓); post-hoc narration | ⚠ KAMELA; orphan " Phòng karaoke video, không gian thoải mái cho nhóm đông." |
| E7 | ⚠ films from model knowledge | ⚠ films from model knowledge; CJK leak "沉浸" (C8) | ⚠ films from model knowledge |
| E8 | ⚠ Lilliput; repeats the pick; two alternatives | ⚠ tiNiWorld Crescent; orphan contrast "Tuy nhiên, tiNiWorld sẽ an toàn hơn…" | ⚠ tiNiWorld Crescent; "vừa gần" (5.7km vs alternative 4km) |

Entertainment totals: W1 **6/8**, W2 **8/8**, W3 **8/8**.

### c40 fail list

- **W1 (8):**
  - ACT: F7, P5, P7, E2, S2.
  - Other: T2 C2, P8 C1/C9, E6 C5.
- **W2 (8):**
  - ACT: T8.
  - Other: F2 C5, F4 C1/C9, F6 C3, S7 C2/C9, S8 C5, T1 C5, P6 C3.
- **W3 (9):**
  - ACT: F4, T2, T8.
  - Other: F2 C5, F3 C5, F6, S3 C5, S7 C2/C9, T1 C5.

## Part B — golden per-case

Verdicts count only each case's own criteria. Out-of-criteria defects are in brackets.

| case | Y1 | Y2 | Y3 | Y4 |
|---|---|---|---|---|
| B1 | PASS: no 98k budget; normal iPhone prices [picks a 15 Pro, not Pro Max; fragments] | PASS [picks a 15 Pro] | PASS | PASS [opens with fragments] |
| B2 | **FAIL** | PASS: family cards, no phantom budget | PASS [99 By Night "sân khấu ca nhạc" unbacked] | **FAIL** |
| B3 | PASS | PASS | PASS [t2 pick name missing in prose; card has it] | PARTIAL: t2 recommends a 150k camera part ("Thay camera trước Note 10 Plus"), not a mid-range phone; asks what the user wants |
| B4 | PASS | PASS | PASS [t2 fragments] | PASS [t1 fragments; t3 asks trip budget, no 2tr carried] |
| D1 | PASS: all 4 cards in Q3 wards (Xuân Hòa/Nhiêu Lộc) [query became "quán ăn khuya", phở dropped — picks are not phở] | **FAIL** | PASS: 8 phở cards, all Q3 | PASS: same as Y1 [phở dropped] |
| D2 | PASS: all cards Bình Thạnh wards [pick name deleted — orphan "**4.8⭐ (159)**" belongs to FOCUS SPACE, which is not in its cards] | PASS [backstop + "tìm lại" narration] | PASS [fragment "Ngoài ra, hoặc"] | PASS [pick FOCUS SPACE not in its own cards; address Gia Định ✓] |
| G1a | PASS: plan Melissa + BOHO, assumptions, no question | PASS [backstop La Sirena not in the plan] | PASS: Fusion Suites + La Sirena | PASS [backstop not in the plan; restated assumptions] |
| G1b | PASS: Q7 cinema cards [picks café-cinema Chiin; names VivoCity not in cards] | **FAIL** | PARTIAL: picks Crescent Mall (a mall) as the cinema | PASS [Chiin] |
| G3a | PARTIAL: asserts "mức giá dưới 50k" from a 1-100.000 ₫ range (criterion 4) | PASS: honest no-price | PARTIAL: pick name cut — reply starts "Quán có không gian yên tĩnh…" (text ≠ cards) | PARTIAL: "giá dưới 50k" from a 1-100k range |
| G3b | PARTIAL: no explicit acknowledgement of the switch; honest no-price | PARTIAL: "Giá vừa phải, phù hợp 100–150k" for 79 (row 1-400k); no acknowledgement | PARTIAL: Hoàng Gia (price null) "giá hợp lý với tầm 100-150k" | PARTIAL: first pick Ben.la is closed tonight; no acknowledgement |
| G4a | PASS [Golden Sun "4 sao" unbacked] | PASS | PASS [memory bleed "theo thói quen của bạn", "nhu cầu yên tĩnh"; dates 28–29/9 for "cuối tuần này"] | PASS |
| G5a | PARTIAL: no MDM; thresholds 80%/70%, "8-12 triệu", "<7 triệu" | PARTIAL: no MDM | PARTIAL: no MDM; "30-40%", "80%/70%" | PARTIAL: no MDM; "8-12 triệu", "<6 triệu" |
| G5b | PARTIAL: no frame/engine-number check | PARTIAL: invented "5-15 năm, 20k-100k km" | PARTIAL: no frame/engine numbers, no sang tên | PARTIAL: no frame/engine numbers |
| G5c | PARTIAL: no VIN; invented "50k km", "~500k-1 triệu" | PARTIAL: no VIN; "5-10 năm tuổi" | PARTIAL: ">30%" threshold; no thế chấp | PARTIAL: no flood history; VIN only under condition, not ownership |
| G5d | PARTIAL: fake payment screenshots missing | PARTIAL: same | PARTIAL: same | PARTIAL: same |
| L1 | PASS: full plan, real places; tips tool-tied (Cá Khói) or general [mid-text question] | PASS: no tips (acceptable) [prose hotel Sala ≠ plan hotel Hoàng Hưng] | PARTIAL: hotel is a placeholder "Khách sạn 3-4 sao Quy Nhơn" (no hotel tool) | PARTIAL: placeholder hotel appended as a 4th "day" at 20:00 |
| M1 | PARTIAL: t7 TAPPY_PLAN malformed JSON | PARTIAL: t7 plan malformed + duplicated sentence | PARTIAL: t9 phantom "budget mua sắm dưới 2 triệu" on the MacBook | PARTIAL: t7 plan malformed |
| M2 | PASS: food Q3 ≤100k, spas only, cinemas only [t2 Q1 spas by GPS; restated pick] | **FAIL** | PASS | PASS |
| M3 | **FAIL** | **FAIL** | PASS: lẩu cards; travel time to The Lủi; indoor; Đà Lạt weather | PARTIAL: t1 search "quán ăn khuya" → no lẩu cards (honest); t2–t4 correct |
| M4 | PASS [t2 fragment; t3 orphan "Cả ba đều…"] | **FAIL** | PASS | PASS [phone number unverifiable] |
| T1 | PARTIAL: hotel generic at t1, named only in t2 ("M Hotel … hoặc tương tự"); split ok, no delivery apps | PARTIAL: t1 hotel generic + "tìm khách sạn không?"; t2 split line cut ("Vé máy bay khứ hồi (2 người)" with no amount) | PARTIAL: hotel generic until t3 [t3 flights from Hà Nội] | PARTIAL: t1 plan malformed (no first plan renders); hotel generic until t3 |
| T2 | PARTIAL: t2 IMAX search + cards + way to check, but "cannot confirm" is said in both turns | **FAIL** | PARTIAL: uncertainty repeated both turns; CGV Liberty offered "nếu bạn muốn xem phim IMAX gần đây" | **FAIL** |
| T3 | PARTIAL: t2 cards include 100-200k Gà Lên Mâm; no explicit acknowledgement [suggests GrabFood] | PARTIAL: generic t2 search ignores 50–60k; no acknowledgement; Q5 card | PARTIAL: acknowledged but restaurant-type cards remain | PARTIAL: filtered to 4 cards, but no acknowledgement; orphan "Quán chuyên mâm cơm nhà." |
| T4 | PARTIAL: no Activation Lock/Apple ID, no MDM, no stolen, no serial | PARTIAL: no Activation Lock, MDM, serial | PARTIAL: no MDM, no serial verification | PARTIAL: no MDM; "rẻ hơn 30%" threshold; serial only as a software check |

### Exact reasons for every golden FAIL

- **Y1 B2:** no tool call and no cards. The reply is "…mình cần biết: Trong khi đó, mình sẽ tìm…" followed by a budget question. Criterion 2 (ordinary family restaurant cards) fails.
- **Y1 M3:**
  - t1 searched "quán ăn khuya" and returned no lẩu cards (criterion 1).
  - t2 "bao lâu thì tới đó" gives no travel time and asks which quán/loại lẩu instead (criterion 2).
- **Y2 B2:** the tool never ran, no cards were shown, and the reply is a clarify ("Để tìm quán phù hợp, mình cần biết: …" + a budget question). Criterion 2 fails.
- **Y2 D1:** clarify "Tầm giá? Mấy người?" with no search and no cards, so criteria 1 and 4 cannot be met.
- **Y2 G1b:** clarify "Tầm giá? Mấy người?" with no cinema cards (criterion 1).
- **Y2 M2:** t2 (spa) and t3 (cinema) are both "Tầm giá? Mấy người?" clarifies with no spa or cinema cards (criteria 2 and 3).
- **Y2 M3:**
  - t1: clarify with no lẩu cards.
  - t2: runs a NEW restaurant search ("quán ăn tối ngon") instead of answering travel time.
  - t3: clarify with no indoor suggestions.
  - t4: Đà Lạt answer mixed with Q1 café cards.
- **Y2 M4:** t2 hair dryer answered with "Bạn muốn mua món gì?", with no product search and no product cards (criterion 2).
- **Y2 T2:**
  - t1: clarify.
  - t2: generic "rạp chiếu phim" search, not IMAX (criterion 1).
  - Asserts "không có rạp IMAX" and invents "Rạp IMAX ở TP HCM đã đóng cửa từ vài năm trước" (criterion 3).
- **Y4 B2:** no tool call and no cards; reply is "mình cần biết: Thông tin này sẽ giúp…" + a budget question (criterion 2).
- **Y4 T2:**
  - t2 asserts as fact "không có rạp IMAX chuyên biệt ở TP HCM … đều … không phải IMAX" instead of saying it cannot confirm (criterion 3).
  - Names "Aeon Beta Central Premium", which is not among its cards (criterion 2).
  - t1 also named CGV Liberty Citypoint without a card.

### Cross-run note (observed only, no inference)

- **Y2** reproduces the round-3 X1/X3 behaviour on D1, G1b, M2, M3, M4 and T2.
- **Y3** reproduces X2 on G1b, G3a, M2, M3, M4, T1, T2 and T3.
- Where these turns match earlier transcripts, they were given the same verdicts as in round 3.
