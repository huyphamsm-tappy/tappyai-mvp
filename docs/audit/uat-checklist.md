# UAT CHECKLIST — TappyAI V3 + Consultative V1 (bản audit, cập nhật 2026-09-19 — FINAL JOB)

Mọi thứ dưới đây chạy trên **môi trường audit** (project `zdaprdfgpbpnxyofagmc`), không đụng production.

**Mới FINAL JOB (chiều 2026-09-19, 4 fix release-blocker):** dòng kiểm **20–24** ở bảng dưới + câu **15–19** ở danh sách câu hỏi. (1.1) `**Lưu ý:**`/`**Bữa trưa:**` không còn bị cắt như tên quán; (1.2) tên quán có " - " không bị cắt đôi; (1.3) follow-up về một quán không bao giờ được trả lời bằng quán khác; (1.4) model TỰ chọn trong 10 hàng theo thứ tự nhà cung cấp — "sang chút / xịn hơn" không chọn guest house / nhà nghỉ / hostel.

**Mới ngày 2026-09-19 (job 8 mục):** lượt hỏi-rõ trước khi tìm (mục 1), **3 card + "Xem thêm N chỗ"** (mục 2), trang test ảnh card (mục 3), link TikTok (mục 4), `get_transport_options.mode` lạ ⇒ hỏi lại thay vì crash (mục 0.3). Các dòng kiểm mới: **15–19** ở bảng dưới và câu **11–14** ở danh sách câu hỏi. Dòng 11 và 13 của bảng đã viết lại theo cơ chế mới.

## 1. Khởi động

**Web + backend (cờ ON: G1/G2/G3 + `CONSULTATIVE_V1`)**
- Worktree backend: `.claude/worktrees/audit-nonprod` (đã checkout `merge/main-into-v3` @ commit cuối trong report — 2026-09-19 (FINAL JOB): `43d37d2`; nếu `git -C .claude/worktrees/audit-nonprod log -1` khác thì `git checkout --detach merge/main-into-v3` ở đó rồi khởi động lại server + `curl -X POST localhost:3101/api/chat -d '{}'` phải trả 400).
- Trong Claude Code (worktree `v3-phase4-design`): Preview → chọn cấu hình **`audit-flags-on`** (port 3101). Hoặc chạy tay:
  ```bash
  cd D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\audit-nonprod && set PLACE_GUARD_ATTRIBUTION_V2=1&& set SNIPPET_PRICE_GUARD_V2=1&& set MEDIA_PLACEMENT_V2=1&& set CONSULTATIVE_V1=1&& npm run dev -- --port 3101
  ```
- Mở `http://localhost:3101` → Chat. Đăng nhập bằng tài khoản audit (Pro, không giới hạn quota) hoặc dùng guest (5 câu trọn đời, có bước khai báo 18+).
- Kiểm tra nhanh backend sống: `curl http://localhost:3101/api/version` → `{"v":"dev"}`.

**Android (emulator)**
- Emulator `Pixel_8_uat` đang chạy CÓ CỬA SỔ (serial hiện tại `emulator-5554`; kiểm bằng `adb devices`); nếu không: `emulator -avd Pixel_8_uat -no-metrics`.
- APK debug build 2026-09-19 17:06 từ `43d37d2` (source Android không đổi từ `766d31a`), trỏ về `http://10.0.2.2:3101/` + Supabase audit, ĐÃ cài và mở được màn đăng nhập (guest identity đã `pm clear`): `android/app/build/outputs/apk/debug/app-debug.apk` (cài lại: `adb -s emulator-5554 install -r <apk>`).
- Mở app → màn đăng nhập có nút **"Dùng thử không đăng nhập (bản debug)"** (chỉ có ở bản debug) → tab **Chat**.
- Lần gửi đầu: app xin quyền vị trí → chọn "While using the app"; sau đó hộp **khai báo 18+** → bấm "Tôi đủ 18 tuổi" → app tự gửi lại.
- Guest chỉ có 5 câu (lượt hỏi-rõ và chào hỏi KHÔNG tính): hết thì `adb shell pm clear com.tappyai.app.debug` để có identity mới.
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
| 11 | **Hỏi rõ TRƯỚC khi tìm (mục 1)** | Câu KHÔNG có tín hiệu chọn ("ăn gì ngon giờ", "đi chơi ở đâu", "mua gì bây giờ", "mua quà cho mẹ") ⇒ lượt trả lời TỨC THÌ (không gọi model, không tốn quota) bắt đầu bằng **"Để chọn đúng chỗ, mình cần biết thêm:"** (mua sắm: "Để chọn đúng, mình cần biết:"), tối đa 3 ý, kèm **chip bấm được** (ngân sách/không khí/khu vực…). Bấm chip hoặc gõ trả lời ⇒ lượt sau TÌM NGAY và chọn; **không bao giờ hỏi lần 2** cho cùng câu. Câu ĐÃ có tín hiệu ("Sinh nhật sếp… phòng riêng… Quận 1", "Tối nay đi chơi gì với hội bạn 5 người ở Quận 1") ⇒ KHÔNG hỏi, tìm luôn. Trong prose model: tối đa 1 câu hỏi, ở cuối, chỉ khi đổi được lựa chọn. |
| 12 | **Chào hỏi** | "xin chào", "cảm ơn", "ok" ⇒ trả lời ngay (không gọi model), có chip gợi ý. **Không trừ quota** (kiểm với guest 5 câu: chào + hỏi giờ quán đã nêu + lượt hỏi-rõ không làm giảm số câu còn lại). |
| 13 | **Memory mở khoá câu mơ hồ** | Với tài khoản đã chat nhiều (memory đã có ngân sách/sở thích), "ăn gì ngon giờ" ⇒ bot **không hỏi rõ** mà TÌM và CHỌN ngay (log backend `tappyai_clarify_gate … unblocked_by: memory.budget.food`). Với tài khoản mới ⇒ hỏi rõ (dòng 11). |
| 14 | **Khách sạn** | "khach san da nang gan bien duoi 1tr/dem" ⇒ card khách sạn (Serper Maps) + prose chọn 1 khách sạn với ⭐/số đánh giá thật; nói rõ "chưa có giá" thay vì bịa; không hỏi ngày trước khi tìm. |
| 15 | **3 card + "Xem thêm" (mục 2)** | Carousel chỉ hiện **3 card** (quán được chọn + phương án thay thế lên trước, theo thứ tự nhắc trong prose). Có nút **"Xem thêm N chỗ"** (Android: "Show N more"/"Xem thêm") mở phần còn lại, "Thu gọn" gập lại. Nút **"Xem tất cả trên bản đồ"** mở Google Maps tìm theo câu hỏi + khu vực (không phải danh sách đúng N quán của mình — chấp nhận). Câu "quán số 4…" sau khi mở "Xem thêm" ⇒ vẫn trả lời đúng quán. |
| 16 | **Ảnh card (mục 3)** | Mở `docs/audit/photo-test-2026-09-19.html` (hoặc `http://localhost:3199/photo-test-2026-09-19.html` khi chạy cấu hình `audit-static-docs`) trong trình duyệt THẬT. Ghi lại: cột nào hiện ảnh, cột nào vỡ. Kỳ vọng: cột `referrerPolicy="no-referrer"` hiện đủ; cột mặc định có thể vỡ (lh3 `gps-cs-s` trả 429 khi có Referer). Trong chat web: card không có ảnh hoặc ảnh lỗi ⇒ dải ảnh **gập lại** (card thấp hơn), KHÔNG được là ô xám trống 128px. Android (Coil, không gửi Referer) ⇒ ảnh phải hiện; nếu lỗi thì hiện ô trống 160dp (đã biết, chưa sửa — ghi lại nếu gặp). |
| 17 | **Link TikTok (mục 4)** | Card có nút "Review trên TikTok" khi tìm được clip đúng tên quán (≈1/3 card); card không có ⇒ nút "Tìm review trên YouTube/TikTok" (không bao giờ thiếu nút review). Bấm nút TikTok ⇒ clip nói về ĐÚNG quán đó (tên quán nằm trong tiêu đề). |
| 18 | **Di chuyển (mục 0.3)** | "đi từ Quận 1 ra sân bay bằng xe khách/tàu…" — nếu model gọi `get_transport_options` với mode lạ (log `step: 'mode_unknown'`) ⇒ bot hỏi lại MỘT câu "xe khách/tàu giữa 2 tỉnh, hay taxi/xe công nghệ trong thành phố?" thay vì báo lỗi hay im lặng. `get_flight_prices` với >9 hành khách ⇒ bot nói rõ đã tính cho 9 người/lần đặt. |
| 20 | **Nhãn in đậm không bị cắt (1.1)** | Prose có dòng `**Lưu ý:** …` / `**Gợi ý:** …` / lịch trình `**Bữa trưa:** …` ⇒ đoạn đó PHẢI còn nguyên (trước đây bị gate cắt cả đoạn rồi thay bằng "Những lựa chọn mình xác minh được… ở thẻ bên dưới"). Đặc biệt câu hedge "Mình chưa xác nhận được phòng riêng…" đứng sau `**Lưu ý:**` phải còn. Đã biết chưa sửa: bold KẾT THÚC BẰNG "?" (`**Ưu tiên chính của bạn là gì?**`) vẫn bị coi là tên quán và cắt — ghi lại nếu gặp. |
| 21 | **Tên quán có dấu gạch (1.2)** | Quán tên dạng "Karaoke ICOOL - Trần Não…", "Quán Ăn Ngon – Phan Bội Châu" ⇒ tên in đậm phải NGUYÊN VẸN (không có `**Karaoke ICOOL và mở cửa…`, không có bold mở mà không đóng). Câu có claim bị cắt (ví dụ "có giao hàng") thì chỉ mất clause đó. |
| 22 | **Follow-up đúng quán (1.3)** | Sau khi bot chọn quán X, hỏi "chỗ đó có đặt trước được không?" / "quán này có giữ xe không?" ⇒ câu trả lời CHỈ nói về X (tìm lại theo tên X hoặc "mình không tìm thấy"). KHÔNG BAO GIỜ mở đầu bằng "Mình chọn **Y**" với Y khác X (log backend `consultative_v1_pick_backstop … skipped_referenced` khi hàng tìm lại không có X). |
| 23 | **Model tự chọn, không theo điểm (1.4)** | Câu có tình huống ("hội bạn 5 người tối nay", "bar chill nhạc sống") ⇒ quán được chọn phải HỢP tình huống (Bùi Viện cho nhóm tối, Acoustic Bar cho nhạc sống) và lý do nêu tiêu chí, không phải "điểm cao nhất". Card: 3 thẻ đầu = quán model nêu (không phải top rating). Log backend `step: shortlist` vẫn có (server-side) nhưng KHÔNG có `_tappy_shortlist` trong tool result model đọc. |
| 24 | **Ý "sang / xịn" (1.4 — lớp T8)** | `Resort Phú Quốc cho kỷ niệm 1 năm, sang chút` / `khách sạn Đà Nẵng xịn hơn chút` / `nhà hàng sang trọng cho tiệc công ty` / `chỗ nào đẹp hơn cho kỷ niệm` ⇒ KHÔNG chọn guest house / nhà nghỉ / hostel / homestay giá rẻ làm lựa chọn chính (log `shortlist_excluded_upscale` nếu có hàng bị loại); prose không khẳng định "sang trọng/cao cấp" khi không có bằng chứng (với quán ăn: có câu "chưa thấy bằng chứng về mức sang trọng"; với khách sạn: đã biết chưa có heads-up — ghi lại). |
| 19 | **Bằng chứng theo nhóm (mục 0.1)** | Điều kiện "máy lạnh" ⇒ KHÔNG bị liệt kê là "chưa thấy bằng chứng" (giả định có); "giao hàng" ⇒ dựa vào cờ trên dòng dữ liệu; các điều kiện khác (yên tĩnh, phòng riêng, đậu xe, trẻ em, thú cưng, mở khuya…) ⇒ có câu heads-up gộp **tối đa 2 ý** ("Mình chưa thấy bằng chứng về phòng riêng và đậu xe…"), không rải 3–4 câu "chưa rõ" rời rạc. |

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
11. `ăn gì ngon giờ` (tài khoản MỚI/guest) ⇒ lượt hỏi-rõ tức thì + chip → bấm chip `tầm 100–200k` (hoặc gõ `tầm 150k, gần đây`) ⇒ tìm ngay, 3 card, không hỏi lại. Lặp với `đi chơi ở đâu`, `mua gì bây giờ`.
12. `quà sinh nhật cho bạn gái tầm 1tr` ⇒ hỏi rõ (loại quà/sở thích) → trả lời `nước hoa` ⇒ thẻ sản phẩm nước hoa (không phải quán ăn), không hỏi thêm "hương gì".
13. `Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1` ⇒ KHÔNG hỏi; 3 card + "Xem thêm N chỗ"; heads-up gộp về phòng riêng (đã biết: model đôi khi vẫn viết "có không gian riêng" rồi heads-up mâu thuẫn — ghi lại nếu gặp).
14. `Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu` ⇒ planner; đã biết: model đôi khi KHÔNG phát `[TAPPY_PLAN]` mà chỉ viết vài bullet + hỏi "tập trung vào hoạt động nào?" (hôm nay ≈4/15 có plan) — ghi lại tỉ lệ gặp.
15. `Resort Phú Quốc cho kỷ niệm 1 năm, sang chút` ⇒ resort/khách sạn (Ocean Bay / The Poplar…), KHÔNG "Rio Guest House"; rồi `khách sạn Đà Nẵng xịn hơn chút` và `chỗ nào đẹp hơn cho kỷ niệm ở Quận 1` (dòng 24).
16. `Spa massage chân gần Quận 1 dưới 300k` → `chỗ đó có đặt trước được không?` ⇒ trả lời về ĐÚNG spa vừa chọn (dòng 22).
17. `Karaoke cho 10 người tầm 100k/người Gò Vấp` ⇒ tên "Karaoke ICOOL - Trần Não…" nếu xuất hiện phải nguyên vẹn (dòng 21).
18. Câu rộng phải hỏi rõ ĐÚNG MỘT LẦN: `ăn gì ngon giờ` · `đi chơi ở đâu` · `mua gì bây giờ` · `massage` · `gội đầu dưỡng sinh gần đây` · `cuối tuần làm gì` ⇒ mỗi câu 1 lượt hỏi-rõ ($0, chip), bấm chip ⇒ tìm ngay, không hỏi lần 2 (dòng 11).
19. Hội thoại với MEMORY LỚN (tài khoản audit sau `node scripts/audit/seedmem.mjs`): `ăn gì ngon giờ` ⇒ tìm ngay (không hỏi rõ, log `unblocked_by`); `massage` ⇒ tìm ngay; `Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1` ⇒ có pick + hedge phòng riêng (đã biết: 1/3 lần hôm nay model không nêu pick — ghi lại); `cuối tuần làm gì` ⇒ vẫn hỏi rõ (memory không thay được đối tượng). Xoá lại bằng `clearmem2.mjs` sau khi test.

## 4. Ghi nhận lỗi
Ghi: câu hỏi → nền tảng (web/Android) → điều thấy → điều mong đợi → ảnh chụp. Log backend có các dòng
`tappyai_consultative_v1`, `tappyai_guard`, `tappyai_tool_called`, `tappyai_canned_reply` để đối chiếu.
