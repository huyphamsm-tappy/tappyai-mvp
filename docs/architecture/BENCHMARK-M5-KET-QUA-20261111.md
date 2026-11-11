# Kết quả đo báo cáo theo luận điểm (M3–M5) — 11/11/2026

Cờ `RESEARCH_THESIS_REPORT=1` cùng các cờ UAT (hợp nhất, làm mới số liệu, viết gọn, độ liên quan biểu đồ; Advanced thêm gói việc và mô hình dự báo). Mốc so sánh: `BENCHMARK-M1-MOC-20261111.md` (cờ thí nghiệm tắt).

**Đây là số đo máy, n = 1 đến 2 mỗi ô, CHƯA có chấm mù của con người.** Chưa thể nói bản mới hay hơn về chất lượng; chỉ nói được độ dài, số nguồn, chi phí và việc mã kiểm được gì.

## Standard

| Câu | Mốc: trang / nguồn / USD | Luận điểm: trang / nguồn / USD | Số liệu bắt buộc |
|---|---|---|---|
| q04 so sánh chuỗi | 11 / 94 / 0,092 | 2,9 / 17 / 0,094 | 100% |
| q06 | 12,6 / 101 / 0,107 | 2,6 / 11 / 0,123 | 100% |
| q03 | — | 3,2 / 14 / 0,120 | 100% |
| q01 trà sữa Hà Nội (2 lượt) | — | 3,2–3,6 / 17–18 / 0,10–0,11 | **25% và 0%** |

## Advanced

| Câu | Mốc | Luận điểm | Ghi chú |
|---|---|---|---|
| q02 dự báo | 16,1 trang / 156 nguồn / 0,64 USD | 5–7,1 trang / 29–36 nguồn / 0,45–0,49 USD | mô hình dự báo có trong báo cáo |
| q06 | — | 5 trang / 27 nguồn / 0,38 USD | số liệu bắt buộc 100% |
| q01 | — | 5,8 trang / 28 nguồn / 0,37 USD | số liệu bắt buộc 25% |

## Mã kiểm được gì (và không)

- Câu có số mà nguồn dẫn không chứa, hoặc dẫn tới nguồn không có, hoặc không dẫn nguồn, bị bỏ trước khi hiện: 0–7 câu mỗi báo cáo (q02 Advanced: 6, q06: 7, q01: 4; Standard: 0–4).
- Mã chỉ kiểm SỐ và MÃ NGUỒN, không kiểm nghĩa câu. Hai báo cáo vẫn có câu "dự báo năm tương lai không rào đón" (`unframed_forecast`, 1–8 câu) và dòng bảng của mô hình dự báo bị bộ kiểm đếm là "số không dẫn nguồn" (do mã tính, không phải trang nào nêu).

## Điểm yếu đã thấy

1. **Standard q01 mất số liệu bắt buộc** (25% và 0%): báo cáo ngắn bỏ luôn "làn sóng 7.000 đồng" ở một lượt; vẫn thiếu mốc 36.000–70.000 đồng nửa đầu 2026 vì khâu tìm nguồn không lấy được, không phải khâu viết.
2. Lượt đầu của q01 Standard lập luận "chuyển sang giá rẻ" trong khi thẻ của chính nó cho thấy chi trên 35.000 đồng tăng; đã thêm yêu cầu đối chiếu luận điểm với thẻ trái chiều, chưa đo lại riêng việc này.
3. Phân tích hỏng 5 trên 14 lượt đo (Standard và Advanced) ở các vòng đầu (lược đồ tùy chọn, trần token); đã sửa, 3 lượt Advanced liền sau sửa đều có dàn ý. Khi hỏng, báo cáo vẫn được viết theo cách cũ (dài 14–16 trang), không mất.
4. Chưa so mù với Claude.

## Sửa Standard q01 (vòng sau, 12 lượt, 11/11)

Chẩn đoán: thẻ về "làn sóng 7.000 đồng" có (11–24 thẻ) nhưng ở một lượt người phân tích bỏ qua; còn mốc 36.000–70.000 đồng, số liệu nửa đầu 2026 và thuế tiêu thụ đặc biệt **không có trong thẻ nào** (khâu tìm nguồn, không phải khâu viết).
Đã làm: (1) người phân tích tính trọng lượng theo số thẻ phủ một chủ đề (5 thẻ trở lên) và luôn dành chỗ cho luật, thuế, cấm sắp có hiệu lực; (2) khi cờ `RESEARCH_FRESHNESS` bật, rà khoảng trống tìm thêm một quy định sắp có hiệu lực; (3) viết từ dàn ý hỏng thì viết lại từ phát hiện như cũ (lượt hỏng `write_failed` sau dàn ý tốt).
Kết quả 12 lượt q01 (4 bộ 3 lượt; 1 lượt hỏng `write_failed` trước khi có bước thử lại, 11 lượt thành công): số liệu bắt buộc 0–50%, **không cải thiện chắc chắn**; "7.000 đồng" có mặt ở 8/11 lượt thành công (trước đó 1/2 lượt), mốc 36.000–70.000 đồng ở 1/11, thuế tiêu thụ đặc biệt ở 0/11. Một câu thêm (tìm theo ngành hàng và nguyên liệu chính) không làm thẻ thuế xuất hiện (0/3) nên đã bỏ. Kết luận: phần thiếu còn lại nằm ở tìm nguồn của Standard (Haiku không biết để hỏi về luật thuế mới), không sửa được tiếp bằng lời nhắc mà không thành vá riêng từng câu. Cách thật là cho Standard một lượt tìm "thay đổi chính sách sắp có hiệu lực" có nguồn tri thức tốt hơn (ví dụ để Sonnet viết truy vấn cho bước này), cần anh quyết vì tốn thêm chi phí.

## Chi phí đo M3–M5

Khoảng 4,8 USD cho 14 lượt đo (kể cả các lượt phát hiện lỗi), cộng dồn từ số `usd.total` của từng lượt.
