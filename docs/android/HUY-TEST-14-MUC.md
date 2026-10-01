# Anh test máy thật — MỘT vòng, 14 mục (bản CUỐI, 01/10)

Máy R58RC0V30BH, APK UAT `TappyAI-UAT-<SHA7>.apk` (xem báo cáo; app «TappyAI UAT», nói chuyện với uat.tappyai.com). Dùng tài khoản test, không dùng tài khoản thật quan trọng.
Mỗi mục: làm → **đạt = thấy gì** → ghi Đạt / Không đạt (+1 dòng nếu không).
Bản Play Internal (dùng www.tappyai.com — production) KHÔNG nằm trong vòng này.

**1. Zalo** — Tôi → «Đăng nhập để lưu lại» → «Tiếp tục với Zalo». Chrome sẽ hiện trang đăng nhập Vercel của UAT trước: đăng nhập Vercel, rồi đăng nhập Zalo.
Đạt = app tự mở lại, tab Tôi hiện tên/email của anh. ☐ Đạt ☐ Không đạt: ______

**2. Google** — «Tiếp tục với Google». Đạt = hiện bảng chọn tài khoản Google của hệ thống (không mở trình duyệt), chọn xong vào được app.
⚠️ Nếu báo «không có thông tin đăng nhập» / «No credentials available» = **thiếu khai báo SHA khoá ký trên Google Cloud, KHÔNG phải lỗi app.** APK UAT mang id `com.tappyai.app.staging`, ký bằng khoá debug của máy build:
SHA-1 `B1:90:A7:B0:F0:30:29:F7:AD:0E:7A:4C:F2:AE:FB:27:3F:02:54:2F` (SHA-256 `F8:D1:A4:AA:CC:A0:9A:EA:8E:84:83:55:27:C4:4D:BD:3F:C9:D1:D2:76:04:B5:A6:5A:22:5E:9F:D2:0F:3A:9F`).
Muốn Google chạy trên APK UAT: 🔐 Google Cloud Console → dự án `aerobic-lock-498409-u7` → APIs & Services → Credentials → Create credentials → OAuth client ID → Android → Package name `com.tappyai.app.staging` → SHA-1 ở trên → Create (chờ vài phút–vài giờ). Firebase hiện KHÔNG có vân tay nào cho các app Android. Tôi không xem được Credentials nên **chưa biết** client này đã có chưa.
☐ Đạt ☐ Không đạt ☐ Lỗi SHA (đúng như trên): ______

**3. Email** — nhập email + mật khẩu tài khoản test → Đăng nhập; rồi thử mật khẩu sai một lần.
Đạt = đúng thì vào app; sai thì chỉ báo «Email hoặc mật khẩu không đúng.» ☐ Đạt ☐ Không đạt: ______

**4. Link đăng nhập giả** — gửi cho mình (Zalo/tin nhắn) rồi bấm: `tappyai://auth-callback#access_token=x&refresh_token=y`
Đạt = app báo «Liên kết đăng nhập không hợp lệ hoặc đã hết hạn», vẫn giữ tài khoản cũ. ☐ Đạt ☐ Không đạt: ______

**5. Thẻ hỏi nhanh — 5 mảng** — Chat, gõ lần lượt (mỗi câu một cuộc chat mới): «quán phở ngon quận 1» · «tai nghe bluetooth dưới 1 triệu» · «tối nay có chỗ nào đi chơi ở sài gòn ko» · «vé máy bay đi Đà Nẵng» · «massage thư giãn ở quận 1».
Đạt = tiêu đề thẻ lần lượt là «Hôm nay ăn gì nhỉ?» · «Bạn đang tìm món gì?» · «Tìm gì cho bạn hôm nay?» · «Chuyến đi thế nào đây?» (vé máy bay có câu «Bay từ đâu?») · «Thư giãn kiểu nào hôm nay?». Chọn vài ô → «Tìm cho tôi» → Tappy trả lời; không thấy `**`, `[…]`. ☐ Đạt ☐ Không đạt: ______

**6. Nút đặt/mua + link** — trong câu trả lời tai nghe bấm «Tìm trên Lazada/Shopee»; trong câu trả lời ăn uống bấm «Xem bản đồ»; trong câu «Mình chọn: …» bấm tên.
Đạt = mở đúng trang sàn (qua link tappyai.com/go/at) / Google Maps đúng quán; tên «Mình chọn» là link bấm được. ☐ Đạt ☐ Không đạt: ______

**7. Kế hoạch** — «đi Đà Lạt 3 ngày 2 đêm, 2 người, 10 triệu» → trả lời thẻ → «Lên kế hoạch chi tiết».
Đạt = thẻ TAPPY PLAN hiện; mục chưa có giá ghi «chưa có giá — hỏi quán»; ảnh là ảnh giữ chỗ (bình thường). ☐ Đạt ☐ Không đạt: ______

**8. Chia sẻ kế hoạch** — trên thẻ kế hoạch bấm «Chia sẻ» → Zalo, rồi Facebook.
Đạt = bên nhận mở được link `/plan/…` đúng nội dung. ☐ Đạt ☐ Không đạt: ______

**9. Chia sẻ Khám phá** — Khám phá → một bài/clip → «Chia sẻ» → TikTok; rồi Zalo.
Đạt = TikTok nhận file (thẻ ảnh hoặc video của clip); Zalo nhận link bài. ☐ Đạt ☐ Không đạt: ______

**10. Camera / video** — đã đăng nhập, qua bước ngày sinh 18+ → Khám phá → nút «+» ở đầu trang (ô vuông bên trái ô tìm kiếm) → «Chia sẻ trải nghiệm…» → thêm 1 ảnh, rồi 1 clip ngắn → Đăng.
Đạt = bài hiện ở Hồ sơ và Khám phá; xem được cả ảnh lẫn video. ☐ Đạt ☐ Không đạt: ______

**11. Vị trí + bàn phím** — Chat → cho phép vị trí → «cà phê gần đây»; rồi gõ «phở bò» bằng bàn phím Telex.
Đạt = kết quả gần chỗ anh đứng; chữ Việt không mất dấu, không nhảy chữ. ☐ Đạt ☐ Không đạt: ______

**12. Nút Back** — Back hệ thống ở: một quán trong Khám phá, Cài đặt, thẻ đăng nhập, ngay sau khi chia sẻ.
Đạt = luôn về đúng màn trước; không thoát app giữa chừng; không vòng lặp. ☐ Đạt ☐ Không đạt: ______

**13. Đã lưu + Chính sách** — lưu 1 địa điểm và 1 bài → Tôi → cuộn tới hàng «Đã lưu» (hàng menu dưới «Lịch sử chat», không phải tab «Đã lưu» ở hồ sơ), thử lọc Địa điểm / Bài viết / Video. Rồi Tôi → Cài đặt → Chính sách bảo mật.
Đạt = lọc đúng; chính sách mở trang /privacy (UAT: qua trang Vercel trước) và có chữ OpenAI. ☐ Đạt ☐ Không đạt: ______

**14. Xoá tài khoản (theo hợp đồng CUỐI của web: xoá NGAY khi cờ BẬT; cờ TẮT chỉ gửi email)** — Tôi → Cài đặt → cuộn xuống mục «KHÁC» → hàng cuối, chữ thường, ô xám (không đỏ): «Yêu cầu xóa tài khoản». **Không gửi thư thật.**
Trên UAT hiện cờ TẮT ⇒ đạt = hộp «Yêu cầu xóa tài khoản?» (nói bộ phận hỗ trợ xác minh email) → «Tiếp tục» mở app email với thư soạn sẵn tới support@tappyai.com; không xoá gì, không đăng xuất. Bấm Hủy/Back để thoát.
(Khi cờ BẬT — chưa kiểm được trên UAT: hàng đổi tên «Xóa tài khoản» → gõ XÓA → «Xóa vĩnh viễn tài khoản» → màn «Tài khoản của bạn đã được xóa» → đăng xuất. KHÔNG làm trên tài khoản thật.) ☐ Đạt ☐ Không đạt: ______

Thêm nếu kịp — thông báo đẩy: đăng nhập, cho phép thông báo, nhờ Claude gửi 1 thông báo test. Đạt = máy rung/hiện thông báo, bấm vào mở đúng màn.
