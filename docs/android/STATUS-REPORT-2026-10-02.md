# Báo cáo tình trạng Android — 02/10/2026

Phiên ANDROID (`C:\wtandroid`, nhánh `android/parity-2026-09-28-step1`). Chỉ đọc lại git, tài liệu, kết quả test và ảnh đã có. Chưa push, chưa phát hành, không chạm production.

## A. ĐÃ LÀM XONG (có bằng chứng)

| Việc | Bằng chứng | Máy thật hay máy ảo |
|---|---|---|
| Lá chắn lừa đảo: ba trạng thái, không còn "An toàn", điểm số, "Độ tin cậy" | Commit `401a3e6`; test đơn vị xanh; chạy 21/21; đã mở xem ảnh 6 ca | Chỉ máy ảo. Bản ba trạng thái chưa chạy Lá chắn trên máy thật |
| Tin nhắn không còn AI (cờ tắt, mã cũ giữ lại) | `401a3e6`; test khoá cờ; ảnh không còn hộp "gửi AI" | Chỉ máy ảo |
| QR giải mã trên máy, không gửi ảnh đi; QR chữ, thanh toán, Wi-Fi chỉ nêu loại | `b084f4a`; chạy trên cả máy ảo và máy thật (bản trước ba trạng thái) | Máy ảo + máy thật (bản cũ) |
| Giao diện tối mặc định | `b084f4a`; ảnh trước (sáng) và sau (tối) trên điện thoại đặt chế độ sáng | Chỉ máy ảo |
| Chốt chặn production (bản debug, UAT không trỏ được production) | Commit `8088ab9` | Kiểm lúc build |
| Quay lại (nav-back) | Chạy trên máy thật với bản mới, 11/11 | Máy thật |
| Tuổi 18+, Gợi ý cho bạn, Deals, bật/tắt thông báo | Chạy trên máy thật với bản `1b12a7c`: 7/7, 9/9, 5/5, 5/5 (thông báo: server đổi đúng) | Máy thật |
| Báo cáo bài/clip, hộp quy tắc cộng đồng, chặn theo cờ máy chủ | Commit `684431f`; báo cáo OVERNIGHT 02/10 ghi đã chạy trên máy ảo | Chủ yếu máy ảo |
| Chạy giả lập ngẫu nhiên (monkey), kiểm bản thu nhỏ (R8) | Báo cáo OVERNIGHT: 0 sập; 19 luồng đạt | Máy ảo |
| AAB `1b12a7c` kiểm kỹ | Chữ ký khớp khoá upload; 12 quyền giống bản cũ (không thêm camera); quét 0 chuỗi UAT hay khoá bí mật | Kiểm file |

Test đơn vị Debug, Release và UAT đều xanh (hơn 1.050 test).

## B. ĐANG LÀM DỞ

| Việc | Kẹt ở đâu | Cần gì để xong |
|---|---|---|
| Chốt chữ Lá chắn | Chữ ba trạng thái là bản của Android theo lời anh | Phiên WEB: hợp đồng chữ cuối (nếu khác thì theo web) |
| Lý do kèm link đang bằng tiếng Anh ("Domain has no A record…") | Do server trả, app không dịch | Phiên WEB: trả lý do tiếng Việt |
| Chạy lại luồng chính bằng bản UAT | UAT web `9474f65` trượt | Phiên WEB: SHA mới (anh dán) |
| Hợp đồng báo cáo/chặn | App chạy theo cờ, chưa đối chiếu hợp đồng cuối | Phiên WEB: hợp đồng cuối + cờ production |
| Bộ test tự động trên máy thật (720×1600, Android 11) | Đã sửa cỡ màn hình và quyền; còn luồng share, composer, saved-onboarding, safety-report chưa chạy được | Việc của tôi; có thể anh bấm tay thay |

## C. CHƯA LÀM / CHƯA KIỂM

| Việc | Vì sao | Ai | Chặn release |
|---|---|---|---|
| Đăng nhập Zalo / Google thật | Cần tài khoản thật | Huy | CÓ (Google đang kẹt SHA, xem F) |
| Thẻ hỏi 5 mảng, kính cường lực, phim (5 link rạp), vé máy bay "Bay từ đâu?" trên máy thật | Luồng chat chưa cài chạy được trên máy thật. Phim 5 link đã thấy trên máy ảo; kính cường lực và vé máy bay: không có bằng chứng | Tôi, sau khi có SHA mới | CÓ (nên kiểm) |
| Chia sẻ, đăng ảnh/clip, hộp quy tắc cộng đồng trên máy thật | Bộ test chưa chạy được; máy ảo thì đạt trước đó | Tôi / Huy bấm tay | CÓ (UGC) |
| Chặn và báo cáo trên máy thật | Đã thấy menu hiện; chưa kiểm bài công khai | Tôi | CÓ |
| Xóa tài khoản kiểu mới (chỉ nhìn chữ) | Chưa chụp lại trên máy thật | Tôi | KHÔNG |
| Công tắc Giao diện Hệ thống/Sáng/Tối trong Cài đặt | Test đơn vị có; chưa chụp ảnh lần này | Tôi | KHÔNG |
| Quét QR bằng camera trực tiếp | Cần thêm quyền camera, để bản sau | Tôi | KHÔNG |
| App Links, nâng `activity-compose`, ảnh máy ảo API 26/36, 89 tình huống Phase 8 | Anh quyết để sau release | Tôi | KHÔNG |
| Đo tốc độ, căn 16 KB trên máy thật | Chỉ đo máy ảo | Tôi | KHÔNG |

Đang ẩn: nút chặn người dùng (chờ cờ máy chủ), huy hiệu Play, nhạc, AI phân tích tin nhắn (cờ tắt).

## D. TRẠNG THÁI BẢN BUILD

- **Bản đang giữ:** commit `1b12a7c`; AAB `D:\TappyAI-backups\TappyAI-release-vc11-1b12a7c.aab`; SHA-256 `bd0f659b205b9bdda94a234b39409a71f7c59f18e09ae6f21b3a4113ddfb15c6`; versionCode 11 / 1.0.0.
- **Mã mới nhất:** `88a4fef`, chỉ ở máy, chưa push.

| Điều anh đã quyết | Trong AAB đang giữ? |
|---|---|
| Lá chắn ba trạng thái, không "An toàn" | **KHÔNG** (có trong mã `401a3e6`, sau khi build AAB) |
| Ngừng AI phân tích tin nhắn | **KHÔNG** (AAB vẫn có hộp hỏi gửi AI) |
| Giao diện tối mặc định | CÓ |
| Báo cáo/chặn theo cờ máy chủ | CÓ |
| Đồng ý chia sẻ dữ liệu AI cho iOS, thumbnail qua máy chủ | Không thuộc Android, tôi không có bằng chứng |

**Cần build lại đúng một lần** (lý do: hai mục KHÔNG ở trên). Kèm đối chiếu chữ web cuối nếu có đổi.

**Bản KHÔNG dùng nữa:** `597698b`, `1b12a7c`, và mọi AAB cũ hơn. Các APK UAT `597698b` và `1b12a7c` cũng bỏ; máy thật hiện chạy bản UAT mới nhất từ mã `401a3e6`.

## E. PHỤ THUỘC

- **Từ phiên WEB:** SHA mới; chữ Lá chắn cuối; lý do link tiếng Việt; hợp đồng báo cáo/chặn; bật cờ production.
- **Từ Huy:** tự nói "OK release"; các việc ở F.
- **Chỉ kiểm được SAU khi production có Phase 7:** báo cáo/chặn thật, xóa tài khoản thật, thẻ hỏi mới. Tôi không chạm production. Bản UAT trỏ `uat.tappyai.com`; bản phát hành trỏ production (chưa có Phase 7).

## F. VIỆC HUY PHẢI TỰ LÀM

Tất cả chặn release (CÓ). Chỉ làm sau khi anh nói "OK release". Chi tiết từng ô: `docs/android/PLAY-CONSOLE-PASTE.md` mục E và H. Không có bằng chứng anh đã làm bước nào ở Play Console.

| # | Việc | Đăng nhập | Làm ở đâu và bước |
|---|---|---|---|
| 1 | Khai lại An toàn dữ liệu | Có | Play Console → Nội dung ứng dụng → An toàn dữ liệu → Quản lý → làm lại 5 bước theo bảng H1 |
| 2 | Nhóm tuổi | Có | Nội dung và đối tượng mục tiêu → bỏ 16–17, chỉ giữ 18+ → Lưu |
| 3 | IARC | Có | Mức phân loại nội dung → làm lại, chọn có nội dung người dùng tạo → Lưu |
| 4 | Ghi chú cho người xem xét | Có | Thông tin đăng nhập → dán mục D → Lưu |
| 5 | Quốc gia | Có | Phát hành công khai → tab Quốc gia/khu vực → chỉ Việt Nam |
| 6 | Tạo bản Sản xuất, tải AAB mới | Có | Tạo bản phát hành mới → tải AAB (sau khi build lại) → từng phần 10–20% |
| 7 | Gửi xem xét | Có | Nút cuối của Play; chỉ anh bấm |
| 8 | Sửa đăng nhập Google | Có (Google Cloud) | Làm theo mục G (xoá client trùng, tạo lại ở dự án `aerobic-lock-498409-u7`); anh nói đã giao phiên GCP |
| 9 | Test máy thật | Không | Làm theo `HUY-TEST-14-MUC.md`, đã thêm 6 mục Lá chắn |

Ngoài ra, phiên WEB phải sửa trang `/privacy` (còn 3 chỗ lệch với app); Play đối chiếu trang này với Data safety.

## G. RỦI RO LỚN NHẤT

1. Production chưa có Phase 7: bản phát hành có thể chạy lệch tính năng so với UAT.
2. Google Play có thể từ chối nếu Data safety hoặc trang chính sách quyền riêng tư lệch với app (UGC, ảnh gửi OpenAI).
3. Đăng nhập Google chưa sửa xong, bản phát hành có thể không đăng nhập Google được.
4. Máy thật mới chạy được ít luồng; Zalo và Google chưa từng chạy trên máy thật.
5. Chữ Lá chắn là bản của Android; có rủi ro pháp lý nếu lệch chữ web.

**Điều tự đoán chưa kiểm:** căn 16 KB trên máy thật; tốc độ khởi động trên máy thật; máy thật duy nhất là Android 11 (chưa thử Android 13 trở lên); production có nhận đúng các route Lá chắn hay không (không chạm production).

## H. KẾT LUẬN

**CHƯA sẵn sàng.** Còn thiếu: (1) SHA web mới và chữ Lá chắn cuối; (2) build lại AAB một lần; (3) chạy lại luồng chính trên UAT mới, gồm máy thật; (4) các việc Play Console của anh. Phần của tôi ước tính còn khoảng 4–5 giờ (đoán): build và kiểm AAB khoảng 1 giờ, chạy lại luồng và sửa bộ test máy thật 3–4 giờ, chưa kể thời gian chờ web.
