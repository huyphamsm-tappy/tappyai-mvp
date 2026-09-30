# Anh test máy thật — 14 mục (Android)

Máy: R58RC0V30BH. **Vòng 1** = bản UAT đang cài (`1.0.0-uat`, build `68d6639`, trỏ uat.tappyai.com).
**Vòng 2** = bản từ Play Internal testing (trỏ www.tappyai.com — production): chạy lại mục **1, 2, 3, 4, 7, 12** sau khi cài.
Dùng tài khoản test, không dùng tài khoản thật có dữ liệu quan trọng. Ghi **Đạt / Không đạt** + 1 dòng nếu không đạt.

**1. Zalo** — Tôi → Đăng nhập → «Tiếp tục với Zalo».
Trên UAT Chrome sẽ hiện trang đăng nhập Vercel trước: đăng nhập Vercel rồi làm tiếp. Đăng nhập Zalo xong, app tự mở lại.
Đạt = về app, tab Tôi hiện tên/email của anh. ☐ Đạt ☐ Không đạt: ______

**2. Google** — «Tiếp tục với Google».
Đạt = hiện bảng chọn tài khoản của hệ thống (không mở trình duyệt), chọn xong vào được app.
Lỗi "không có thông tin đăng nhập" = thiếu khai báo SHA khoá Play (báo Claude). ☐ Đạt ☐ Không đạt: ______

**3. Email** — nhập email + mật khẩu tài khoản test → Đăng nhập. Rồi thử mật khẩu sai một lần.
Đạt = đúng thì vào app; sai thì chỉ báo «Email hoặc mật khẩu không đúng.» ☐ Đạt ☐ Không đạt: ______

**4. Link đăng nhập giả** — nhờ ai đó (hoặc tự) gửi qua tin nhắn: `tappyai://auth-callback#access_token=x&refresh_token=y` rồi bấm vào.
Đạt = app báo «Liên kết đăng nhập không hợp lệ hoặc đã hết hạn», vẫn giữ tài khoản cũ. ☐ Đạt ☐ Không đạt: ______

**5. Chat + thẻ hỏi nhanh** — Chat → gõ «ăn phở Bắc tối nay» → chọn trong thẻ (3 câu) → «Tìm cho tôi».
Đạt = Tappy trả lời tiếp; không thấy `**`, `[…]`, chữ thô; «Mình chọn: …» là link bấm được. ☐ Đạt ☐ Không đạt: ______

**6. Nút đặt / mua** — hỏi «mua tai nghe chống ồn dưới 500k» → chọn thẻ → bấm «Tìm trên Lazada/Shopee». Rồi một câu ăn uống → «Bản đồ».
Đạt = mở đúng trang sàn (qua link tappyai.com/go/at) và Google Maps đúng quán. ☐ Đạt ☐ Không đạt: ______

**7. Kế hoạch** — hỏi «đi Đà Lạt 3 ngày 2 đêm, 2 người, 10 triệu» → trả lời thẻ → bấm «Lên kế hoạch chi tiết».
Đạt = thẻ TAPPY PLAN hiện; mục chưa có giá ghi «chưa có giá — hỏi quán»; ảnh là ảnh giữ chỗ (bình thường). ☐ Đạt ☐ Không đạt: ______

**8. Chia sẻ kế hoạch** — trên thẻ kế hoạch bấm «Chia sẻ» → chọn Zalo (rồi Facebook).
Đạt = bên nhận mở được link `/plan/…` đúng nội dung. ☐ Đạt ☐ Không đạt: ______

**9. Chia sẻ Khám phá** — Khám phá → một clip → nút chia sẻ → TikTok.
Đạt = TikTok nhận file (ảnh thẻ hoặc video của clip); Zalo/Facebook nhận link. ☐ Đạt ☐ Không đạt: ______

**10. Camera / video** — đã đăng nhập và qua bước ngày sinh 18+ → Khám phá → nút «+» ở đầu trang (ô vuông bên trái ô tìm kiếm) → «Chia sẻ trải nghiệm…» → thêm ảnh, rồi thêm 1 clip ngắn → Đăng.
Đạt = bài hiện ở Hồ sơ và Khám phá, xem được cả ảnh và video. ☐ Đạt ☐ Không đạt: ______

**11. Vị trí + bàn phím** — Chat → cho phép vị trí → gõ «cà phê gần đây», rồi gõ «phở bò» bằng bàn phím Telex.
Đạt = kết quả gần chỗ anh đứng; chữ tiếng Việt không mất dấu, không nhảy chữ. ☐ Đạt ☐ Không đạt: ______

**12. Nút Back** — bấm Back hệ thống ở: một quán trong Khám phá, Cài đặt, thẻ đăng nhập, sau khi chia sẻ.
Đạt = luôn về đúng màn trước, không thoát app giữa chừng, không vòng lặp. ☐ Đạt ☐ Không đạt: ______

**13. Đã lưu + Chính sách** — lưu 1 địa điểm và 1 bài → Tôi → cuộn tới hàng «Đã lưu» (hàng menu nằm dưới «Lịch sử chat», không phải tab «Đã lưu» ở hồ sơ), thử lọc Địa điểm / Bài viết / Video. Rồi Tôi → Cài đặt → Chính sách bảo mật.
Đạt = mục đã lưu hiện đúng bộ lọc; chính sách mở trang /privacy (trên UAT sẽ gặp trang đăng nhập Vercel trước). ☐ Đạt ☐ Không đạt: ______

**14. Yêu cầu xoá tài khoản** — Tôi → Cài đặt → cuộn xuống hàng đỏ «Yêu cầu xóa tài khoản» → Tiếp tục. **Không gửi thư thật.**
Đạt = hộp «Yêu cầu xóa tài khoản?» rồi mở app email với thư soạn sẵn tới support@tappyai.com (không xoá gì). Bấm Huỷ/Back thoát thư. ☐ Đạt ☐ Không đạt: ______

Thông báo đẩy (nếu kịp): đăng nhập, cho phép thông báo, nhờ Claude gửi 1 thông báo test → Đạt = máy rung/hiện thông báo, bấm vào mở đúng màn.
