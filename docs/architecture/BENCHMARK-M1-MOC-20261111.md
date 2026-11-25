# M1 — mốc của bản hiện tại trên bộ 10 câu (11/11/2026)

Bản hiện tại = engine nghiên cứu sâu của nhánh `feat/brain-r13-p1` **với mọi cờ thí nghiệm tắt** (không hợp nhất, không gói việc, không mô hình dự báo, không số cũ, không viết gọn, không độ liên quan biểu đồ). Mỗi ô là **1 lượt** (n = 1): đây là mốc để so, không phải ước lượng tỷ lệ. 16 lượt chạy mới (8 Standard, 8 Advanced) và 4 lượt tái dùng từ các vòng đo trước cùng cấu hình. Chi phí các lượt mới: 4,28 USD (trần đặt 6 USD).

| Câu | Tầng | USD | Giây | Trang | Lặp % | Dữ kiện bắt buộc | Thiếu | Hoàn chỉnh | Trích dẫn | Hiệu quả |
|---|---|---|---|---|---|---|---|---|---|---|
| q01 | Advanced (tái dùng) | 0.49 | 182 | 18.4 | 11.9 | 50% | shift, wave7k | 2.5 | 4.1 | 0 |
| q01 | Standard (tái dùng) | 0.10 | 74 | 11.9 | 4.8 | 50% | shift, h1 | 2.5 | 4.2 | 4 |
| q02 | Advanced (tái dùng) | 0.50 | 218 | 16 | 12.4 | 60% | sensitivity, price | 3.5 | 3.5 | 0.5 |
| q02 | Standard | 0.11 | 72 | 11.7 | 7.9 | 80% | price | 4 | 3.5 | 3.5 |
| q03 | Advanced | 0.52 | 188 | 17 | 10.1 | 100% | – | 5 | 4.3 | 0.7 |
| q03 | Standard (tái dùng) | 0.11 | 85 | 11.9 | 8.3 | 100% | – | 5 | 3.9 | 3.4 |
| q04 | Advanced | 0.50 | 213 | 17.8 | 20.6 | 100% | – | 5 | 4.2 | 0 |
| q04 | Standard | 0.09 | 68 | 11 | 7.8 | 100% | – | 5 | 4.1 | 3.7 |
| q05 | Advanced | 0.45 | 159 | 15.1 | 5.5 | 100% | – | 5 | 4.2 | 3.1 |
| q05 | Standard | 0.09 | 59 | 9.6 | 3.1 | 100% | – | 5 | 3.5 | 4.6 |
| q06 | Advanced | 0.48 | 171 | 17.5 | 2.9 | 100% | – | 5 | 4.1 | 1.6 |
| q06 | Standard | 0.11 | 85 | 12.6 | 8.6 | 100% | – | 5 | 4.3 | 3.1 |
| q07 | Advanced | 0 (lỗi) | 35 | – | – | – | không lập được kế hoạch | – | – | – |
| q07 | Standard | 0.11 | 69 | 10.2 | 6.7 | 100% | – | 4.5 | 3.8 | 4.1 |
| q08 | Advanced | 0.52 | 202 | 19.5 | 7.1 | 100% | – | 5 | 4 | 0.7 |
| q08 | Standard | 0.09 | 72 | 11.8 | 1.4 | 100% | – | 5 | 4.1 | 4.1 |
| q09 | Advanced | 0.56 | 224 | 17.5 | 13.8 | 100% | – | 4.5 | 3.1 | 0 |
| q09 | Standard | 0.11 | 70 | 11.3 | 3 | 100% | – | 4.5 | 3.4 | 4.2 |
| q10 | Advanced | 0.44 | 156 | 14.7 | 5.7 | 100% | – | 5 | 3.9 | 3.2 |
| q10 | Standard | 0.10 | 72 | 12.3 | 4.6 | 100% | – | 5 | 4.1 | 3.9 |

Trung bình các lượt thành công:
- **Standard (n = 10):** 0,102 USD; 11,4 trang; lặp 5,6%; dữ kiện 93%; hoàn chỉnh 4,5; trích dẫn 3,9; hiệu quả 3,9. Vượt hạn mức chi 0/10; **quá 8 trang 10/10**.
- **Advanced (n = 9):** 0,496 USD; 17,1 trang; lặp 10,0%; dữ kiện 90%; hoàn chỉnh 4,5; trích dẫn 3,9; hiệu quả 1,1. **Vượt hạn mức chi 7/9; quá 8 trang 9/9.**

## Điều mốc cho thấy
1. **Độ dài là vấn đề lớn nhất, ở cả hai tầng:** 19 trên 19 báo cáo thành công vượt mục tiêu 8 trang (Standard 9,6 đến 12,6; Advanced 14,7 đến 19,5). Điểm hiệu quả của Advanced chỉ 1,1/5.
2. **Advanced vượt hạn mức 0,45 USD ở 7 trên 9 lượt** (trung bình 0,50). Standard trong hạn mức (0,10 so với 0,15).
3. **Bộ dữ kiện bắt buộc hiện chưa phân biệt được tốt:** q03–q10 đạt 100% vì dữ kiện chỉ là cấu trúc (có số 2026, có tên đối tượng…). Chỉ q01 và q02, có dữ kiện cụ thể từ bản Claude mẫu, phân biệt được: **cả hai tầng đều thiếu nghịch lý 36.000–70.000 đồng ở q01** (khoảng trống đã biết), Advanced còn thiếu thương hiệu 7.000 đồng. **Chủ sở hữu cần bổ sung dữ kiện cụ thể cho q03, q04, q06, q08–q10** để bộ này đo được thay vì chỉ kiểm cấu trúc.
4. **Một lỗi cứng:** q07 Advanced không lập được kế hoạch (0 USD, báo cáo rỗng). Nhật ký chẩn đoán mới chỉ ra nguyên nhân, xem dưới.
5. **Trích dẫn (Verifier):** trung bình 3,9/5 ở cả hai tầng, tức khoảng 78% câu được nguồn xác nhận; phần còn lại là số không trích nguồn hoặc không có trong nguồn.

## Nguyên nhân thật của lỗi lập kế hoạch Advanced (tìm được nhờ nhật ký chẩn đoán)
Trong 9 lần gọi lập kế hoạch Advanced của lượt đo này, **3 lần hỏng**, vì lược đồ nghiêm hơn cách Sonnet trả kết quả:
- **q07, cả 2 lần thử:** `parts`, `steps`, `specialist_steps` trả về không phải mảng (câu trả lời 687 và 761 ký tự; kết thúc `tool-calls`). Lần gọi lại không cứu được vì lỗi lặp lại.
- **q08, lần đầu:** thiếu `image_query` ở mọi bước (lược đồ bắt buộc có, giá trị rỗng là null). Lần gọi lại đã cứu lượt này.

Đây chính là lỗi chủ sở hữu gặp ở UAT ("Không hoàn thành được nghiên cứu" khi Sonnet đã tính tiền). **Sửa:** `lenientSchema.ts` (`lenientArray`: đọc mảng viết dưới dạng chuỗi JSON, danh sách vắng là rỗng, riêng `steps` vẫn bắt buộc để lần gọi lại chạy), `image_query` và `completes_step` thành tùy chọn; áp cho lược đồ kế hoạch, kế hoạch gói, rà khoảng trống và đầu vào dự báo. Lược đồ gửi cho mô hình **không đổi** (vẫn "array"). Có 12 test mới (kể cả kiểm JSON schema). **Kiểm trên mô hình thật: q07 Advanced, câu từng hỏng 2 lần liền, nay chạy được (0,53 USD, 222 nguồn, 0 lỗi lập kế hoạch). Đây mới là một lượt (n = 1).**

## Chưa làm
- Chấm người cho 5 báo cáo (độ chính xác, chất lượng nguồn, giá trị quyết định): phiếu chấm kèm theo.
- Bổ sung dữ kiện cụ thể cho bộ câu chuẩn (chủ sở hữu).
- Mốc này **không chạy lại nhiều lần** nên chưa nói được phương sai; tỷ lệ lỗi dưới 2% cần khoảng 150 lượt.
