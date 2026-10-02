# Nợ cũ — kết quả (01/10/2026, đêm)

Người đo: phiên web. Bằng chứng nằm ở thư mục tạm của phiên (không commit ảnh/bản ghi vào git, theo quy tắc 28/09).

## (a) Hồi quy: 3fce8b7 so với 821b70c, giọng Luna TẮT — ĐẠT (không có lệch ngoài ý muốn)
- Bộ chạy: `scenarios` + `realTyping` = **30 hội thoại, 135 lượt** (anh nhắc 35 hội thoại / 125 lượt; bộ hiện có trong repo là 30/135 — con số 35/125 là của một trang duyệt cũ, lệch vì cách đếm, không thiếu lượt). Model Luna (none), dữ liệu tìm kiếm phát lại từ bản ghi (Serper replay). Mỗi bản chạy **4 lần** để đo nhiễu.
- Nhiễu của model: hai lần chạy CÙNG một mã khác nhau về cấu trúc ở **64–69 / 135 lượt**; cũ so với mới khác ở **71–76 / 135** ⇒ chênh lệch cũ↔mới nằm trong mức nhiễu.
- Ngoài nhiễu (cũ lần 1 = cũ lần 2 nhưng mới khác), lặp lại ≥ 2/3 phép so sánh: **6 lượt**, trong đó 2 lượt khác phần code dựng:
  - `TRAVEL-1#7`: tin kế hoạch chi tiết có khối kế hoạch (TAPPY_PLAN) ở bản mới, bản cũ không — do model chọn có/không viết kế hoạch ở lượt đó; sửa A3/A7 (thẻ kế hoạch không còn bị chặn bởi bản quảng cáo) làm khối này xuất hiện ổn định hơn. Chủ ý.
  - `TRAVEL-2#1`: thẻ hỏi mở đầu chuyến đi thêm câu «Bạn thích kiểu điểm đến nào?» (Biển/Núi/Thành phố/Nước ngoài) khi chưa có điểm đến — đúng hướng sửa A1/A2 (câu mở như «Mùa này đi du lịch ở đâu» phải hỏi điểm đến trước). Chủ ý.
  - Còn lại 4 lượt khác do lựa chọn của model (tên chọn, số phương án phụ).
- Chi phí (135 lượt): cũ $0,436–0,465; mới $0,452–0,482 — chênh trong nhiễu.
- Trang Luna chỉ các lượt đổi: https://claude.ai/artifact/BQbCXNNMjiy4UriW5zuERd
- Kết luận: không thấy thay đổi ngoài ý muốn trong phần code dựng khi cờ giọng TẮT.

## (b) 4 rạp phim vào registry link — ĐẠT (chờ cổng kiểm xanh)
- Galaxy, Lotte, BHD, Beta vào registry CCP như nhà cung cấp «chuyển tiếp» (handoff-only, không adapter riêng, không giá/suất chiếu/tình trạng vé). Trang phim đang chiếu mở được không cần đăng nhập ngày 01/10: Galaxy, Lotte, Beta HTTP 200; BHD trả 403 cho trình tải trần nhưng mở được trong trình duyệt thật (có danh sách phim).
- Câu hỏi phim giờ trả 5 link (CGV + 4 rạp). **Không thêm bước tìm kiếm** (không thêm `discovery`): chi phí Serper không đổi.
- Quy định danh sách nhà cung cấp «đóng băng 17» được cập nhật thành 21 theo quyết định của Huy 01/10 (test `providerCompletion`). Cần migration hạt giống `20261001c_commerce_providers_cinemas.sql` (4 dòng, idempotent) — vào MIGRATION_ORDER và PHẦN B.
- SHA: bf2c7c6 trên rc/web-uat.

## (c) Chi phí tìm kiếm — 4 ca, cũ 3fce8b7 so với mới (hai lượt mỗi ca: hỏi → trả lời thẻ hỏi), Luna none
| Ca | Lượt | Serper cũ → mới | Token vào cũ → mới | Token ra cũ → mới | USD cũ → mới |
|---|---|---|---|---|---|
| Du lịch mở («Mùa này đi du lịch ở đâu» → «Biển · Cuối tuần 2N1Đ · TP.HCM») | 1 / 2 | 0→0 / 10→10 | 1434→1434 / 6349→6363 | 274→213 / 351→354 | 0,00015→0,00012 / 0,01480→0,01480 |
| Phim («Phim nào đang chiếu hay» → «Tìm rạp gần mình») | 1 / 2 | 0→0 / 2→2 | 1433→1433 / 6155→6119 | 181→159 / 230→237 | 0,00011→0,00009 / 0,00472→0,00472 |
| Karaoke quận 3 | 1 / 2 | 0→0 / 2→3 | 1431→1431 / 7239→7220 | 228→236 / 351→300 | 0,00013→0,00013 / 0,00492→0,00788 |
| Kính cường lực iPhone 15 | 1 / 2 | 0→0 / 9→8 | 1436→1436 / 9494→9523 | 211→195 / 249→266 | 0,00012→0,00011 / 0,01015→0,00916 |
- Lượt 1 của «phim» ở bản mới là câu trả lời có sẵn (không hỏi thẻ, 0 tìm kiếm). Chênh ±1 Serper ở karaoke và kính cường lực nằm trong nhiễu (model tự chọn số lần tìm). Số liệu = số lần gọi mà bộ đếm của route ghi (phát lại tính như gọi thật, $0,001/lần); tìm thật chỉ khi bản ghi thiếu.
- Kết luận: chi phí tìm kiếm và token **không đổi đáng kể** giữa hai bản.

## (e) Hai ca không có link ở tin cuối (UAT 821b70c, tài khoản thử manual.uat.pro, Playwright)
- **snacks-then-q1** («mua đồ ăn vặt» → «tối nay đi đâu chơi quận 1»): **ĐẠT** — tin cuối có 4 thẻ địa điểm có «Xem bản đồ» (maps.google.com). Không tái hiện được. Lần Android báo thiếu là do cửa sổ giới thiệu lần đầu phủ lên (đã ghi ở R25), không phải server.
- **mua-he** («Mùa này đi du lịch ở đâu» → thẻ hỏi → chọn Biển / Cuối tuần 2N1Đ / TP.HCM): server trả đúng (UAT gọi trực tiếp: 200, 4–12 s). Tin cuối chọn Vũng Tàu + khách sạn Melissa với đánh giá, ảnh, **không có thẻ khách sạn và không có link**. Gốc: đúng quyết định đã ghim 30/09 — **link khách sạn chỉ phát khi có ngày nhận phòng** (test `flightPickLink` ghim), và lượt «chọn» của luồng du lịch chỉ ra chữ + ảnh cho khách sạn, không dựng thẻ (`rows 0`). Không phải lỗi code. Cách sửa cần Huy quyết: (1) thêm nút «Xem trên Google Maps» cho khách sạn được chọn (không cần ngày); hoặc (2) hỏi ngày trong thẻ hỏi rồi phát link Booking/Trip có ngày. Chưa làm vì đụng quyết định 30/09.
- Quan sát phụ: ở lần chạy đầu của mua-he, giao diện hiện «Mình gặp trục trặc khi trả lời» dù server trả 200; chạy lại 2 lần (cả gọi API trực tiếp) đều bình thường — chưa tái hiện, ghi lại để theo dõi.
- Ảnh: `scratchpad/ev/e-mua-he-snacks`, `e-mua-he-2` (không commit).

## (d) .gitignore + kiểm tra tệp tạm — đã xong ở 821b70c (`scripts/repoHygiene.test.ts`).

- Gate: bf2c7c6 (4 rạp) làm Regression Gate đỏ vì `scripts/release/apply-migration.sh` chưa liệt kê migration `20261001c` (test applyMigrationPolicy); đã thêm vào nhóm APPLY.
