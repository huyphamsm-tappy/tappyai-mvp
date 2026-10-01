# STYLE_LUNA6 — giọng văn Luna 6 (01/10) — KẾT QUẢ: cấu trúc an toàn, hiệu quả giọng yếu, cờ KHÔNG bật trên UAT

Trang duyệt cho Huy: https://claude.ai/artifact/BDvoiEi39BbpxSVsDdoeU5 (riêng tư). Mã: `src/lib/ai/consultative/styleLuna6.ts` (MỘT tệp). Cờ: `STYLE_LUNA6=1` (server env), **mặc định TẮT**.

## Nguồn mẫu
`D:\TappyAI-backups\style\luna-samples.md` KHÔNG tồn tại; có tệp cùng nội dung tên `# TAPPYAI — CONVERSATIONAL STYLE RE.txt` (35 mẫu + «STYLE PATTERNS TO LEARN», UTF-8 đọc đúng). Tôi dùng tệp này — lệch đường dẫn so với khối của Huy.

## Đặc điểm giọng rút ra (OBSERVED = đếm từ 35 mẫu; INFERRED = suy ra)
- Dài khoảng 250 ký tự (tối đa 329), 2 đoạn ngắn (28/35) hoặc 3 đoạn (7/35). OBSERVED.
- Mở bằng kết luận/cách nhìn chứ không nhắc lại yêu cầu: 21/35 mẫu mở bằng «Được.», «Chưa chắc.», «Không hẳn.», «Có chứ.», «Vậy thì…», «Nếu…». OBSERVED.
- Nói thẳng: «Tôi sẽ …» 12/35, «Nếu … thì tôi …» 6/35, «Đừng …» 10/35. OBSERVED.
- Hài hước: 😄 ở 22/35 mẫu (63%) — nhiều hơn «thỉnh thoảng» mà chính tệp nêu; lớp giọng chỉ cho tối đa khoảng 1/3. Kiểu đùa: cường điệu nhẹ, ví von đời thường (15/35). OBSERVED/INFERRED.
- Không xã giao đóng khuôn: 0/35 mẫu có «Hy vọng…/Rất vui…». OBSERVED.
- Điểm trừ/trade-off nêu thẳng (mẫu 4, 12, 13, 18, 33). OBSERVED. Hỏi lại tối đa một câu. OBSERVED.
- Mẫu 14 (đùa «phụ nữ… thảm họa») và mẫu 30 (đùa khi đau vai gáy) KHÔNG được học: lớp giọng tắt đùa ở sức khoẻ, cảm xúc nặng, nạn nhân, lừa đảo, khẩn cấp, «chưa có dữ liệu».
- Mẫu 7 có `[recommendation hiện tại]` = chỗ giữ chỗ, không chép.

## Đo (135 lượt = 15 kịch bản + 30 câu gõ đời thường; cùng dữ liệu Serper ghi sẵn; Luna qua OpenAI)
TẮT×2 (nhiễu nền) và BẬT×1: token vào 690.506 / 685.556 / **759.489 (+10,6%)**, ra 34.918 / 34.761 / 34.677; chi phí $0,4605 / $0,5040 / $0,4966; mở «Mình hiểu bạn…» 23 / 21 / **15** (/30 lượt chốt); lượt chốt nêu giả định 27 / 25 / 27 (giữ); câu có emoji 17 / 20 / 14.
- A1↔A2 khác cấu trúc ở 64/135 lượt (nhiễu model rất lớn); B khác cả hai ở 16 lượt (toàn lựa chọn của model — tên chọn, số phương án phụ; ít hơn nhiễu): FOOD-1#2, SHOP-1#2, SHOP-1#4, SHOP-3#4, TRAVEL-1#3/#4/#5, TRAVEL-2#3/#6/#7, ENT-1#2/#4/#6, ENT-3#5, realTyping FOOD-2#2, ENT-2#2.
- Phần code dựng khác 2 lượt (SHOP-2#5, #7: khối thẻ mua sắm có/không) — chạy lại 3 TẮT + 3 BẬT: xuất hiện ngẫu nhiên ở cả hai chế độ ⇒ do model, delta quy cho cờ = 0.
- `remaining_line` của bộ tiêu chí 32 lượt «đỏ» ở B chỉ vì tiêu chí đòi chữ cũ «Mình còn N lựa chọn»; đã cho tiêu chí nhận cả hai cách nói (không đổi ý nghĩa).

## Bộ xưng hô (12 câu): KHÔNG ĐẠT
Không phản chiếu: «tôi», «tui», «mình», anh/em, chị/em đều vẫn nhận «mình/bạn» (trung tính, không đoán sai). «chú/cháu» ra đúng nhưng cờ TẮT cũng vậy. «mày/tao» do người dùng mở: model vẫn «mình/bạn». Cặp trung tính hiện tại: **mình / bạn**. Nguyên nhân: khung chốt `PICK_SHAPE` vẫn bắt «Mình hiểu bạn cần … — mình giả định …» và nằm CÙNG prompt; muốn mạnh hơn phải sửa khung đó (domainFrames.ts — nằm ngoài «chỉ lớp giọng») — không làm.

## Quyết định
Cờ **KHÔNG bật trên UAT** (xưng hô không đạt, hiệu quả giọng yếu, +10,6% token vào). Vòng test cuối của Huy diễn ra với cờ TẮT. Muốn xem thử: đặt `STYLE_LUNA6=1` cho Preview rồi redeploy (Huy quyết).

## Chữ cố định (D6)
Xem bảng trên trang duyệt: 3 chuỗi do server dựng đã viết lại sau cờ (đuôi thẻ hỏi, «Còn N lựa chọn nữa», câu thiếu dữ liệu một chỗ và so sánh); phát hiện «đây là tin hỏi» nhận cả hai đuôi. Chuỗi do CLIENT dựng (tiêu đề thẻ hỏi theo mảng, «Những lựa chọn sát nhất…») chỉ liệt kê — PL-CLIENT-STRINGS.
