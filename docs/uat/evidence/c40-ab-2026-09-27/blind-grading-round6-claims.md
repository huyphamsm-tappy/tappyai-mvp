# Blind grading — round 6 (V1/V2 targeted c40, H1/H2 golden T2)

**Rubric:** same as rounds 4–5, including the 2026-09-28 "answer first, ask after" rule. The labels are blind.

**Checked on every turn:**
- a price ceiling read off a band;
- "trong ngân sách" with no price;
- an absolute "không có";
- a service that is not in the data;
- whether the pick is named;
- whether a question comes before the answer.

## Part A — c40

| id | V1 | V2 |
|---|---|---|
| F2 | ⚠ PASS: Bếp Ông Cậu named; honest "chưa rõ có nằm trong ngân sách 80k"; no ceiling claimed; party question at the end ["giá thường hợp lý" soft; typo "gia,"] | ⚠ PASS: same pick, honest no-price; alternative Nam Giao; party question at the end [Nam Giao "mở cả ngày" vs 06:00–23:00] |
| F8 | ⚠ PASS: Nhà Hàng Ngon named (backstop line); explicit no-evidence heads-up for private room; no budget-fit claim (row 200-600k); one alternative | **❌ FAIL C3**: "Hải Sản Hoàng Gia … **cũng có phòng riêng** nhưng chưa xác nhận được giá cụ thể". The private room (the user's hard constraint) is asserted as fact with no evidence (GAPS = private_room). "cũng" also implies the pick has one. The only hedge covers price, so there is no no-evidence heads-up |
| T1 | ⚠ PASS: full plan (M Hotel + real places), every price "chưa có giá", no "trong ngân sách" claim [truncated line "(Ngũ Hành Sơn, Cầu Rồng."; Ăn Thôi slotted 10:00 vs 10:30 opening; tool-basis tip "bánh mì nướng và hải sản" unverifiable] | ⚠ PASS: full plan (Hanami Hotel + real places), all "chưa có giá", no budget-fit claim [same truncated line; unclosed raw `[CTA_BUTTONS]{…` JSON leaks at the end of the prose (plan intact); "cầu đẹp nhất thế giới" fluff] |
| P2 | **❌ FAIL C5**: "Hyan Spa … cách bạn khoảng **0.8km**" and "Hạ Spa … cách khoảng **1.2km**". The raw rows have no distance field (name/rating/count/hours/address only), so both distances are invented. No question before the answer; pick named | ⚠ PASS: Hạ Spa named; honest no-price; no question before the answer [phone 0945 705 000 not in the rows (unverifiable); an offer question mid-text + party question at the end] |
| P6 | ⚠ PASS: Hạ Spa named; couple hedged ("mình chưa xác nhận được có massage couple") [garbled merged sentence also asserts "dịch vụ đá nóng và trị liệu", which is not in the data; one budget question at the end] | ⚠ PASS: Hạ Spa named; couple hedged [asserts "spa mặt, đá nóng", not in the data; one question at the end] |

**Result:** V1 4/5 (fail: P2). V2 4/5 (fail: F8).

### FAIL reasons

- **V1 P2 (C5):** invented distances. "cách bạn khoảng 0.8km" (Hyan) and "cách khoảng 1.2km" (Hạ Spa) have no distance value in the tool rows. This is the same ruling as round-4 W3 F3.
- **V2 F8 (C3):** a service not in the data. "Hải Sản Hoàng Gia … cũng có phòng riêng" asserts the private room with no evidence (the private_room gap is unresolved). There is no no-evidence heads-up; only the price is hedged.

**Passes relevant to the checklist:**
- **F2:** neither run reads a ceiling off the band, and neither asks a question before answering.
- **T1:** neither run says "trong ngân sách".
- **P6:** neither run asserts the couple service; both hedge it.
- **Pick named:** every turn names its pick.

## Part B — golden T2

| run | verdict | reason |
|---|---|---|
| H1 | PARTIAL | t2 searches IMAX ✓; the t2 cinemas (Galaxy Nguyễn Du, CGV Sư Vạn Hạnh, CGV Vivo City) are carded ✓; no uncertain cinema presented as IMAX ✓; a way to check is given (CGV.vn / GalaxyCine.vn) ✓. But "chưa xác nhận … IMAX" is stated in BOTH turns (criterion 3 says ONCE), and t1 names CGV Liberty Citypoint, which is not among t1's cards (criterion 2) |
| H2 | PARTIAL | t2 searches IMAX ✓; a way to check is given ✓; no absolute "không có" ✓. But the uncertainty is stated in both turns. t2's visible text is guard-garbled twice ("kết quả không xác nhận rõ rạp nào mình chưa xác nhận được có phòng IMAX", "Để chắc chắn rạp nào mình chưa xác nhận được có IMAX") with an unclosed `**`. CGV Vincom Đồng Khởi is named in t2 but is not in t2's cards, and t1 names CGV Liberty without a card (criterion 2). t1 also ends with a budget question |

Golden: H1 PARTIAL, H2 PARTIAL. No FAILs. Neither run asserts an absolute "không có rạp IMAX" (the round-4/5 FAIL pattern).
