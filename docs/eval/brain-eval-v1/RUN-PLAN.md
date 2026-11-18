# Giai đoạn 0 — Bảng lượt chạy và chi phí dự kiến (CHƯA CHẠY, CHƯA GỌI API)

Bản dựng đo nền: `b0fe4bf` (tag `brain-freeze-20261117`), dựng trong thư mục nháp bằng `git archive`, không đụng cây `wt-integration`. Mọi con số tiền dưới đây là ƯỚC TÍNH, chưa kiểm chứng; số đã chi thật được ghi lại sau mỗi nhóm.

## Ràng buộc đã nhận từ anh (giữ nguyên)
- Chỉ ghi dữ liệu eval (token, chi phí, thời gian, điểm chấm, mã lượt) vào **tệp cục bộ**: `D:\TappyAI-review-artifacts\eval-runs\<mã lượt>\`. Không ghi bảng DB nào, không áp migration (bảng `ai_usage_events` chưa áp và không được coi là có).
- Không ghi Production. Không sửa hay xóa dữ liệu UAT hiện có (chỉ tạo cuộc chat mới).
- Không đọc nội dung `.env*`: các bộ chạy chỉ nạp khóa vào bộ nhớ tiến trình qua `process.loadEnvFile` như ứng dụng và các bộ chạy trước đây, không in, không chép. Nếu anh không đồng ý cả cách này thì báo, em dừng trước khi chạy.
- Không sửa mã não ở Giai đoạn 0.

## Bộ eval đã khóa
| Tệp | Nội dung | Hash sha256 |
|---|---|---|
| `dev-30.json` | 30 câu phát triển D01–D30 (tin 4, dữ liệu realtime 3, tư vấn 7, mua sắm 4, địa điểm 5, kế hoạch 7), mỗi câu có must_have và hard_fail | `1c655946…2b5` |
| `rubric.json` | rubric chung: 5 trục 1–5, cờ `answered/hard_fail/leak/unsourced_fact_count`, luật đạt, người chấm Opus 5.5 chấm mù | `67d103bc…d8` |
| `holdout-10.json` (ngoài repo) | 10 câu giữ kín H01–H10 | `ee9bca6c…b9` |

## Bảng lượt chạy chính xác

Chế độ chat: `auto` (đúng mặc định của giao diện web; các lần đo API trước đây ngầm dùng `chat` nên không dùng lại làm mốc). Đường chạy: máy chủ cục bộ có bộ cờ đủ, gói tắt (khách có công cụ), khách mới mỗi 5 tin (máy chủ khởi động lại giữa các lô).

| Nhóm | Nội dung | Số lượt chạy | Lô / khởi động máy chủ | Số lượt chấm | Chi phí dự kiến (USD) |
|---|---|---:|---:|---:|---|
| G1 | Luna (Tappy hiện tại), 30 câu phát triển x 3 lần | 90 | 18 | 90 | chạy 2,3–3,2 |
| G2 | Luna, 10 câu holdout x 1 lần (mốc; chạy lại ở Giai đoạn 3) | 10 | 2 | 10 | chạy 0,25–0,35 |
| G3 | Nghiên cứu sâu: 2 Standard + 1 Advanced (UI, tài khoản Promax) | 3 | 0 | 3 (người đọc báo cáo) | 0,6–1,2 |
| G4 | Cánh B: Sonnet 5.5 + web_search gốc của Anthropic, không lớp Tappy, 12 câu phát triển x 1 | 12 | 0 | 12 | chạy 1,4–3,0 |
| G5 | Cánh C (CÓ ĐIỀU KIỆN): Sonnet 5.5 làm model trong vòng One Brain, 12 câu x 1 | 12 nếu khả thi | 3 | 12 | 0 nếu không khả thi; 1,8–4,2 nếu khả thi |
| G5-thử | Thử khả thi cánh C: 1 lượt | 1 | 1 | 0 | ≤ 0,35 |
| G6 | Thăm dò bảo mật: 8 lượt có chèn lệnh, ép lặp công cụ, link ngoài, quota khách (kiểm bằng mã, không chấm) | 8 | 2 | 0 | 0,2–0,35 |
| Chấm | Opus 5.5 chấm mù: 90 + 10 + 12 + 12 = 124 lượt chấm, thêm 12 lượt chấm lần hai (10%) = 136 lần gọi | 0 | 0 | 136 | 0,025–0,05 mỗi lần = 3,4–6,8 |

Cánh B cần một lần gọi API Anthropic cho mỗi câu cùng tối đa 3 lượt `web_search` (10 USD mỗi nghìn lượt, đã nằm trong khoảng dự kiến). Cánh C chỉ chạy nếu thử khả thi đạt bằng cấu hình môi trường, không cần sửa mã; nếu cần sửa mã thì bỏ cánh C và báo anh.

### Tổng và cách giữ dưới trần 12 USD
- Tổng dự kiến: **thấp 7,7 USD** (không cánh C, giá thấp), **cao 18,8 USD** (có cánh C, giá cao). Vượt trần 12 USD ở kịch bản cao, nên có thứ tự ưu tiên và quy tắc dừng:
  1. G1 + G2, rồi chấm G1 + G2 (≈ 5,1–8,6 USD).
  2. G6 (bảo mật), rồi G3 (nghiên cứu sâu).
  3. G4 (cánh B), rồi chấm.
  4. G5 (cánh C) chỉ khi còn dư trần.
- Trước mỗi nhóm em tính lại số đã chi thật (đọc từ log và hóa đơn từng lượt) và số còn lại; nếu nhóm kế tiếp dự kiến vượt trần thì giảm số câu của cánh B hoặc C (còn 6 câu) hoặc bỏ, và báo anh. Không vượt 12 USD.

## Quy tắc đo
- Mỗi lượt ghi: có câu trả lời không, giây đến chữ đầu, giây tổng, số bước, số lần gọi model, số công cụ và độ song song, token vào và ra, đọc cache, USD model, USD Serper và Parallel, mã lượt chạy, mã câu, lần chạy (r1, r2, r3).
- Mỗi lượt chạy tuần tự, không bao giờ hai lượt cùng lúc trên một máy chủ.
- Kết quả thô lưu cục bộ; chấm điểm lưu cục bộ riêng và khóa sau khi chấm.
- Tên model và tên hệ thống được tách khỏi bản trả lời trước khi gửi người chấm; thứ tự xáo ngẫu nhiên, hạt giống ghi vào báo cáo.

## Việc làm trong Giai đoạn 0 trước khi tốn tiền (không gọi API trả phí)
1. Viết bộ chạy eval và bộ chấm (tệp nháp ngoài repo, không sửa mã não).
2. Dựng cây nháp bản `b0fe4bf`.
3. Chạy thử bộ chạy bằng một lượt giả không gọi API (kiểm lược đồ, ghi tệp, che tên model).
