# UAT4 — chấm golden run `uat4-golden` (2026-09-27)

- **Run:** `docs/uat/evidence/golden/uat4-golden/` gồm 24 case và 51 lượt gọi. Chạy trên `http://localhost:3007` lúc 2026-09-27T11:23Z.
- **Tiêu chí:** lấy từ `docs/uat/ai-golden-set.jsonl`.
- **Cách chấm:** người đọc từng lượt, xem text hiển thị, block `[TAPPY_*]`, tools và cards. Mỗi case chỉ chấm theo `criteria` của chính nó.
- **Lỗi ngoài tiêu chí:** vẫn ghi vào cột lý do và mục Defects, nhưng không làm đổi verdict. Ngoại lệ là khi lỗi làm hỏng đúng thứ mà tiêu chí kiểm tra, ví dụ tên quán được chọn bị guard xoá.
- **Baseline:** là lần chạy gần nhất trước đó của từng case:
  - T1, G1a, G4a, L1: `uat3-tips-after` (2026-09-27 10:19Z).
  - M1: `uat3-M1`.
  - M2–M4: `uat3-M234`.
  - 15 case còn lại: `post-f094d` (2026-09-25).
- **Verdict "prev":** trong `docs/uat` không có file nào ghi verdict từng case do người chấm. `PRE-REDESIGN-AUDIT.md` chỉ có tổng "53/58" của scorer tự động. `PRELAUNCH-REPORT.md` chỉ có bảng tiêu chí cho B1/B2/B3/D1/D2. Vì vậy cột prev là **tôi chấm lại run cũ theo cùng thước đo**.
- **Scorer tự động** (`node scripts/audit/goldenCompare.mjs post-f094d uat4-golden`, trên 19 case chung): **52/58 → 52/58**.
  - Kém đi: T2 "IMAX honesty line", G1b "first card is a cinema", G3a "prose names the pick".
  - Tốt lên: T4 "no invented %", G5b "list shape", G5d "no invented %".

## Số liệu run

| chỉ số | giá trị |
|---|---|
| Tổng lượt (turns) | **51** |
| HTTP khác 200 | **0** |
| `duplicate` (harness) bật | 0 |
| elapsedMs trung bình | **19.874 ms** (median 16.315; max 54.577 ở T1 t1) |
| usage.promptTokens trung bình (51/51 có số) | **4.168** (tổng 212.573). ⚠ 11 lượt không gọi tool ghi `promptTokens = 3`, nên số này **không tin được**. Bỏ 11 lượt đó thì trung bình 5.314 |
| usage.completionTokens trung bình | **1.117** (tổng 56.955) |
| So sánh latency | 19 case chung với post-f094d: 19.339 → 21.944 ms. M1–M4 so với uat3: 18.054 → 16.022 ms. 4 case tips so với tips-after: 43.330 → 47.186 ms, completion 3.494 → 3.553 |

## Bảng chấm

| case | turns | prev | UAT4 | lý do (UAT4) | Δ |
|---|---|---|---|---|---|
| T1 | 3 | PARTIAL | PARTIAL | t2 sửa đúng "2 ngày 1 đêm" và có budget_total 20 triệu. Nhưng `cost_breakdown` toàn "chưa có giá" nên không có budget split. Plan t3 đổi điểm đi thành "Chuyến bay **Hà Nội** → Đà Nẵng". Khách sạn không có card. Mô tả plan có giá tự bịa | = (t3 kém đi) |
| T2 | 2 | PARTIAL | PARTIAL | t2 tìm lại IMAX, không hỏi lại, có cards. Có nói rằng chưa xác nhận được phòng IMAX. Nhưng vẫn gợi CGV Liberty là "lựa chọn tiện nhất nếu bạn muốn xem phim IMAX" (không có "sàn IMAX"). Run trước còn khẳng định sai "TP HCM không có rạp IMAX" | = (bớt sai sự thật) |
| T3 | 2 | PARTIAL | PARTIAL | t2 nói thật là chưa xác nhận giá 50-60k. Nhưng 8 cards là "Nhà hàng" chưa lọc (Hàng Dương Quán, Sài Gòn Xưa và Nay). Run trước chỉ còn 3 cards | = |
| T4 | 2 | PARTIAL | PARTIAL | t2 nêu rủi ro trước (nguồn gốc/trộm, iCloud/Find My, cọc) rồi mới đến tình trạng máy. Không có số liệu tự bịa, có "Cảnh báo lừa đảo". **Thiếu MDM và kiểm tra serial với Apple.** Run trước để trống cả mục tình trạng máy | ↑ (trong cùng mức) |
| G1a | 1 | PASS | PASS | Plan đủ chỗ ở + ăn, nêu rõ giả định, 0 câu hỏi, có card khách sạn, không có app giao đồ ăn. Lỗi ngoài tiêu chí: mất card nhà hàng; xếp Ốc Tự Nhiên lúc 08:00 dù quán mở 10:00; câu thời tiết lặp 2 lần | = |
| G1b | 1 | PARTIAL | PARTIAL | Không hỏi lại quận. Nhưng quán được chọn là **Crescent Mall** (trung tâm mua sắm) và được gọi là "rạp phim". Cards có LOTTE Mart (đại siêu thị) | = (scorer ↓) |
| G3a | 1 | PARTIAL | **FAIL** | Guard xoá câu nêu tên quán được chọn (Little Cam) và câu nói thật rằng "chưa tìm được quán nào … dưới 50k". Text hiển thị mở đầu bằng "Quán có không gian yên tĩnh…" mà không có tên quán. Cards là quán cà phê ở dải 1-100k, không được cảnh báo | **↓ regression** |
| G3b | 2 | FAIL | PARTIAL | t2 đổi sang quán ăn gia đình, không còn thẻ nhậu/bia. Nhưng quán được chọn là Hải Sản Hoàng Gia, không có giá, lại được nói là hợp "100-150k/người" chỉ "dựa trên danh giá cao". t1 tự bịa sở thích "bạn thích quán yên tĩnh và giá rẻ". Run trước: tên quán t2 bị xoá | ↑ |
| G4a | 1 | PARTIAL | PARTIAL | Có plan, nêu giả định, 0 câu hỏi. Nhưng dính **memory của case khác**: "theo thói quen của bạn", tiêu đề "Yên tĩnh, rẻ tiền, gia đình", query "quán ăn gia đình Đà Lạt". Xếp Quán cơm Linh lúc 08:00 dù quán mở 10:30. Run trước bị dính "hải sản" từ memory | = |
| G5a | 1 | FAIL | PARTIAL | Nêu rủi ro trước (IMEI, iCloud, cọc) và có "Cảnh báo lừa đảo". Có số liệu không nguồn: "rẻ hơn 30-40%", "pin trên 80% là tốt; dưới 70%", "2-3 năm". Thiếu MDM/blacklist | ↑ |
| G5b | 1 | FAIL | PARTIAL | Nêu giấy tờ và chủ xe trước, có con trỏ lừa đảo, không có số. Thiếu số khung/số máy, xe trộm, thủ tục sang tên | ↑ |
| G5c | 1 | FAIL | PARTIAL | Nêu pháp lý trước (đăng ký, nợ/thế chấp, ngập, số khung, cọc), có con trỏ lừa đảo. Còn số không nguồn "chênh >30%" | ↑ |
| G5d | 1 | FAIL | PARTIAL | Nêu thanh toán/lừa đảo trước, gặp trực tiếp, xem hồ sơ người bán, có "Cảnh báo lừa đảo", không có thống kê. **Thiếu cảnh báo ảnh chụp chuyển khoản giả**. Đoạn backstop gắn thêm cuối bài lặp lại lời khuyên đã có | ↑ |
| B1 | 1 | PASS | PASS | Không suy ra budget 98–99k, pin là tình trạng máy, giá thật (14–26 triệu). Ngoài tiêu chí: text chọn "15 Pro Max táo xanh" nhưng card được đánh dấu recommended lại là "iPhone 15 Pro 128GB" | = |
| B2 | 1 | PASS | PASS | Không có budget ma, 8 cards bình thường. Nhu cầu "không gian rộng" được dùng. Quán được chọn (99 By Night) chỉ yếu ở tiêu chí thân thiện trẻ em | = |
| B3 | 2 | PASS | PARTIAL | Budget 100k không bị kéo sang điện thoại. Nhưng tên máy được chọn bị xoá khỏi text ("Chiếc này có rating 4.9⭐…"). Máy recommended là Galaxy A07 4,69 triệu (máy phổ thông), cards có A20 1,5 triệu. Tức là không đúng "mid-range" | **↓ regression** |
| D1 | 1 | PASS | PASS | 8/8 cards ở Xuân Hòa/Nhiêu Lộc/Bàn Cờ, không có câu nói sai quận | = |
| D2 | 1 | PASS | PASS | 8/8 cards ở Bình Thạnh/Gia Định/Bình Lợi Trung/Thạnh Mỹ Tây. Câu văn bị cắt: "Ngoài ra, hoặc **FOCUS SPACE**…" | = |
| B4 | 3 | PASS | PASS | t1-t2 dưới 2 triệu. t3 không nhắc "ngân sách 2 triệu", là plan mới cho 2 người. Ngoài tiêu chí: quán được chọn ở t1 là JOLA (tai nghe quàng cổ, không chống ồn). t2 có câu cụt ("…nên."). Tips general nêu tên địa điểm | = |
| M1 | 12 | FAIL | PARTIAL | t9-12 không gọi tool du lịch, không có PLAN/Quy Nhơn. t12 trả checklist, cả 12 lượt đều 200, không lặp text. **Nhưng t9 kéo budget ma từ case khác**: "bạn nói budget mua sắm dưới 2 triệu" (từ B4). t10 bị xoá tên sản phẩm, còn câu cụt. t2 nói "Nếu là 2 người" dù user đi 1 mình. t8 gọi "THUÊ LOA KÉO" là karaoke. Run trước: t2 bị lặp, checklist t12 trống, JSON plan t7 lỗi | ↑ |
| M2 | 3 | PARTIAL | PARTIAL | t2 chỉ có spa, t3 chỉ có rạp, cả 3 lượt 200. **t1: 4/5 cards ở dải "100-200 N ₫"**, quán được chọn (Tám Riêu) nằm ngoài dưới 100k. Run trước còn khẳng định sai "cả ba quán đều dưới 100k" | = |
| M3 | 4 | PASS | PASS | t1 là lẩu Q1. t2 trả lời thời gian đi, không tìm lại. t3 không gọi search_products. t4 trả lời thời tiết Đà Lạt bằng get_weather. Ngoài tiêu chí: t3 không có cards, có ảnh markdown trần "![Ảnh địa điểm]" và câu cụt "Hoặc nếu muốn vui hơn,". Quán được chọn ở t1 là "Quán bia" | = (t4 tốt hơn) |
| M4 | 3 | PARTIAL | PASS | t1 spa Phú Nhuận, nói rõ chưa có giá. t2 máy sấy Philips 219k–389k, không spa, không bị kẹp ở 300k. t3 gội đầu mở khuya. Run trước: danh sách t2 trống, tên quán t3 bị xoá | ↑ |
| L1 | 1 | PARTIAL | PARTIAL | Plan đủ 3 ngày. Hai tips đều `general`, không có số, không có tên quán, **đạt tiêu chí tips**. Nhưng không chạy tool vé máy bay hay khách sạn. Khách sạn "3-4 sao" chung chung, Tháp Nhạn không lấy từ tool. Mô tả có giá bịa ("1.2-1.5 triệu/người khứ hồi", "800k-1.2 triệu/đêm", "30-50k"). Cơm Nhà 1989 xếp lúc 07:00 dù quán mở 10:00. Mục "Chi tiết ngân sách" là gạch đầu dòng không có số | = (tips ↑, plan ↓) |

**Tổng UAT4:** PASS 8 · PARTIAL 15 · FAIL 1. Run trước: PASS 8 · PARTIAL 10 · FAIL 6.
**Regression (2):** G3a (PARTIAL → FAIL) và B3 (PASS → PARTIAL). Cả hai cùng một nguyên nhân: guard xoá câu nêu tên quán/máy được chọn.
**Improved (7):** G3b, G5a, G5b, G5c, G5d, M1, M4. Hết lỗi "tiêu đề trống" thời F-094.

## Kiểm tra `local_tips` (mọi `[TAPPY_PLAN]`)

| case/turn | tips | kết quả |
|---|---|---|
| L1 t1 | 2 × general | ✅ không có số, không có tên quán |
| G1a t1 | 1 general + 1 tool (`Nhà hàng hải sản La Sirena` = stop) | ✅ anchor đúng. Nội dung tool tip "nổi tiếng với tôm hùm nướng và cua hoàng đế" không kiểm chứng được. Tip nói "ngon vào buổi tối" trong khi stop là bữa trưa |
| T1 t1 | 1 general + 1 tool (Ku Tom = stop) | ❌ tip general nêu tên venue: "**Cầu Vàng** nằm trên cao, nên đi sáng sớm…" |
| T1 t2 | không có | ✅ |
| T1 t3 | 1 general + 1 tool (Mr Mộc = stop) | ⚠ tip general nêu khu vực "Sơn Trà" (trùng stop "Bãi biển Sơn Trà") |
| G4a t1 | 1 tool + 1 general | ❌ `place` "QUÁN ĂN TÀI (LẨU + NƯỚNG ĐÀ LẠT)" ≠ stop "QUÁN ĂN TÀI (Lẩu + Nướng Đà Lạt)" (chỉ khác hoa/thường, so khớp chính xác vẫn fail). ❌ Tip general nêu "**Quảng trường Lâm Viên**" và "phù hợp với sở thích của bạn" (memory) |
| B4 t3 | 2 general + 1 tool (`Quán cơm tấm Ngày Xưa` = stop) | ❌ Tip general nêu "**Đền Thánh Đức Mẹ Bãi Dâu**…". ❌ Tip general nêu "**Bãi Sau** … ít đông hơn **Bãi Trước**" |
| M1 t6 | không có | ✅ |
| M1 t8 | 1 tool (`Nhà Hàng Cá Khói` = stop) | ✅ anchor đúng. Nội dung "mực nướng và tôm hùm" không kiểm chứng được |

Không tip general nào chứa chữ số, giá hay giờ. **Lỗ hổng:** tip `general` vẫn nêu tên địa điểm (3 plan) và guard không bắt được. So khớp `place` không phân biệt hoa/thường có thể được chấp nhận ở runtime, nhưng không đạt quy tắc "bằng đúng tên stop".

## Defects cụ thể

1. **Guard xoá cả câu, để lại câu mồ côi hoặc làm mất tên quán/máy được chọn**, gặp ở 9 lượt:
   - G3a: *"Quán có không gian yên tĩnh, phục vụ cà phê chất lượng."* Tên quán mất, và câu cảnh báo "dưới 50k" cũng mất.
   - B3 t2: *"Chiếc này có rating 4.9⭐ từ 122 đánh giá"*
   - T4 t1: *"Lý do là nó có đánh giá 4.8⭐ từ 242 lượt đánh giá"*
   - M1 t10: *"Tuy nhiên, Docker, VM...), RAM 8GB sẽ hơi chật"*
   - B4 t2: *"…loại chống ồn (chủ động ANC hay bị động), nên."*
   - D2: *"Ngoài ra, hoặc **FOCUS SPACE**…"*
   - T1 t1: *" Nếu khác thì bạn nói mình điều chỉnh nhé."* Câu giả định budget đứng trước nó đã bị xoá.
2. **Memory rò giữa các case** (có vẻ cả run dùng chung một tài khoản):
   - M1 t9: *"bạn nói budget mua sắm dưới 2 triệu"* (từ B4).
   - M1 t5: *"bạn hay thích làm việc tại quán cà phê"* (từ D2).
   - G4a: *"(theo thói quen của bạn)"*, tiêu đề "Yên tĩnh, rẻ tiền, gia đình".
   - G3b t1: *"Vì bạn thích quán yên tĩnh và giá rẻ"*.
   - Hệ quả: golden bị nhiễu, và budget ma quay lại.
3. **T1 t3 đổi điểm đi:** *"Chuyến bay Hà Nội → Đà Nẵng"*, trong khi t1 và t2 đều là TP HCM.
4. **Giá bịa trong `description` của plan** (field `price` vẫn là "chưa có giá", guard không quét description):
   - T1: *"Giá vé: 250.000 VND/người"* (Cầu Vàng).
   - L1: *"Giá tham khảo: 800k-1.2 triệu/đêm"*.
   - M1 t8: *"~1.5-2 triệu/người"*, *"khoảng 200-300k/phòng"*.
   - G4a: *"giá tham khảo 1.2-1.5 triệu/đêm"*.
5. **Xếp stop vào giờ quán đóng:**
   - G1a: Ốc Tự Nhiên lúc 08:00 (*"mở 10:00-22:30"*).
   - G4a: Quán cơm Linh lúc 08:00 (*"mở 10:30-15:00"*).
   - L1: Cơm Nhà 1989 lúc 07:00 (*"Mở 10:00-14:00"*).
6. **Chọn sai loại địa điểm:**
   - G1b: *"Mình chọn **Crescent Mall** … rạp phim đang mở cửa"*.
   - M1 t8: *"THUÊ LOA KÉO QUY NHƠN - Karaoke"*.
   - B4 t1: chọn tai nghe quàng cổ JOLA cho yêu cầu "chống ồn".
   - M3 t1: chọn "The Lủi – Quán Nhậu" (loại Quán bia) cho yêu cầu ăn lẩu.
7. **Nói hợp budget khi không có dữ liệu giá:**
   - G3b t2: *"dựa trên danh giá cao … giá hợp lý với tầm 100-150k/người"*.
   - M2 t1: quán được chọn ở dải 100-200k cho yêu cầu "dưới 100k".
8. **Text và card lệch nhau:**
   - B1: text chọn Pro Max ở "táo xanh", card recommended là "iPhone 15 Pro 128GB".
   - M3 t3: không có cards, thay vào đó là *"![Ảnh địa điểm](https://lh3…)"* (ảnh trần).
9. **Số liệu ngưỡng không nguồn (G5):**
   - G5a: *"Nếu giá rẻ hơn 30-40%"*, *"pin trên 80% là tốt; dưới 70%"*.
   - G5c: *"chênh >30% so với giá bình thường"*.
   - Dòng disclaimer có được gắn thêm.
10. **Thiếu mục bắt buộc:**
    - T4 và G5a: thiếu MDM / serial / blacklist.
    - G5b: thiếu số khung/số máy và sang tên.
    - G5d: thiếu cảnh báo ảnh chuyển khoản giả.
11. **M1 t2 hiểu sai người dùng:** *"Nếu là 2 người, mình sẽ gợi ý cho phù hợp hơn nhé"*, trong khi user nói "đi có 1 mình". Lượt này cũng không đưa gợi ý nào.
12. **Lặp gần giống nhau** (không có câu lặp y hệt; harness `duplicate` = null ở cả 51 lượt):
    - G1a lặp câu thời tiết (*"Thời tiết cuối tuần sẽ nắng…29°C"* rồi *"…nắng đẹp (29°C)"*).
    - T1 t1 lặp *"Mình sẽ lập kế hoạch 3 ngày 2 đêm"*, một lần trước tool và một lần sau tool.
    - G5d: đoạn backstop cuối lặp lại *"gặp trực tiếp, kiểm tra xong mới trả tiền"*.
13. **Lỗi chữ và lộ nội bộ:**
    - Lỗi chữ: *"tromcắp"* (T4, M1 t12), *"dưa bạn"* (B3, M2), *"suat chieu va ghe tren"* (M2 t3), *"Danh gia"* (B1, M1 t11), *"ngan sách"* (B4).
    - Lộ nội bộ: *"Gọi tool tìm vé máy bay"* (M1 t7), *"mình cần gọi tool"* (L1).
    - Thiếu khoảng trắng sau câu: *"nhé.Tuyệt vời!"* (G4a, L1, M3).
14. **Đo đạc:** `usage.promptTokens = 3` ở 11 lượt không gọi tool (T4 t2, G5a–d, M1 t1/t2/t5/t9/t12, M3 t2). Số prompt token của harness không dùng được để so chi phí.
