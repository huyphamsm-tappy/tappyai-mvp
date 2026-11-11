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

## Chi phí đo M3–M5

Khoảng 4,8 USD cho 14 lượt đo (kể cả các lượt phát hiện lỗi), cộng dồn từ số `usd.total` của từng lượt.
