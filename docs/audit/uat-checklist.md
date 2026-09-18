# UAT CHECKLIST — TappyAI V3 + Consultative V1 (bản audit, 2026-09-18)

Mọi thứ dưới đây chạy trên **môi trường audit** (project `zdaprdfgpbpnxyofagmc`), không đụng production.

## 1. Khởi động

**Web + backend (cờ ON: G1/G2/G3 + `CONSULTATIVE_V1`)**
- Worktree backend: `.claude/worktrees/audit-nonprod` (đã checkout `merge/main-into-v3` @ commit cuối trong report).
- Trong Claude Code (worktree `v3-phase4-design`): Preview → chọn cấu hình **`audit-flags-on`** (port 3101). Hoặc chạy tay:
  ```bash
  cd D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\audit-nonprod && set PLACE_GUARD_ATTRIBUTION_V2=1&& set SNIPPET_PRICE_GUARD_V2=1&& set MEDIA_PLACEMENT_V2=1&& set CONSULTATIVE_V1=1&& npm run dev -- --port 3101
  ```
- Mở `http://localhost:3101` → Chat. Đăng nhập bằng tài khoản audit (Pro, không giới hạn quota) hoặc dùng guest (5 câu trọn đời, có bước khai báo 18+).
- Kiểm tra nhanh backend sống: `curl http://localhost:3101/api/version` → `{"v":"dev"}`.

**Android (emulator)**
- Emulator `Pixel_8_uat` (`emulator-5558`) đang chạy; nếu không: `emulator -avd Pixel_8_uat -no-window -no-metrics` (hoặc có cửa sổ để xem).
- APK debug đã build trỏ về `http://10.0.2.2:3101/` và đã cài: `android/app/build/outputs/apk/debug/app-debug.apk` (cài lại: `adb -s emulator-5558 install -r <apk>`).
- Mở app → màn đăng nhập có nút **"Dùng thử không đăng nhập (bản debug)"** (chỉ có ở bản debug) → tab **Chat**.
- Lần gửi đầu: app xin quyền vị trí → chọn "While using the app"; sau đó hộp **khai báo 18+** → bấm "Tôi đủ 18 tuổi" → app tự gửi lại.
- Guest chỉ có 5 câu: hết thì `adb shell pm clear com.tappyai.app.debug` để có identity mới.
- Gõ tiếng Việt: emulator gõ không dấu cũng được (backend hiểu không dấu = tiếng Việt).

## 2. Kiểm tra theo từng vertical (Food · Mua sắm · Du lịch · Spa · Giải trí)

Với MỖI câu hỏi, đối chiếu **card** (thẻ) với **prose** (đoạn tư vấn phía trên):

| # | Kiểm tra | Đạt khi |
|---|---|---|
| 1 | **Layout** | Prose ngắn ở TRÊN, dưới là filter chips, dưới nữa là **carousel ngang** các card (vuốt ngang; Android có chấm trang). Không có ảnh/link chèn trong prose. |
| 2 | **Card** | Mỗi card có: ảnh, tên, ⭐ + số đánh giá, dòng Tappy rating (nếu có), khoảng cách (khi tìm quanh vị trí), mức giá (`100-200 N ₫`…), giờ mở/đang mở, link review, nút hành động: **đặt món/đặt chỗ trước, rồi Maps**. |
| 3 | **Chọn rõ + lý do** | Câu đầu của prose nêu MỘT quán được chọn, in đậm, kèm lý do là số liệu thật (điểm, số đánh giá, khoảng cách, giá, giờ). Tên đó phải có trong carousel. |
| 4 | **Phương án thay thế + đánh đổi** | Tối đa MỘT quán thay thế, kèm đánh đổi thật ("gần hơn nhưng ít đánh giá", "rẻ hơn nhưng đóng sớm"). Không liệt kê 3–4 quán. |
| 5 | **Giá / giờ đúng** | Số trong prose = số trên card (giờ mở, ⭐, số đánh giá, mức giá). Nếu card không có giá mà prose nói "trong tầm giá" ⇒ LỖI (backend phải tự thêm "Kết quả chưa có mức giá…"). |
| 6 | **Bằng chứng thiếu** | Hỏi có điều kiện (yên tĩnh, đậu xe, trẻ em, mở khuya…) mà card không chứng minh được ⇒ prose phải có câu "Mình chưa thấy bằng chứng về X … nên gọi hỏi trước". Không được khẳng định suông. |
| 7 | **CTA hoạt động** | Bấm nút đặt món/đặt chỗ → mở đúng trang (GrabFood/Booking…); bấm Maps → đúng quán. Nhãn nút hợp lý (lưu ý: nhãn do model viết đôi khi lệch — ghi lại nếu gặp). |
| 8 | **Follow-up** | Hỏi tiếp "quán này mở mấy giờ?", "quán số 2 có đông không?", "chỗ đó có giữ xe không?" → trả lời đúng quán đang nói; nếu thiếu dữ liệu thì nói "mình không tìm thấy" (có thể tự tìm lại theo tên — thấy dòng `search_places` với tên quán trong log backend), KHÔNG được nói "mình đã kiểm tra" khi không tìm. Giờ/SĐT/địa chỉ đã nêu ở lượt trước ⇒ trả lời tức thì (không gọi model). |
| 9 | **Ngôn ngữ** | Gõ không dấu ("tim quan bun bo ngon o q1") ⇒ trả lời tiếng Việt có dấu. Gõ tiếng Anh ⇒ trả lời tiếng Anh. |
| 10 | **Không mảnh vụn** | Không có câu cụt, dòng "1.2.3.", emoji lẻ, ngoặc thừa, link trơ trọi trong prose. |
| 11 | **Câu hỏi** | Tối đa 1 câu hỏi/lượt, chỉ khi thiếu ĐỐI TƯỢNG (mua gì/ăn gì/đi đâu). Có ai đi/khi nào/ngân sách thì bot tự giả sử và nói rõ "mình giả sử…", không hỏi lại. |
| 12 | **Chào hỏi** | "xin chào", "cảm ơn", "ok" ⇒ trả lời ngay (không gọi model), có chip gợi ý. **Không trừ quota** (kiểm với guest 5 câu: chào + hỏi giờ quán đã nêu không làm giảm số câu còn lại). |
| 13 | **Memory không hỏi lại** | Với tài khoản đã chat nhiều (memory đã có sở thích), câu mơ hồ "ăn gì ngon giờ" / "đi chơi ở đâu" ⇒ bot TÌM và CHỌN ngay, không hỏi "bạn muốn ăn gì/loại nào". |
| 14 | **Khách sạn** | "khach san da nang gan bien duoi 1tr/dem" ⇒ card khách sạn (Serper Maps) + prose chọn 1 khách sạn với ⭐/số đánh giá thật; nói rõ "chưa có giá" thay vì bịa; không hỏi ngày trước khi tìm. |

Riêng **Mua sắm**: quyết định nằm trong thẻ "NÊN CHỌN" (giá, ⭐, số review, đánh đổi); prose có thể ngắn — kiểm tra thẻ đúng sản phẩm, nút "Xem" mở đúng sàn, "Theo dõi giá" hoạt động. Riêng **Du lịch/khách sạn**: trên audit env `get_hotel_prices` đang trả 0 dòng (đang chờ kiểm key) — nếu bot nói "chưa có kết quả" là đúng hành vi, nếu bịa tên khách sạn là LỖI.

## 3. 10 câu hỏi gợi ý (chạy lần lượt web + Android)

1. `Tìm quán ăn tối ngon gần Quận 1 cho 2 người` → rồi hỏi tiếp `quán này mở mấy giờ?` (trả lời tức thì nếu giờ đã nêu).
2. `tim quan bun bo ngon o q1 duoi 80k` (không dấu + ngân sách; card không giá ⇒ có câu "chưa có mức giá").
3. `Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?` (có câu "chưa thấy bằng chứng về yên tĩnh").
4. `Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận` → `quán số 2 có đông không?` (tìm lại theo tên hoặc "không tìm thấy").
5. `Mua tai nghe bluetooth dưới 1 triệu, pin trâu` (thẻ NÊN CHỌN + đánh đổi).
6. `Spa massage chân gần Quận 1 dưới 300k` → `chỗ đó có đặt trước được không?`.
7. `Tối nay đi chơi gì với hội bạn 5 người ở Quận 1` (phải có card, không ảnh inline).
8. `Karaoke cho 10 người tầm 100k/người Gò Vấp` (mức giá có trên card).
9. `Chỗ chơi cho trẻ em 5 tuổi cuối tuần ở Sài Gòn` (không được nói "chưa thấy bằng chứng trẻ em" với khu vui chơi trẻ em).
10. `xin chào` rồi `cảm ơn` (trả lời tức thì, có chip).

## 4. Ghi nhận lỗi
Ghi: câu hỏi → nền tảng (web/Android) → điều thấy → điều mong đợi → ảnh chụp. Log backend có các dòng
`tappyai_consultative_v1`, `tappyai_guard`, `tappyai_tool_called`, `tappyai_canned_reply` để đối chiếu.
