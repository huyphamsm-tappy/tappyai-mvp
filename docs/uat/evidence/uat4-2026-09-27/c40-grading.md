# UAT4 — chấm consultative-40 (`c40/`, 2026-09-27)

- **Run:** `docs/uat/evidence/uat4-2026-09-27/c40/<id>.json`, 48 lượt (40 câu + 8 lượt trả lời sau hỏi-rõ). Cả 48 lượt đều HTTP 200. Theo `c40-cost-summary.txt`: trung bình $0.0282/lượt, 13,4 s.
- **Thước đo:** C1–C9 trong `docs/audit/eval/consultative-40.md` §"Per-turn PASS/FAIL criteria". Áp thêm luật actionability ngày 2026-09-19 (mục "Rubric change"):
  - 8 câu F7 S5 S6 T5 P5 P7 E2 E5 phải hỏi-rõ ĐÚNG 1 lần.
  - 32 câu còn lại phải tìm, không được hỏi.
  - Tìm khi lẽ ra phải hỏi, hoặc hỏi 2 lần, là ❌.
  - Lượt `b` phải kết thúc bằng một câu trả lời.
- **Quy ước:** PASS = ✅ · PARTIAL = ⚠️ ("PASS with a note", .md vẫn tính là đạt) · FAIL = ❌.
- **Cột prev:** lấy từ lần chấm gần nhất, **FINAL gate `43d37d2`, lượt chạy đầu** (`docs/audit/final-job-report-2026-09-19.md` §chấm từng câu, dẫn từ consultative-40.md dòng 243–251).
  - Lượt `b` không được chấm riêng. Chỉ có ghi chú "S5b ❌, E2b ❌, còn lại đạt".
- **Cách chấm:** đọc prose, block `[TAPPY_*]`, `toolCalls`, và `rows` / `shortlist` của từng lượt. Số điện thoại trong prose (F8, E6) có xuất hiện trong JSON gốc, nên tính là có căn cứ.

## Tổng

| | prev (FINAL gate, lượt 1) | **UAT4** |
|---|---|---|
| 40 câu: ✅ / ⚠️ / ❌ | 23 / 15 / 2 | **4 / 18 / 18** |
| Đạt theo quy ước .md (✅+⚠️) / 40 | **38** | **22** |
| 8 lượt `b`: đạt / ❌ | 6 / 2 (S5b, E2b) | 6 / 2 (T5b, E2b), trong đó chỉ 1 ✅ |
| Hỏi-mà-không-tìm ở câu actionable, lượt đầu | 0 | **5** (S2, T4, T8, E3, E1 hỏi trước rồi mới tìm) |
| Tìm ngay ở câu lẽ ra phải hỏi-rõ | 0 | **3** (P5, P7, E2) |

Có 17 lượt xuống ❌: F4 F5 F6 S2 S4 S7 T2 T4 T8 P5 P6 P7 E1 E2 E3 E7 T5b. Có 1 lượt khá lên là S5b (❌ → ⚠️). T1, P8, E2b vẫn ❌ như trước.

**Nguyên nhân gốc (suy ra từ dữ liệu, chưa đối chiếu code):**
1. **Cổng hỏi-rõ phía server có vẻ không chạy.**
   - Mọi lượt hỏi-rõ đều do model viết: 4,7–7 s, có tính tiền, bullet tự do, không có chip. Lượt hỏi-rõ canned của server thì tốn $0.
   - Hệ quả: câu actionable thì bị hỏi, câu mơ hồ thì bị tìm ngay.
   - Lượt `b` là câu trả lời chip cố định ("3–5 người", "dưới 200k/người"). Chúng không khớp câu model vừa hỏi, nên T5b và E2b lại bị hỏi thêm lần nữa.
2. **Memory rò giữa các thread.** Protocol yêu cầu chấm với memory đã xoá.
   - P5 lấy "Quận 7" từ P4.
   - P6 viết "cho bạn và mẹ".
   - P3 viết "vì bạn hay đi vào tuần sau".
   - E5 viết "quán ăn sang chút".
   - T1 viết "theo sở thích của bạn".
3. **Guard V1 và các guard bằng chứng có vẻ không chạy, hoặc chạy khác.**
   - Các claim không có bằng chứng vẫn còn: đậu xe, yên tĩnh, "mở khuya".
   - Có mảnh câu do cắt clause.
   - Câu heads-up về vé máy bay/suất chiếu bị gắn vào chủ đề khách sạn.
   - Prelim và body dính nhau không có khoảng trắng ("nhé.Mình").

## Bảng chấm

| id | prev | UAT4 | lý do (UAT4) | Δ |
|---|---|---|---|---|
| F1 | ✅ | PASS | Chọn Izakaya 4.8/201, mở đến 22:00, khớp row. Có 1 lựa chọn thay thế với đánh đổi (hải sản, mở đến 00:00). | = |
| F2 | ⚠️ | PARTIAL | Chọn Bếp Ông Cậu, khớp row. Thiếu câu nói thật về giá so với "dưới 80k" (row chỉ có "1-100.000 ₫"). Lựa chọn thay thế Bà Năm không phải quán bún bò. | = |
| F3 | ✅ | PARTIAL | Pick đúng. "không gian yên tĩnh, lãng mạn" không có bằng chứng và thiếu câu nêu khoảng trống bằng chứng. Có 2 lựa chọn thay thế, 1 trong đó mô tả "view đẹp" không có căn cứ. | ↓ |
| F4 | ✅ | **FAIL** | "Cả hai quán đều có chỗ đậu xe ô tô" là bịa. "mở từ 15h nên hoàn hảo cho bữa trưa" sai logic. "chuyên hải sản, không gian rộng" không có căn cứ. | **↓↓** |
| F5 | ✅ | **FAIL** | Không gọi tool nhưng viết "Mình vừa tìm được thông tin" (lỗi C6). Bịa "giá cơm phần khoảng 50-80k/người" và chuyện đậu xe. Giờ 15h đúng. | **↓↓** |
| F6 | ⚠️ | **FAIL** | Prose chỉ còn "Để chắc chắn, bạn có thể:" và 2 bullet. Không có câu trả lời, không nêu tên quán số 2, không có câu "chưa có dữ liệu". Không re-search. | **↓** |
| F7 | ✅ | PARTIAL | Hỏi-rõ đúng 1 lần, nhưng do model viết (bullet, 2 câu hỏi). Tự giả định "bữa tối … Quận 1". | ↓ |
| F7b | ✅ | PARTIAL | Có tìm và chọn RIKYU 4.9/423 0.7 km, có lựa chọn thay thế với đánh đổi, có nói thật về giá. Lỗi chính tả "Danh đối". Nhà hàng Nhật cho yêu cầu "<100k" mà không có giá. | ↓ |
| F8 | ⚠️ | PARTIAL | Có thứ tự Veteran → Nori nhưng không có câu pick rõ ràng. "có phòng riêng", "nướng Hàn Quốc cao cấp" không có căn cứ. Số điện thoại lấy từ row. Có lỗi dính câu "nhé.Mình". | = |
| S1 | ⚠️ | PARTIAL | Card NÊN CHỌN đúng. Prose chỉ còn 2 mảnh câu mồ côi ("Nếu bạn muốn tiết kiệm hơn … bảo hành 12 tháng" / "Nên bạn nên…"). Prose không nêu tên pick. | = |
| S2 | ✅ | **FAIL** | Câu actionable (có ngân sách) nhưng hỏi "ưu tiên gì" kèm 4 bullet. Không gọi tool. | **↓↓** |
| S3 | ✅ | PARTIAL | Tìm lại, chọn HP 4.49 tr và gọi là "rẻ nhất", trong khi rows có máy cũ 3.3–3.4 tr. Nói thật là chưa rõ cấu hình. Lựa chọn thay thế Dell có đánh đổi hợp lý. | ↓ |
| S4 | ⚠️ | **FAIL** | Card pick Ecovacs DD35 **3,49 tr**, nằm ngoài dải 5–7 tr. Có mảnh câu "Lý do nhưng vẫn có rating". "hút sạch lông chó hiệu quả" không có căn cứ. Thẻ in nghiêng `*Gợi ý:` không đóng. | **↓** |
| S5 | ✅ | PARTIAL | Hỏi-rõ 1 lần, nhưng do model viết với 6 bullet và thêm 1 câu hỏi thứ hai. | ↓ |
| S5b | ❌ | PARTIAL | Tìm "nước hoa nữ" (đã hết lỗi nước hoa NAM). Pick CK One chiết 20 ml: "5⭐ nên chất lượng ổn định" nhưng chỉ có 1 đánh giá. Nói Armani 700k "hết ngân sách hơn" là sai, vì 700k < 1 tr. Có khoảng trắng mồ côi ở đầu câu. | **↑** |
| S6 | ✅ | PASS | Hỏi-rõ 1 câu, không bullet, không giả định chủ đề. | = |
| S6b | ✅ | PARTIAL | Pick Havit 4.8/326, 320k, có đánh đổi với Baseus. Có mảnh câu mồ côi "Nếu muốn rẻ hơn một chút". | ↓ |
| S7 | ⚠️ | **FAIL** | Card `recommendation=null`. Prose liệt kê 3 "nhóm" và không pick. Card có lẫn "Bộ lọc 1 inch sợi thủy tinh" (không phải máy lọc). | **↓** |
| S8 | ⚠️ | PARTIAL | Nghiêng về Fujihome A5 4.9/832. Có câu "giá tương đương Rapido" nhưng Rapido chưa được giới thiệu (mảnh còn lại sau khi cắt). "thường 1200-1500W" lấy từ kiến thức model. Card rec=null. | = |
| T1 | ❌ (rerun ✓✓) | **FAIL** | Gọi 5 tool rồi vẫn hỏi "máy bay hay xe khách?" dù đã tự giả định đi máy bay. Không có plan. Nhà hàng gợi ý "Trên 1 Tr" với ngân sách 6 tr. Lỗi chính tả "Trời may". Câu dính "…chi tiết...Tuyệt vời!". Rò memory ("theo sở thích của bạn"). | = |
| T2 | ⚠️ | **FAIL** | Hotel tool trả 0 hàng, không có pick, hỏi ngày. Kèm câu lạc đề **"Giờ chạy và giá vé cụ thể…"** (của vé/suất chiếu) trên chủ đề khách sạn. | **↓** |
| T3 | ✅ | PASS | Nói thật là lượt trước chưa có danh sách, hỏi tên khách sạn và đề nghị tìm lại. | = |
| T4 | ✅ | **FAIL** | Câu actionable (gia đình 4 người, cuối tuần) nhưng hỏi "loại hoạt động" kèm 5 bullet. Không gọi tool. | **↓↓** |
| T5 | ✅ | PARTIAL | Hỏi-rõ 1 lượt, nhưng có 2 câu hỏi và bullet. | ↓ |
| T5b | ✅ | **FAIL** | Câu trả lời chip "3–5 người" không khớp câu đã hỏi, và model **hỏi lại lần 2**. Hội thoại không kết thúc bằng câu trả lời. | **↓↓** |
| T6 | ⚠️ | PARTIAL | Có plan 5 mục từ rows. Nhưng có những lỗi sau:<br>• "people":4 là bịa.<br>• MẸT được xếp 09:00 dù mở 10:00.<br>• CTA "Tìm phòng trên Metvietnameserestaurant" gắn cho nhà hàng.<br>• Đảo Ký ức được gọi "phù hợp hơn cho gia đình" dù người dùng không nói có gia đình. | = |
| T7 | ⚠️ | PARTIAL | Tool rỗng, có trả lời thật và có link chính thức. Nhưng thân trả lời **mất dấu tiếng Việt** ("Mình chua co ket qua gia ve…"), vi phạm C8. | = |
| T8 | ✅ | **FAIL** | Câu actionable nhưng hỏi "Khi nào?". Không gọi tool, không có resort. Dính câu heads-up "Giờ chạy và giá vé…" lạc đề. Lớp lỗi T8 đã sửa trước đây nay quay lại theo dạng khác. | **↓↓** |
| P1 | ⚠️ | PARTIAL | Pick Jang Mi 4.9/8.641 và giờ mở cửa đều đúng. "được đánh giá cao nhất ở Đà Nẵng" là nói quá. Nhắc "Zalo" không có căn cứ. Không có lựa chọn thay thế. Với ý "rẻ" thì chỉ bảo người dùng tự hỏi giá. | = |
| P2 | ✅ | PASS | Pick Hạ Spa 4.9/3.550, nói thật "chưa xác nhận giá", hướng dẫn gọi hỏi giá so với mức 300k. | = |
| P3 | ✅ | PARTIAL | Hiểu đúng "chỗ đó" là Hạ Spa và nói thật là chưa rõ có đặt trước được không. Nhưng có câu rò/bịa **"vì bạn hay đi vào tuần sau"**. | ↓ |
| P4 | ✅ | PARTIAL | Pick Lê Vy Q7 4.9/1.266, giờ đúng. "thư giãn yên tĩnh" không có bằng chứng và không có câu nêu khoảng trống. Chip follow-up mồ côi "Spa khác ở Q1\|". | ↓ |
| P5 | ✅ | **FAIL** | Lẽ ra hỏi-rõ nhưng **đã gọi tool** với vị trí "Quận 7" rò từ P4. Đoạn hỏi-rõ **lặp 2 lần**. "tuyệt vời ở Quận 7" nhưng LaVie ở Lý Tự Trọng, Quận 1. | **↓↓** |
| P5b | ✅ | PARTIAL | Pick Cổ Phong 4.9/3.180, nói thật về giá. Nói Cổ Phong "gần nhất (1.3km)", rồi dòng dưới lại nói Trạm Relax "gần nhất (0.9km)", tự mâu thuẫn. Có 2 lựa chọn thay thế. | ↓ |
| P6 | ⚠️ | **FAIL** | Yêu cầu là couple nhưng câu trả lời viết "**cho bạn và mẹ**" (rò memory). "nổi tiếng … sạch sẽ và yên tĩnh" không có căn cứ. Có 2 lựa chọn thay thế. | **↓** |
| P7 | ✅ | **FAIL** | Lẽ ra hỏi-rõ nhưng đã tìm ngay. Nội dung thì tốt (An Miên 1 km 4.9/947). Lỗi dính câu "nhé! 🧖‍♀️Mình". | **↓↓** |
| P7b | ✅ | PASS | Pick An Miên 1 km, 4.9/947, mở đến 22:00. Lựa chọn thay thế Nemo có đánh đổi. | = |
| P8 | ❌ (rerun ✗✓) | **FAIL** | Nói "tìm được 2 spa mở khuya sau 22h", nhưng cả hai **đóng 22:00**. "sạch sẽ" là bịa. Lẽ ra phải nói thật là không có chỗ nào mở sau 22h. | = |
| E1 | ✅ | **FAIL** | Hỏi rồi vẫn tìm. Câu hỏi bị **lặp**. Có mảnh "Ngoài ra còn" và link GrabFood/BeFood mồ côi. **Ảnh inline trong prose.** Hứa suông "Mình sẽ tìm thêm". Không có pick cho nhóm 5 người. | **↓↓** |
| E2 | ✅ | **FAIL** | Lẽ ra hỏi-rõ nhưng đã tìm ngay. Nội dung ổn (Galaxy Nguyễn Du 4.3/9.380). | **↓↓** |
| E2b | ❌ | **FAIL** | "dưới 200k/người" bị **hỏi lại** (phim gì, giờ nào). Không tìm, không có câu trả lời. | = |
| E3 | ✅ | **FAIL** | Câu actionable nhưng hỏi "loại nhạc nào". Liệt kê 3 bar và không pick. Nói "cần xác nhận quán nào có nhạc sống". | **↓↓** |
| E4 | ⚠️ | PARTIAL | Nói thật là thông tin giữ xe thường không có. Nhưng hỏi 2 câu (xe máy/ô tô, quán nào) và không re-search. Phần này chấp nhận được vì E3 không có pick. | = |
| E5 | ✅ | PARTIAL | Hỏi 1 lần, nhưng tự đổi "cuối tuần" thành "**Tối nay** … Quận 1". "quán ăn sang chút" rò từ memory. Có bullet. | ↓ |
| E5b | ✅ | PARTIAL | Pick Karaoke MEI 0.7 km 4.9/1.505 và giờ mở cửa đều đúng. Avatar được nêu với đánh đổi. BB Restaurant "vừa ăn vừa hát" không có căn cứ. Lượt tìm cinema trả về karaoke. | ↓ |
| E6 | ⚠️ | PARTIAL | Pick KAMELA 4.8/287. Viết "giá tầm 100k/người vừa khít" từ mức giá "1-100.000 ₫" (câu khẳng định hợp ngân sách đã bị bỏ từ trước, nay xuất hiện lại). "không khí tốt" không có căn cứ. Chip follow-up "Quận 1" sai khu vực. | = |
| E7 | ⚠️ | **FAIL** | Không gọi tool. 3 phim năm 2024 (Deadpool & Wolverine, Wicked, Joker 2) được gọi là "Phim mới, đang hot", "vừa ra" vào 09/2026: **sự kiện hiện thời bị bịa**. | **↓** |
| E8 | ✅ | PARTIAL | Pick Tinker Box 1.3 km 4.4/170, đúng giờ. Vietopia là lựa chọn thay thế có đánh đổi về giờ. "sân chơi trong nhà", "tiệc sinh nhật" không có căn cứ. Lỗi dính câu "nhé! 🎉Mình". | ↓ |

## Defects (trích ≤20 từ)

1. **Bịa sự thật / thuộc tính**
   - F4 "Cả hai quán đều có chỗ đậu xe ô tô."
   - F5 "giá cơm phần khoảng 50-80k/người"
   - P8 "Mình tìm được 2 spa mở khuya sau 22h" (cả hai đóng 22:00)
   - E7 "Deadpool & Wolverine — … Phim mới, đang hot lắm."
   - T6 `"people":4`
2. **Tìm giả (C6)**
   - F5 "Mình vừa tìm được thông tin:" (không có tool call)
3. **Sai logic hoặc sai loại**
   - F4 "mở từ 15h nên hoàn hảo cho bữa trưa cuối tuần"
   - S4 pick 3.489.000đ cho "tầm 5-7 triệu"
   - S3 "rẻ nhất" trong khi có hàng 3,3 tr
   - P5 "vài chỗ massage tuyệt vời ở Quận 7" nhưng quán ở Quận 1
   - S7 card có "Bộ lọc không khí 1 inch sợi thủy tinh"
4. **Lạc đề / trộn chủ đề**
   - T2 và T8 (khách sạn/resort) kèm "Giờ chạy và giá vé cụ thể mình chưa xác nhận được…"
   - T6 CTA "Tìm phòng trên Metvietnameserestaurant"
5. **Rò memory giữa các thread**
   - P6 "spa couple … cho bạn và mẹ tối nay"
   - P3 "vì bạn hay đi vào tuần sau"
   - P5 "Quận 7 (nơi bạn quan tâm)"
   - E5 "Tối nay … quán ăn sang chút"
6. **Lặp văn bản**
   - P5: đoạn "Mình hiểu bạn muốn tìm chỗ massage…" xuất hiện 2 lần.
   - E1: "Karaoke, bar, quán ăn, hay hoạt động khác?…" xuất hiện 2 lần.
7. **Hỏi quá mức ở câu actionable**
   - S2 "Bạn ưu tiên gì nhất?"
   - T4 "Bạn thích loại hoạt động nào nhất?"
   - T8 "Khi nào?"
   - E3 "bạn có thích loại nhạc nào không?"
   - T1 "bạn muốn đi máy bay hay xe khách?"
8. **Câu hỏi-rõ mà lượt `b` không kết thúc bằng câu trả lời**
   - T5b "Nhưng mình vẫn cần biết bạn muốn chơi gì"
   - E2b "Bạn muốn xem phim gì hoặc vào lúc nào?"
9. **Mảnh câu do guard cắt**
   - S4 "Lý do nhưng vẫn có rating 4.9⭐"
   - S1 "Nếu bạn muốn tiết kiệm hơn và có màn hình LED, bảo hành 12 tháng"
   - S6b "Nếu muốn rẻ hơn một chút"
   - S8 "giá tương đương Rapido"
   - E1 "Ngoài ra còn"
   - F6 chỉ còn "Để chắc chắn, bạn có thể:"
10. **Layout / ngôn ngữ**
    - E1 có `![Ảnh địa điểm](…)` inline trong prose và link GrabFood/BeFood mồ côi.
    - T7 mất dấu tiếng Việt: "Mình chua co ket qua gia ve truc tuyen".
    - Prelim dính body: "nhé.Mình" (F4, F8), "nhé! 🎉Mình" (E8, P7), "...Tuyệt vời!" (T1).
    - P5b tự mâu thuẫn "gần nhất (1.3km)" / "gần nhất (0.9km)".
