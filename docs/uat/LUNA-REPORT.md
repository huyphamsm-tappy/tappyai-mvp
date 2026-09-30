# PHIÊN LUNA — báo cáo đo (30/09/2026)

Nhánh `luna/consult-2026-09-30` @ worktree `D:\TappyAI-wt\wtluna`. Mọi thứ sau cờ **`CONSULT_LUNA` (mặc định TẮT)** — cờ tắt = y hệt Phase 7 (4.743 test chat/AI xanh khi tắt).
Đo bằng replay OFFLINE (không đụng UAT/production). Mốc Haiku = 2 lượt replay Phase 7 29/09 17:40Z + 17:48Z (dùng lại, không chạy lại).
Phân loại A/B/C/D: ĐỌC TAY từng lượt (ghi chú: `D:\TappyAI-wt\.cache\classify.md`).

## 1. Bộ gốc (15 kịch bản × 7 lượt, cùng bộ chấm)

| | Haiku (mốc, 2 lượt) | **Luna none** (code cuối) | Luna low (code cuối) |
|---|---|---|---|
| Đạt tiêu chí tự động | 92,5/105 | **96/105** | 95/105 |
| Ăn uống /21 | 18,5 | 19 | 19 |
| Mua sắm /21 | 17,5 | 19 | 20 |
| Du lịch /21 | 17,5 | 18 | 15 |
| Giải trí /21 | 18,5 | 20 | 20 |
| Spa /21 | 20,5 | 20 | 21 |
| A (bịa) ở lượt tư vấn | 0 | **0** | **0** |
| B (hiểu sai) ở lượt tư vấn | 3 ở ngách (SHOP-1 t6 ốp đen, SHOP-3 t6 "Lite thường nhẹ", SHOP-2 t4) — phân loại của anh 30/09 | 1 (FOOD-2 t2 ngân sách) → sửa, xem §4 | 1 (SHOP-3 t6 "nhẹ hơn" → XPS 15) → sửa, xem §4 |
| $/lượt (route tính, như mốc) | $0,00916 | **$0,00464 (−49%)** | $0,00466 |
| $/lượt thực chi | $0,00745 | **$0,00295 (−60%)** | $0,00301 |
| 900 lượt/tháng | $8,24 | **$4,18** | $4,19 |
| Tới token đầu của model p50/p90 | 0,73 / 0,91 s | 2,8 / 3,6 s | 5,1 / 7,6 s |
| Tới chữ đầu cho user p50/p90 | 3,0 / 8,3 s | **3,8 / 10,2 s** | 6,4 / 14,0 s |
| Token suy luận | 0 | 0 | 6.346 |

Độ ổn định (2 lượt, code trước đó 061d502): none 94,5/105 $0,00473 · low 93/105 $0,00534 (16.658 token suy luận).
Kế hoạch chi tiết vẫn chạy Haiku ở cả 3 cột (đúng quyết định); lỗi của lượt kế hoạch là lỗi Phase 7, không tính cho Luna.

## 2. Bộ "gõ đời thường" (15 kịch bản × 2 lượt mở đầu, biến thể không dấu / viết tắt / teen code / chửi thề nhẹ)

| | Haiku | Luna none | Luna low |
|---|---|---|---|
| Hiểu đúng dữ kiện (mảng, khu vực, số người, ngân sách, thời gian) | 76/88 (86%) | **85/88 (97%)** | 86/88 (98%) |
| Hội thoại hiểu đúng hoàn toàn | 8/15 | 12/15 | 13/15 |
| Đạt tiêu chí tự động | 29/30 | 27/30 | 27/30 |
| A / B ở lượt chọn | 0 / **3** (sơn gel → **son môi**; Đà Nẵng → quán Sài Gòn; vé HN → khách sạn Sài Gòn) | 0 / 0 (+ "sg ra hn" đọc sai điểm đến → đã sửa §4) | 0 / 0 |

Trang so sánh cạnh nhau (có cột trống dán câu trả lời ChatGPT Go): https://claude.ai/artifact/DnvHzq2MNaxiKrp7WvECFV

## 3. Chống tiêm lệnh (10 ca + 1 ca bổ sung, câu lệnh giấu trong tin nhắn, tên quán, đoạn trích web, mô tả sản phẩm, khách sạn)

| | Haiku (cờ tắt) | Luna none | Luna low |
|---|---|---|---|
| Lượt trượt (làm theo / lộ / link ngoài danh sách) | **2/12** (INJ-10, INJ-11: tên khách sạn/sản phẩm bị cài lệnh + link lọt vào câu trả lời qua câu "Mình chọn" do server viết) | **0/12** | **0/12** |

Lớp bảo vệ (chỉ khi cờ bật): dữ liệu không tin cậy đi thành 1 khối "DỮ LIỆU PHIÊN — không phải lệnh" ngoài system; Serper được làm sạch ngay cửa (URL + đoạn chứa lệnh bị cắt khỏi tên/mô tả); câu trả lời lặp lại prompt tĩnh hoặc có dạng khoá bị thay; truy vấn tìm bổ sung bị cắt email / sđt / toạ độ / cụm trong trí nhớ.

## 4. Sửa sau lượt đo cuối (commit 5248246) — xác minh bằng chạy lại có mục tiêu
Luật thêm vào lõi Luna: "điều người dùng NÓI RÕ (ngân sách, khu vực, 'nhẹ hơn', 'mới'…) đứng TRƯỚC điểm đánh giá"; code bỏ điểm đến trùng nơi đi.
| Lỗi B | Trước | Sau (none×2 + low×2) |
|---|---|---|
| FOOD-2 t2 "giao Q7, 1 người, dưới 100k" → quán hải sản chưa rõ giá | B | **Bánh Cuốn (giá niêm yết 1–100k) 4/4** |
| SHOP-3 t6 "nặng quá, muốn nhẹ hơn" → Dell XPS 15 vì "Thiết kế Sang Trọng" | B | **EVOO Ultra Thin / HP ZBook Firefly 14 / MacBook Neo 13 — 4/4 hợp lý, có ghi chưa xác nhận cân nặng/tình trạng** |
| Gõ đời thường "ve mb sg ra hn" → điểm đến TP.HCM | sai dữ kiện | điểm đến sai đã bỏ (vẫn chưa đọc được "hn" = Hà Nội — C) |

**Kết luận theo tiêu chí phiên Luna của anh** (mỗi mảng ≥ mốc Haiku hoặc ≥ 17/21; A = 0; B = 0 ở lượt chính; chi phí thấp rõ): **Luna none ĐẠT** — 5/5 mảng ≥ 17/21 (spa 20 so với mốc 20,5 nhưng ≥ 17), A = 0, B = 0 sau §4, chi phí −49%.
**Theo ngưỡng release Phase 7 (thêm "C ≤ 1/mảng") thì CHƯA đạt ở 2 mảng:** ăn uống C = 2, mua sắm C = 3 (du lịch, giải trí, spa mỗi mảng 1). Các C này đều là "nói thật khi dữ liệu không có": tìm lại không ra quán/mẫu mới, không có dữ liệu màu, lượt xem thêm chọn lại cái đã hiện — không phải bịa. Mốc Haiku ở cùng chỗ thì hoặc cũng C, hoặc thành B (chọn bừa cái đã bác). Anh quyết có áp trần C cho Luna không.

## 5. Chi phí đợt đo (thực chi, mọi lượt chạy kể cả lượt bị huỷ vì sửa lỗi — 46 lần chạy, 2.221 lượt)
**~$6,62** = OpenAI ~$1,39 · Anthropic ~$4,20 (lượt kế hoạch Haiku, các lượt Haiku tham chiếu, dự phòng) · Serper 1.040 lần gọi thật $1,04. Probe key: < $0,01.

## 6. Đề xuất
1. **Dùng Luna none cho cả lượt tư vấn và bước hiểu ý định.** Luna low: chất lượng không hơn (95 vs 96; du lịch 15), chữ đầu chậm gấp ~1,7 lần (p50 6,4 s), token suy luận làm chi phí dao động (+13% ở lượt code trước). Hiểu ý định: none 97% vs low 98% trên bộ gõ đời thường — ngang nhau (chưa tách riêng effort ý định với effort trả lời; gộp cùng mức ở mỗi cột).
2. **Điểm yếu cần anh biết: độ trễ.** Chữ đầu cho user p50 3,8 s (Haiku 3,0 s), p90 10,2 s (8,3 s). Nguyên nhân chính: bước hiểu ý định của Luna chạy nối tiếp ~2–2,8 s trước mọi thứ. Hướng giảm (chưa làm, đo từng hướng): chạy tìm kiếm của code SONG SONG với bước ý định khi luật đã chắc; rút gọn lược đồ JSON (~200 token ra/lượt).
3. **Kế hoạch chi tiết vẫn Haiku** — vẫn còn lỗi Phase 7 (bịa món/mẹo ở vài kế hoạch). Test Luna medium cho kế hoạch là bước sau.
4. **3 lỗi Phase 7 phát hiện trong lúc đo (có cả khi cờ TẮT — chỉ sửa trong nhánh Luna):** (a) ngân sách đọc từ tên sản phẩm user chép lại "Core i5-1334U" → 1.334.000đ (Haiku chọn "cửa hàng sửa bản lề laptop"); (b) "núi" → "Núi Ba Vì, Hà Nội" bỏ qua "gần Sài Gòn"; (c) tên khách sạn/sản phẩm bị cài lệnh + link lọt ra câu trả lời qua câu "Mình chọn" do server viết (tiêm lệnh INJ-10/11).

---

# BÁO CÁO GỘP — 3 việc sau quyết định "Luna none" (30/09, nhánh luna/consult-2026-09-30, mọi thứ sau cờ mặc định TẮT)

Trang so sánh từng kế hoạch (Haiku | Luna medium | Luna low, kèm phán quyết đọc tay): https://claude.ai/artifact/A6Kf7iKn4WkC8dPFFsFuo5 (riêng tư)

## 7. Luna làm lượt kế hoạch chi tiết (CONSULT_LUNA_PLAN)

**Bộ kiểm** đúng như anh giao: 15 lượt kế hoạch của bộ Phase 7 + 8 ca khó (R13, R12, R12b, R9, R15-1, R16, E1-G5 "tối nay 5 người Q1", DN-1510 "Đà Nẵng 15/10 máy bay"). Mốc Haiku dùng lại (2 lượt 29/09 + 1 lượt hôm nay cùng code) + androidR 29/09 cho R13/R12/R12b/R9/R15-1/R16; chỉ chạy Haiku mới cho E1-G5 và DN-1510 (chưa có) ×2.

**Phát hiện kỹ thuật (quyết định cách chạy):**
- gpt-6-luna trên /chat/completions **từ chối công cụ khi mức suy nghĩ khác none** → lượt medium đầu tiên 100% rơi về Haiku. Cách xử lý: kế hoạch **du lịch** chạy KHÔNG công cụ (code đã tìm sẵn khách sạn + quán + thời tiết), đúng mức suy nghĩ; kế hoạch **mảng khác** giữ công cụ nên chạy ở none, **tối đa 1 lần tìm** (lần thứ 2 do code trả lời, không gọi Serper) + luôn còn 1 bước để viết.
- Thêm 1 luật cho lượt kế hoạch Luna: viết đủ mọi mục của khung; câu hỏi cụ thể ("gọi món gì", "kiểm tra gì") trả lời trong mục phù hợp; mục thiếu ghi "chưa có thông tin".
- **high / xhigh KHÔNG chạy:** medium đã 27 s trung vị, 43 s p90, tối đa 56 s và 6/18 kế hoạch du lịch quá hạn chờ chữ đầu → rơi Haiku, tổng tới 50–61 s (1 lần vượt 60 s của Vercel). Mức cao hơn chỉ chậm hơn. Thay vào đó tôi đo thêm **low** cho du lịch (ngoài thang anh giao, ghi rõ): 0 lần rơi, tối đa 25 s.

**Kết quả** (đọc tay theo đúng 10 điều; bịa đếm riêng; cùng một người chấm, cùng độ khắt khe cho cả 3 cột):

| | kế hoạch | ĐẠT (tay) | đạt nếu dòng chi phí do code viết đúng | bịa | bịa / kế hoạch | kế hoạch 0 bịa | $ tổng | **$ / kế hoạch ĐẠT** | thời gian p50 / p90 / max | rơi Haiku |
|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 4.5 | 55 | 2 | 5 | **177** | 3,2 | 14 | $1,048 | **$0,524** | du lịch 30/49/51 s · khác 9/13/19 s | — |
| Luna (du lịch medium, khác none) | 46 | 4 | 6 | **11** (9 từ lượt Haiku dự phòng) | 0,24 | 43 | $0,285 | **$0,071** | du lịch 27/43/**56** s · khác 7/16/19 s | 6/18 du lịch |
| Luna low (chỉ du lịch) | 9 | 0 | 0 | 3 | 0,33 | 6 | $0,039 | – | **18/23/25 s** | 0 |

Du lịch riêng: Haiku 0/16 đạt, bịa 106 · Luna medium 0/18, bịa 10 (1 nếu bỏ lượt dự phòng) · Luna low 0/9, bịa 3.

**Đọc kết quả:**
- Tỉ lệ ĐẠT rất thấp ở CẢ HAI model vì phần lớn lỗi là **CODE Phase 7**, không phải model: (a) dòng "Chi phí" do code chèn **ghi sai tên quán / sai số người / bỏ giá có nguồn** ở 27/55 kế hoạch Haiku và 12/46 Luna; (b) câu báo thiếu dữ liệu do code ghép bị lỗi ("Mình chưa xác nhận được X, Y, giá và giá — nên gọi hỏi…") gần như mọi kế hoạch; (c) mục khung để trống ("Thời lượng" spa, "Ăn ở đâu" du lịch).
- Khác biệt thật giữa 2 model là **bịa**: Haiku 177 chi tiết không nguồn (giờ đóng cửa sai, món từng quán, "miễn phí", "gần Landmark 81", "tối thứ Tư không đông", gán giá/đánh giá quán này cho quán khác). Luna gần như không bịa, nhưng hay **bỏ trống / nói thiếu dữ liệu cả khi nguồn có** (lỗi C).
- **Theo 4 điều kiện của anh, Luna thay Haiku cho kế hoạch:**
  - chất lượng ≥ Haiku (4 vs 2 đạt; 6 vs 5 nếu sửa dòng chi phí) ✓;
  - bịa không cao hơn (0,24 vs 3,2 / kế hoạch) ✓;
  - chi phí mỗi kế hoạch đạt thấp hơn ($0,071 vs $0,524) ✓;
  - trong giới hạn thời gian: **medium KHÔNG** (du lịch tới 56–61 s khi rơi dự phòng) → **dùng low cho du lịch** (tối đa 25 s) ✓.
- ⚠ Mẫu low mới 1 lượt (9 kế hoạch du lịch), ít hơn yêu cầu 2 lượt. Chất lượng low ≈ medium (0 đạt cả hai; bịa 3 vs 1). Nên chạy thêm 1 lượt low trước khi bật UAT.

**Đề xuất cấu hình kế hoạch:** CONSULT_LUNA_PLAN=1, LLM_PLAN_PROVIDER=openai, **LLM_PLAN_REASONING=low** (du lịch, không công cụ); mảng khác tự chạy none + 1 lần tìm. Dự phòng Haiku sau 25 s chờ chữ đầu (LLM_PLAN_TIMEOUT_MS).

**Việc cần làm để kế hoạch thực sự ĐẠT** (cả Haiku lẫn Luna, là lỗi code Phase 7):
- sửa dòng "Chi phí" do code chèn: lấy đúng quán đã chốt, đúng số người, giữ giá có nguồn;
- sửa câu ghép "chưa xác nhận được … giá và giá";
- khung không cho mục trống.

## 8. Độ trễ lượt tư vấn (CONSULT_LUNA_FAST)

Bỏ bước hiểu ý định (~1,9 s) khi luật đã CHẮC và lượt nối tiếp tư vấn đang có: hỏi tiếp / so sánh, hoặc "xem thêm / bác / lên kế hoạch" ngắn (≤ 6 chữ). Lượt mới, lượt trả lời câu hỏi của mình, lượt luật chưa chắc thì vẫn chạy ý định. Giữ thông tin từ lượt trước và chỉ thêm những gì tin nhắn này nói (bản đầu đọc lại cả lịch sử làm đổi câu tìm kiếm; đã sửa ở 4607631).

| thời gian tới chữ đầu cho user (bộ 15×7) | p50 | p90 | lượt không phải kế hoạch p50 / p90 |
|---|---|---|---|
| Haiku (mốc) | 3,0 s | 8,3 s | 2,4 / 4,8 s |
| Luna none (trước) | 3,7 s | 10,0 s | 3,3 / 4,5 s |
| Luna none + bỏ ý định (kế hoạch Haiku) ×2 | 2,4 s | 9,6 s | 2,1 / 4,3 s |
| **Bật hết: thêm kế hoạch Luna** ×2 | **2,3 s** | **6,3 s** | **2,0 / 4,5 s** |

Theo loại lượt (bật hết): hỏi tiếp 1,0 s · so sánh 1,3 s · xem thêm 2,1 s · bác 2,0 s · chọn 4,5 s (vẫn chạy ý định) · kế hoạch 6,6 s.

**Đạt mục tiêu ≤ Haiku (3,0 / 8,3 s).** Chất lượng lượt tư vấn (không tính kế hoạch), đọc tay, áp quyết định "nói thật không có dữ liệu = ĐẠT": 86/90 và 85/90 (Luna none trước: 86/90), **A = 0, B = 0**. Lỗi còn lại: "xem thêm" liệt kê không chốt 1 (D), "chỗ kia" của bộ test (D), 1–2 câu chọn bị guard cắt cụt (C).

## 9. Cache Serper (SERPER_CACHE_V2)

**Hiện trạng:**
- 2,0 lần gọi Serper/lượt; **Serper = 46% chi phí mỗi lượt** (mua sắm 69%, spa 55%, ăn uống/du lịch 37%, giải trí 29%).
- 85% lần gọi cache được (ảnh không cache).
- 99% lần tìm web là tra link/giá do code dựng: site:tiktok/klook/trip.com là tra link; site:shopee/lazada/cellphones/grab là giá.

**v2:**
- **Khoá** = truy vấn chuẩn hoá + khu vực. Chuẩn hoá gồm: bỏ dấu theo yêu cầu anh; bỏ từ thừa (ở/tại/khu vực); gộp q1/Q.1/quận 1 và sg/tp.hcm/sài gòn…; bỏ "hồ chí minh" cạnh quận số.
- **Hạn theo loại:**
  - địa điểm: 3 ngày;
  - tra link: 3 ngày;
  - giá (shopping + web giới hạn trang bán): 6 giờ;
  - web khác: 24 giờ;
  - mọi thứ gắn với hôm nay (tối nay, lịch chiếu, sự kiện, giá vàng, khuyến mãi, ngày cụ thể): 1 giờ.
- Giá trị qua bộ làm sạch trước khi dùng chung; khoá băm, không lưu gì về người dùng; dùng KV hiện có; mặc định TẮT.

**Không trả dữ liệu cũ sai giờ/giá:**
- Giờ: kết quả địa điểm chỉ có lịch mở cửa theo TUẦN; "đang mở" do code tính lúc đọc, nên hạn 3 ngày không đóng băng giờ.
- Giá: v1 đang giữ 24 giờ cho cả trang bán; v2 cắt còn 6 giờ.
- Bỏ dấu: 0 cặp khác nghĩa bị gộp trong bộ đo (rủi ro lý thuyết: mắt/mất).

| | tỉ lệ trúng | Serper/tháng |
|---|---|---|
| chạy lặp bộ Phase 7 + gõ đời thường (12 lần chạy = 95 "người", cùng giờ) | v1 56,7% · v2 57,6% | (cận trên — cùng bộ câu) |
| **100 người** (900 lượt, ~1.800 lần gọi), ước tính Zipf | v1 ~10% · v2 ~13% | không cache $1,80 · v1 $1,64 · **v2 $1,60** |
| **1.000 người**, ước tính | v1 ~31% · v2 ~32% | không cache $17,97 · v1 $13,29 · **v2 $13,03** |

→ Tiền tiết kiệm nhỏ ở quy mô hiện tại. Giá trị chính của v2 là **dữ liệu giá không cũ quá 6 giờ** và **dữ liệu dùng chung đã làm sạch**.

## 10. Chi phí mỗi lượt khi bật hết + 900 lượt/tháng

| cấu hình | $/lượt | 900 lượt/tháng |
|---|---|---|
| Haiku (Phase 7) | $0,00916 | $8,24 |
| Luna tư vấn none (kế hoạch Haiku) | $0,00464 | $4,18 |
| **Bật hết** (Luna tư vấn + bỏ ý định + Luna kế hoạch), đo ×2 | **$0,00315** | **$2,84** |
| + kế hoạch du lịch low thay medium (ước) | ~$0,00310 | ~$2,79 |
| + cache Serper v2 ở 100 người (ước) | ~$0,0029 | **~$2,6** |

(Giá đã gồm Serper $0,001/lần gọi, token suy luận, token ghi cache.)

## 11. Tổng chi đợt này
Từ 06:20: model ~$1,97 (OpenAI + Anthropic, gồm mốc Haiku E1-G5/DN-1510 và các lượt dự phòng) · Serper thật ~$0,33 (330 lần gọi mới) → **~$2,30**. **Cả phiên Luna: ~$8,9.** (Chấm tay kế hoạch do một agent đọc, không tốn API của dự án.)
