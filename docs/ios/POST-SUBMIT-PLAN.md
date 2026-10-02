# Sau khi bấm «Submit for Review» — kế hoạch (iOS, 02/10/2026)

> **CHỜ Huy nói «OK release».** Đường release đang đóng băng (UAT web 9474f65 trượt). Tờ này chỉ để sẵn; chưa dùng.

Chữ thường, cho người không phải dân dev. «Ước lượng» = em suy từ kinh nghiệm chung, chưa thấy số thật của tài khoản anh.

## 1. Các trạng thái anh sẽ thấy trong App Store Connect

| Trạng thái | Nghĩa | Anh làm gì |
|---|---|---|
| Waiting for Review | xếp hàng | không làm gì; **không** sửa metadata/build nếu không cần (sẽ mất chỗ) |
| In Review | người duyệt đang dùng app (thường vài giờ, đôi khi 1–2 ngày — ước lượng) | điện thoại/email liên hệ phải bắt máy; **giữ production bật và tài khoản demo sống** |
| Pending Developer Release | **được duyệt**; vì chọn «Manually release» app CHƯA lên kệ | bấm «Release This Version» khi anh muốn (sau smoke production) |
| Ready for Sale | đã lên kệ | kiểm tải thử, theo dõi đánh giá |
| Metadata Rejected / Rejected | bị từ chối | xem mục 3 |
| Developer Rejected | anh tự rút | — |

Nếu quá 3 tuần chưa có kết quả (lưu ý của Huy: có thể mất đến 3 tuần nếu bị hỏi lại): dùng «Contact Us → Expedite request» **một lần**, nêu lý do thật.

## 2. Trong lúc chờ duyệt (anh/em làm gì)

- Giữ **production ổn định**: không tắt cờ `accountSelfDelete`, `p8.userBlocks`, `p8.reports`, Sign in with Apple; không đổi tài khoản demo; không xoá dữ liệu mẫu. Người duyệt chạy bản build **với production**.
- Theo dõi hộp thư `support@tappyai.com` và email liên hệ trong tờ khai: Apple có thể hỏi ngay trong Resolution Center hoặc email.
- Không đẩy build mới lên TestFlight rồi chọn lại cho bản đang duyệt (sẽ huỷ lượt duyệt). Sửa mã cho 1.0.1 để nhánh riêng.
- Soạn sẵn câu trả lời mẫu (mục 3).

## 3. Nếu bị từ chối (Resolution Center)

1. Đọc **nguyên văn** điều bị trích (số điều + lời Apple). Chụp màn hình.
2. Trả lời **trong Resolution Center** (không tạo bản ghi mới), ngắn, lịch sự, kèm **ảnh/clip quay màn hình** cho đúng chỗ Apple nói. Câu mẫu theo điều thường gặp:

| Điều | Apple thường hỏi | Câu trả lời mẫu (tiếng Anh) |
|---|---|---|
| 5.1.1(v) | không thấy xoá tài khoản | `Account deletion is in Profile → Settings → Other → Delete account. It starts inside the app and completes immediately. Screen recording attached.` |
| 1.2 | báo cáo/chặn/quy tắc/liên hệ | `Report/Block: "..." on any post, comment or profile. Blocked accounts: Settings → Blocked accounts. Community guidelines, moderation notices and Contact support are in Settings. Reports are handled within 24 hours. Recording attached.` |
| 4.8 | thiếu đăng nhập tương đương | `Sign in with Apple is the first option on the sign-in screen (limits data to name/email, supports private relay).` |
| 5.1.2(i) | chia sẻ dữ liệu với AI | `Before the first AI request a sheet names the provider (OpenAI), what is sent, why, and links the Privacy Policy; "Not now" sends nothing; it can be withdrawn in Settings → Share data with AI.` |
| 2.1(a) | không đăng nhập được | gửi tài khoản demo mới + xác nhận backend đang bật |
| 5.1.1(i) | chính sách riêng tư | link `/privacy` đang sống, nêu OpenAI/Supabase/Firebase/Serper, xoá dữ liệu |

3. Nếu lỗi nằm ở **cờ server** (ví dụ cờ tắt): bật cờ, rồi trả lời «đã bật, mời duyệt lại» — thường **không cần build mới**.
4. Nếu cần sửa **mã**: sửa trên nhánh, chạy CI (xanh + ảnh), TestFlight build mới, chọn build đó trong bản 1.0, **Submit lại**.
5. Mỗi lần bị từ chối: ghi lại điều + cách sửa vào `IOS-PROGRESS.md` để lần sau khỏi lặp.

## 4. Sau khi được duyệt

1. Smoke production lần cuối bằng đúng build đã duyệt (TestFlight/cài trên iPhone): đăng nhập, chat, Lá chắn, xoá tài khoản TEST.
2. Bấm «Release This Version».
3. 24 giờ đầu: xem crash (Xcode → Organizer → Crashes, hoặc App Store Connect → Analytics), đánh giá, email hỗ trợ.
4. Báo web/Android biết ngày lên kệ (liên kết cửa hàng, huy hiệu App Store trên web — việc của web).

## 5. Bản 1.0.1 và cập nhật

- Tăng `MARKETING_VERSION` trong `ios/project.yml` (1.0.1); số build lớn hơn mọi build đã tải.
- Chạy theo quy trình: sửa → CI xanh → ảnh → TestFlight → thử iPhone → chọn build → nộp (mỗi bản cũng qua duyệt, thường nhanh hơn bản đầu).
- **Không cần nộp lại** nếu chỉ đổi: cờ máy chủ, chữ trả về từ máy chủ, dữ liệu địa điểm/ưu đãi, nội dung trang web.
- **Phải nộp lại** nếu đổi: giao diện, chuỗi trong app, quyền, thư viện, dữ liệu bundle (ví dụ 25 tình huống Bộ Công an; bộ 89 tình huống Phase 8 vào app là một lần nộp).

## 6. Việc cần Huy (một chỗ)

Xem `docs/ios/IOS-PROGRESS.md` «Việc của Huy» và `docs/ios/MAC-DAY-CHECKLIST.md`.
