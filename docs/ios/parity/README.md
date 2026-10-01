# Ảnh ghép iOS ↔ Android (↔ web UAT) — build 98

Ảnh Android ở `D:\TappyAI-backups\android-parity-evidence\composites\…` đã có sẵn **web UAT đứng cạnh Android** (từ phiên Android, UAT 1e11b32, 28/09). Em ghép thêm **iOS (CI run 36898642964, build 98) bên trái**. Ảnh web/Android là của đợt 28/09, iOS là bản mới nhất; dữ liệu khác nhau (iOS: máy chủ giả dựng giống production hiện tại; web/Android: dữ liệu UAT) nên **số liệu khác là bình thường** — chỉ so bố cục, màu, cỡ chữ, bo góc.

| Tệp | Màn | Nhận xét khác biệt (A = lỗi iOS, B = server, C = thiếu) |
|---|---|---|
| `deals-ios-vs-android.png` | Ưu đãi | iOS dựng dữ liệu **như production hiện tại** (7 đối tác, `title` = tên, không logo): tên một lần, dòng phụ là mô tả, chip nền tảng cuộn được (**sửa A**). Web/Android UAT: không có ưu đãi (trống) + thẻ «Hỏi Tappy» nền xanh/tím. iOS tiêu đề thanh trên «Ưu đãi» (Android «Deal hôm nay», web «Deal hôm nay») — **khác chữ (A, mỹ thuật)**. Logo đối tác: chữ cái đầu vì server không gửi `logoImage` (**B/dữ liệu**). |
| `profile-owner-ios-vs-android.png` | Hồ sơ của mình | iOS: thẻ ảnh đại diện + tên + thống kê + «Chỉnh sửa hồ sơ» + tab Đã đăng/Đã chia sẻ/Đã lưu/Bị hạn chế, rồi 3 hàng + Cài đặt (Huy chọn gọn, khác Android/web 9 hàng phẳng). |
| `profile-visitor-ios-vs-android.png` | Trang cá nhân người khác | iOS: lưới 3 cột đều, tỉ lệ 3:4, bo góc, nút «Theo dõi» pill (**sửa A**). Còn khác: web/Android có **banner/ảnh bìa gradient** và avatar chữ cái tròn lớn, 4 chỉ số (Đang theo dõi, Người theo dõi, Bài viết, Lượt thích) + tên trên ảnh; iOS thống kê 3 số, nền đen phẳng, không bìa (server không trả `cover_url`, I5) — **C/B, mỹ thuật**. Tab «Chia sẻ» có số đếm ở web — iOS chưa. |

Ảnh iOS của các màn khác (chat, đăng nhập, Hồ sơ gọn, ScamShield, đồng ý AI, Cài đặt…) nằm trong artefact CI `ios-screenshots` (run 36898642964) — chưa có ảnh web/Android cùng màn để ghép, nên không ghép.
