# Anh test máy thật — MỘT vòng, 15 mục (bản CUỐI, 01/10 tối)

Máy R58RC0V30BH · APK UAT `TappyAI-UAT-684431f.apk` (app «TappyAI UAT», nói chuyện với uat.tappyai.com). Dùng tài khoản test.
Mỗi mục: làm → **đạt = thấy gì** → ghi Đạt / Không đạt (+1 dòng nếu không đạt).
Bản Play (www.tappyai.com — production) KHÔNG nằm trong vòng này.

**1. Zalo** — Tôi → «Đăng nhập để lưu lại» → «Tiếp tục với Zalo». Chrome hiện trang đăng nhập Vercel của UAT trước: đăng nhập Vercel rồi Zalo.
Đạt = app tự mở lại, tab Tôi hiện tên/email. ☐ Đạt ☐ Không đạt: ______

**2. Google** — «Tiếp tục với Google». Đạt = hiện bảng chọn tài khoản Google của hệ thống (không mở trình duyệt), chọn xong vào được app.
⚠️ **Chưa thử với bản cài từ Play. Trên APK UAT rất có thể báo «không có thông tin đăng nhập» — đó là THIẾU KHAI BÁO SHA/package, KHÔNG phải lỗi app.** Cụ thể: APK UAT mang id `com.tappyai.app.staging`, ký bằng khoá debug SHA-1 `B1:90:A7:B0:F0:30:29:F7:AD:0E:7A:4C:F2:AE:FB:27:3F:02:54:2F`; Google Cloud (dự án `aerobic-lock-498409-u7`) chỉ có client Android cho `com.tappyai.app` (khoá tải lên + khoá ký CŨ `12:BD:98:F6…`) và `com.tappyai.app.debug` — **không có `.staging`**. Với bản Play thật: khoá ký HIỆN TẠI (SHA-1 `C2:0A:A1:27:E8:4C:2A:17:35:82:67:77:DA:A1:08:65:EF:2B:A9:1D`) cũng CHƯA có trong client nào. Chi tiết: `PLAY-CONSOLE-PASTE.md` mục A01.
**Nếu Google Cloud báo «Requested entity already exists» khi anh tạo client Android:** cặp package + SHA-1 đã được đăng ký ở MỘT DỰ ÁN KHÁC (nhiều khả năng `sixth-impulse-499009-a2`, có thể thuộc tài khoản Google khác của anh; đây là giả thuyết chưa kiểm). Cách tìm: đăng nhập từng tài khoản Google của anh → console.cloud.google.com → chọn dự án đó → ☰ → APIs & Services → Credentials → tìm OAuth client loại Android có package `com.tappyai.app`. Cách xử lý (xoá client đó rồi tạo mới ở `aerobic-lock-498409-u7`, cùng dự án với web client ID của app) — **đủ các bước bấm ở `PLAY-CONSOLE-PASTE.md` mục G**. Cần đăng nhập và bấm; em không làm.
☐ Đạt ☐ Lỗi «không có thông tin đăng nhập» (đúng như trên) ☐ Lỗi khác: ______

**3. Email** — nhập email + mật khẩu tài khoản test → Đăng nhập; thử mật khẩu sai một lần.
Đạt = đúng thì vào app; sai thì chỉ báo «Email hoặc mật khẩu không đúng.» ☐ Đạt ☐ Không đạt: ______

**4. Link đăng nhập giả** — gửi cho mình rồi bấm: `tappyai://auth-callback#access_token=x&refresh_token=y`
Đạt = app báo «Liên kết đăng nhập không hợp lệ hoặc đã hết hạn», vẫn giữ tài khoản cũ. ☐ Đạt ☐ Không đạt: ______

**5. Thẻ hỏi nhanh — 5 mảng** — Chat, mỗi câu một cuộc chat mới: «quán phở ngon quận 1» · «tai nghe bluetooth dưới 1 triệu» · «tối nay có chỗ nào đi chơi ở sài gòn ko» · «vé máy bay đi Đà Nẵng» · «massage thư giãn ở quận 1».
Đạt = tiêu đề thẻ lần lượt «Hôm nay ăn gì nhỉ?» · «Bạn đang tìm món gì?» · «Tìm gì cho bạn hôm nay?» · «Chuyến đi thế nào đây?» (có câu «Bay từ đâu?») · «Thư giãn kiểu nào hôm nay?». Chọn ô → «Tìm cho tôi» → Tappy trả lời; không thấy `**`, `[…]`. ☐ Đạt ☐ Không đạt: ______

**6. Câu hỏi mới** — «Muốn mua kính cường lực cho iphone» → «iPhone 17 · Cường lực mà»; «có phim gì hay»; «Mùa này đi du lịch ở đâu».
Đạt = kính cường lực ra đúng phụ kiện (không hỏi lại «iPhone nào để mua»); phim có link CGV; câu mùa du lịch trả lời gợi ý chỗ đi. ☐ Đạt ☐ Không đạt: ______

**7. Nút đặt/mua + link** — tai nghe: «Tìm trên Lazada/Shopee»; ăn uống: «Xem bản đồ»; «Mình chọn: …» bấm tên; vé máy bay «bay từ HCM»: bấm «Xem giá trên Traveloka/Trip.com».
Đạt = mở đúng sàn (qua tappyai.com/go/at) / Google Maps / trang vé có ngày. ☐ Đạt ☐ Không đạt: ______

**8. Kế hoạch + chia sẻ** — «đi Đà Lạt 3 ngày 2 đêm, 2 người, 10 triệu» → «Lên kế hoạch chi tiết» → thẻ TAPPY PLAN → «Chia sẻ» → Zalo, Facebook.
Đạt = thẻ hiện (mục chưa có giá: «chưa có giá — hỏi quán»; ảnh là ảnh giữ chỗ); bên nhận mở được link `/plan/…`. ☐ Đạt ☐ Không đạt: ______

**9. Chia sẻ Khám phá** — Khám phá → một bài/clip → «Chia sẻ» → TikTok; rồi Zalo.
Đạt = TikTok nhận file (thẻ ảnh hoặc video); Zalo nhận link bài. ☐ Đạt ☐ Không đạt: ______

**10. Camera / video** — đã đăng nhập, qua bước ngày sinh 18+ → Khám phá → «+» đầu trang (ô vuông bên trái ô tìm kiếm) → «Chia sẻ trải nghiệm…» → thêm 1 ảnh, rồi 1 clip ngắn → Đăng.
Đạt = bài hiện ở Hồ sơ và Khám phá; xem được ảnh và video. ☐ Đạt ☐ Không đạt: ______

**11. Vị trí + bàn phím** — Chat → cho phép vị trí → «cà phê gần đây»; rồi gõ «phở bò» bằng Telex.
Đạt = kết quả gần chỗ anh đứng; chữ Việt không mất dấu. ☐ Đạt ☐ Không đạt: ______

**12. Nút Back** — Back hệ thống ở: một quán trong Khám phá, Cài đặt, thẻ đăng nhập, sau khi chia sẻ.
Đạt = luôn về đúng màn trước; không thoát app giữa chừng. ☐ Đạt ☐ Không đạt: ______

**13. Thông báo BẬT/TẮT** — đăng nhập → cho phép thông báo → Tôi → Cài đặt → «Thông báo» → tắt công tắc «Thông báo đẩy». Nhờ Claude gửi 1 thông báo thử.
Đạt = công tắc TẮT; **máy KHÔNG nhận thông báo nữa** (server đã ngừng gửi cho máy này). Tắt khi mất mạng → công tắc vẫn BẬT kèm dòng «Chưa tắt được thông báo…». Bật lại → nhận lại thông báo. ☐ Đạt ☐ Không đạt: ______

**14. Xoá tài khoản (theo hợp đồng web: xoá NGAY; Huy chốt cờ BẬT khi release)** — Tôi → Cài đặt → cuộn xuống mục «KHÁC» → hàng CUỐI mục (sau «Chính sách bản quyền»), cùng kiểu mọi hàng khác, ô xám (không đỏ), nằm xa «Đăng xuất» (Đăng xuất ở khung riêng bên dưới): «Xóa tài khoản» (cờ BẬT — UAT hiện đang BẬT) hoặc «Yêu cầu xóa tài khoản» (cờ TẮT).
Cờ TẮT (UAT): bấm → hộp «Yêu cầu xóa tài khoản?» → «Tiếp tục» mở app email soạn sẵn tới support@tappyai.com; không xoá, không đăng xuất. **Không gửi thư thật.**
Cờ BẬT (khi release): hàng đổi tên «Xóa tài khoản» → hộp «Xóa tài khoản vĩnh viễn? Toàn bộ dữ liệu của bạn sẽ bị xóa ngay…» (có đoạn gói trả phí nếu tài khoản có gói) → gõ XÓA → «Xóa vĩnh viễn tài khoản». **Không làm trên tài khoản thật.** Trên UAT chưa bật được cờ nên chưa kiểm luồng xoá thật trên máy. ☐ Đạt ☐ Không đạt: ______

**15. Báo cáo bài đăng + quy tắc cộng đồng (mới, 01/10 tối)** — Khám phá (hoặc hồ sơ người khác → mở một bài; ở màn «Chi tiết» cuộn xuống để thấy nút «…») → «…» → «Báo cáo» → chọn lý do (Spam · Quấy rối hoặc bắt nạt · Nội dung nhạy cảm · Lừa đảo · Vi phạm bản quyền · Khác) → «Gửi báo cáo».
Đạt = hiện «Đã gửi báo cáo. Cảm ơn bạn.», hộp đóng, bài vừa báo biến khỏi bảng tin/lưới của anh (kể cả sau khi mở lại app). Tắt mạng rồi gửi: hiện «Chưa gửi được báo cáo…», KHÔNG báo đã gửi, bài vẫn còn. Trong hộp có địa chỉ support@tappyai.com. Đăng bài đầu tiên (Khám phá → «+» → viết → «Đăng»): hiện «Quy tắc cộng đồng» có link «Đọc Điều khoản sử dụng»; «Đồng ý và đăng» mới đăng; lần sau không hỏi lại. **Không báo cáo bài thật của người khác** — dùng bài/tài khoản test. ☐ Đạt ☐ Không đạt: ______
**Nút «Chặn người dùng» và «Tài khoản đã chặn» (Cài đặt) sẽ KHÔNG xuất hiện trên UAT/Play hôm nay** — chúng chỉ hiện khi server bật chặn người dùng (Phase 8: `P8_USER_BLOCKS` + migration `20260924_p8_user_blocks.sql`). Đó là đúng thiết kế, không phải lỗi. Ảnh giao diện chặn (dữ liệu giả, không gửi gì): `D:\TappyAI-backups\android-parity-evidence\ugc-2026-10-01\preview-*.png`.
